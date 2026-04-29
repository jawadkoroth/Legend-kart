import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiSuccess, apiError } from '@/lib/api-response';
import { verifyPaymentSignature } from '@/lib/razorpay';
import { logEvent } from '@/lib/log';

/**
 * POST /api/payments/verify
 *
 * Browser-driven fast path for the success page. Verifies the
 * client-supplied Razorpay signature and best-effort flips the
 * order to `paid` so the order detail page renders correctly
 * without waiting for the webhook.
 *
 * The Razorpay WEBHOOK is the source of truth (`/api/payments/webhook`);
 * this route is structured so it cannot conflict with it:
 *
 *   - We use a conditional UPDATE that only flips
 *     `pending → paid`. If the webhook already won, the row is
 *     already `paid`, our update affects 0 rows, and we still
 *     return success (the user's payment IS valid).
 *   - We never call `restore_stock` here. Stock restoration on
 *     payment failure is solely the webhook's job, so we can't
 *     race it into a double-restore.
 *   - On bad signature, we mark `failed` only if the row is still
 *     `pending` (so a paid-via-webhook row stays paid).
 */
export async function POST(req: NextRequest) {
  try {
    const { order_id, razorpay_payment_id, razorpay_signature } =
      await req.json();

    if (!order_id || !razorpay_payment_id || !razorpay_signature) {
      return apiError(400, 'Missing required fields');
    }

    const supabase = createAdminClient();

    // 1. Load the order. We need `razorpay_order_id` for signature
    // verification; everything else is for downstream UX (email).
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .single();

    if (error || !order) {
      return apiError(404, 'Order not found');
    }

    // 2. Already paid? Webhook beat us — that's the happy path,
    // not an error. Return success so the client routes to the
    // order page as usual.
    if (order.payment_status === 'paid') {
      logEvent('payment.verify_already_paid', {
        order_id: order.id,
        order_number: order.order_number,
      });
      return apiSuccess({ message: 'Payment already verified' });
    }

    // 3. Verify the signature.
    const isValid = verifyPaymentSignature(
      order.razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    );

    if (!isValid) {
      logEvent('payment.verify_bad_signature', {
        order_id: order.id,
        order_number: order.order_number,
      });
      // Only flip to `failed` if still `pending` — never downgrade
      // a paid-via-webhook row. We do NOT restore stock here; the
      // webhook owns that side of the lifecycle.
      await supabase
        .from('orders')
        .update({ payment_status: 'failed' })
        .eq('id', order_id)
        .eq('payment_status', 'pending');

      return apiError(400, 'Payment verification failed');
    }

    // 4. Conditional flip: only `pending → paid`. If the webhook
    // landed between step 2 and step 4, the WHERE clause keeps us
    // from clobbering its state.
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        payment_status: 'paid',
        razorpay_payment_id,
        razorpay_signature,
      })
      .eq('id', order_id)
      .eq('payment_status', 'pending');

    if (updateError) {
      logEvent('payment.verify_update_failed', {
        order_id: order.id,
        error: updateError.message,
      });
      return apiError(500, 'Failed to record payment');
    }

    logEvent('payment.verify_success', {
      order_id: order.id,
      order_number: order.order_number,
    });

    // 5. NO email send here.
    //
    // The Razorpay webhook is the single source of truth for
    // payment lifecycle email (`sendPaymentSuccessEmail` /
    // `sendPaymentFailedEmail`). Sending from this browser fast
    // path AND the webhook would risk a double-send on the
    // verify-vs-webhook race — the webhook arrives within seconds
    // anyway. The order-created email was already sent at
    // /api/orders, so the customer is not silent in the meantime.

    return apiSuccess({ message: 'Payment verified successfully' });
  } catch (err) {
    logEvent('payment.verify_unhandled_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return apiError(500, 'Internal server error');
  }
}
