import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/log';

/**
 * POST /api/payments/webhook
 *
 * Razorpay webhook receiver — the SERVER-OF-TRUTH for payment state.
 *
 * Contract:
 *   - Verifies `X-Razorpay-Signature` HMAC-SHA256 over the raw body
 *     using `RAZORPAY_WEBHOOK_SECRET`. Mismatch => 400, no DB write.
 *   - Handles `payment.captured` (=> payment_status='paid') and
 *     `payment.failed` (=> payment_status='failed' + restore stock).
 *   - Idempotent on every axis:
 *       * If `webhook_event_id` already matches the incoming event,
 *         the call is a 200 no-op.
 *       * If the order is already in the target terminal state, the
 *         call is a 200 no-op (we still record the event id).
 *   - Always returns 200 once the signature is valid; Razorpay treats
 *     non-2xx as a retry trigger and we don't want to amplify load
 *     for events we've already processed.
 *
 * `/api/payments/verify` (browser-driven) remains the fast UX path
 * for the success page; both routes converge on the same DB state
 * via a conditional UPDATE pattern, so neither can clobber the other.
 */

// Razorpay sends event payloads with the body bytes hashed; Next.js
// app router gives us the raw text via `req.text()`. We pin the
// runtime to nodejs because edge has no built-in `crypto`.
export const runtime = 'nodejs';

type RazorpayPaymentEntity = {
  id: string;
  order_id: string;
  status?: string;
  error_code?: string;
  error_description?: string;
};

type RazorpayEvent = {
  id: string;
  event: string;
  payload?: {
    payment?: { entity?: RazorpayPaymentEntity };
  };
};

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    logEvent('payment.webhook_misconfigured', {
      reason: 'RAZORPAY_WEBHOOK_SECRET missing',
    });
    // 500 so Razorpay retries once we configure the secret.
    return NextResponse.json(
      { success: false, error: 'Webhook not configured' },
      { status: 500 },
    );
  }

  // Raw body is REQUIRED for signature verification — never re-stringify.
  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature') || '';

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  if (!timingSafeEqualHex(expected, signature)) {
    logEvent('payment.webhook_bad_signature', {
      received_len: signature.length,
    });
    return NextResponse.json(
      { success: false, error: 'Invalid signature' },
      { status: 400 },
    );
  }

  let event: RazorpayEvent;
  try {
    event = JSON.parse(rawBody) as RazorpayEvent;
  } catch {
    logEvent('payment.webhook_bad_json', {});
    return NextResponse.json(
      { success: false, error: 'Invalid JSON' },
      { status: 400 },
    );
  }

  const eventId = event.id;
  const eventType = event.event;
  const payment = event.payload?.payment?.entity;

  logEvent('payment.webhook_received', {
    event_id: eventId,
    event_type: eventType,
    razorpay_order_id: payment?.order_id,
    razorpay_payment_id: payment?.id,
  });

  // Only react to events we model. Anything else is acknowledged
  // (200) so Razorpay stops retrying, and we log it for awareness.
  if (eventType !== 'payment.captured' && eventType !== 'payment.failed') {
    logEvent('payment.webhook_unhandled', { event_type: eventType });
    return NextResponse.json({ success: true, ignored: true });
  }

  if (!payment?.order_id || !payment.id || !eventId) {
    logEvent('payment.webhook_malformed', { event_type: eventType });
    // 200 because retrying won't fix a malformed event.
    return NextResponse.json({ success: true, ignored: true });
  }

  const supabase = createAdminClient();

  const { data: order, error: lookupError } = await supabase
    .from('orders')
    .select(
      'id, order_number, payment_status, webhook_event_id, product_id, size, quantity',
    )
    .eq('razorpay_order_id', payment.order_id)
    .single();

  if (lookupError || !order) {
    logEvent('payment.webhook_order_not_found', {
      razorpay_order_id: payment.order_id,
      event_id: eventId,
    });
    // 200 — we don't want Razorpay to retry forever for an order
    // that doesn't exist in our DB (e.g. a mis-routed event).
    return NextResponse.json({ success: true, ignored: true });
  }

  // Event-id dedupe: same delivery applied twice is a no-op.
  if (order.webhook_event_id === eventId) {
    logEvent('payment.webhook_noop', {
      reason: 'duplicate_event_id',
      order_id: order.id,
      event_id: eventId,
    });
    return NextResponse.json({ success: true, idempotent: true });
  }

  // State-based dedupe: if the order is already in the target
  // terminal state, this is a no-op apart from recording the event id.
  const targetStatus = eventType === 'payment.captured' ? 'paid' : 'failed';
  if (order.payment_status === targetStatus) {
    await supabase
      .from('orders')
      .update({ webhook_event_id: eventId })
      .eq('id', order.id);
    logEvent('payment.webhook_noop', {
      reason: 'already_in_target_state',
      order_id: order.id,
      event_id: eventId,
      payment_status: order.payment_status,
    });
    return NextResponse.json({ success: true, idempotent: true });
  }

  if (eventType === 'payment.captured') {
    // Conditional update: only flip from `pending` to `paid`. If
    // /api/payments/verify already raced us and won, the row is
    // already `paid` and we'd have short-circuited above; if it
    // landed between our two queries, the WHERE clause prevents a
    // double-write.
    const { error: updErr } = await supabase
      .from('orders')
      .update({
        payment_status: 'paid',
        razorpay_payment_id: payment.id,
        webhook_event_id: eventId,
      })
      .eq('id', order.id)
      .eq('payment_status', 'pending');

    if (updErr) {
      logEvent('payment.webhook_update_failed', {
        order_id: order.id,
        event_id: eventId,
        error: updErr.message,
      });
      // 500 so Razorpay retries — the DB error was transient.
      return NextResponse.json(
        { success: false, error: 'DB update failed' },
        { status: 500 },
      );
    }

    logEvent('payment.captured', {
      order_id: order.id,
      order_number: order.order_number,
      event_id: eventId,
    });
    return NextResponse.json({ success: true });
  }

  // payment.failed
  //
  // Tighten the predicate to `pending` (was `!= 'paid'`): the only
  // legal source state for `failed` is `pending`. `failed` and
  // `refunded` are already handled by the state-dedupe block above,
  // and `paid` must never be downgraded. `.select('id')` lets us
  // count the rows we actually mutated so stock restoration is
  // gated on a genuine pending → failed transition — closing the
  // race where /api/payments/verify flips the row to `paid`
  // between our SELECT (line 129) and UPDATE here.
  const { data: failedUpdatedRows, error: updErr } = await supabase
    .from('orders')
    .update({
      payment_status: 'failed',
      webhook_event_id: eventId,
    })
    .eq('id', order.id)
    .eq('payment_status', 'pending')
    .select('id');

  if (updErr) {
    logEvent('payment.webhook_update_failed', {
      order_id: order.id,
      event_id: eventId,
      error: updErr.message,
    });
    return NextResponse.json(
      { success: false, error: 'DB update failed' },
      { status: 500 },
    );
  }

  if (!failedUpdatedRows || failedUpdatedRows.length === 0) {
    // Concurrent writer (most likely /api/payments/verify) flipped
    // the row to `paid` between our SELECT and this UPDATE. Do NOT
    // restore stock — a paid order's inventory must stay
    // decremented. Stamp the event id so this exact delivery hits
    // the line-148 dedupe on retry instead of re-running this
    // branch.
    await supabase
      .from('orders')
      .update({ webhook_event_id: eventId })
      .eq('id', order.id);
    logEvent('payment.webhook_noop', {
      reason: 'state_changed_concurrently',
      order_id: order.id,
      event_id: eventId,
    });
    return NextResponse.json({ success: true, idempotent: true });
  }

  // Genuine pending → failed transition: restore stock exactly once.
  await supabase.rpc('restore_stock', {
    p_product_id: order.product_id,
    p_size: order.size,
    p_quantity: order.quantity,
  });

  logEvent('payment.failed', {
    order_id: order.id,
    order_number: order.order_number,
    event_id: eventId,
    error_code: payment.error_code,
  });

  return NextResponse.json({ success: true });
}
