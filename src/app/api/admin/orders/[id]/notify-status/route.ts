import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { apiSuccess, apiError } from '@/lib/api-response';
import { type OrderStatusForEmail } from '@/lib/email';
import { logEvent } from '@/lib/log';
import { enqueue } from '@/lib/jobs/queue';

/**
 * POST /api/admin/orders/[id]/notify-status
 *
 * Server-side trigger for admin-driven order status emails. Called
 * fire-and-forget from the admin order detail page after each
 * status change (confirm / ship / deliver / cancel).
 *
 *   - Authenticates the caller as an admin (same pattern as the
 *     existing `/api/admin/orders/[id]/ship` route): SSR cookie
 *     session must resolve to a row in `admin_users`.
 *   - The `status` to email about is read from the DB row, NOT from
 *     the request body. This makes the endpoint safe even if the
 *     client sends a stale or spoofed value: we email the truth.
 *   - Never throws to the client; never blocks: the email itself is
 *     dispatched fire-and-forget through `sendOrderStatusEmail`,
 *     which already swallows all send errors.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Admin auth — same SSR + admin_users pattern as the ship route.
    const serverSupabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await serverSupabase.auth.getUser();
    if (!user) return apiError(401, 'Unauthorized');

    const supabase = createAdminClient();

    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('id')
      .eq('id', user.id)
      .single();
    if (!adminUser) return apiError(401, 'Not admin');

    const { data: order, error } = await supabase
      .from('orders')
      .select(
        'id, order_number, customer, shipping_address, subtotal_paise, discount_paise, shipping_paise, cod_fee_paise, total_paise, payment_method, order_status',
      )
      .eq('id', id)
      .single();

    if (error || !order) return apiError(404, 'Order not found');

    const status = order.order_status as string;
    const allowed: OrderStatusForEmail[] = [
      'confirmed',
      'shipped',
      'delivered',
      'cancelled',
    ];
    if (!(allowed as string[]).includes(status)) {
      // Status is not one we email about (e.g. 'pending' or some
      // future value). Treat as a no-op success so the client's
      // fire-and-forget call still resolves cleanly.
      return apiSuccess({ skipped: true, reason: 'status_not_email_eligible' });
    }

    // Read every line from order_items. Migration 022 backfilled
    // legacy single-line orders so this query always returns >= 1
    // row for any orders.id that exists.
    const { data: itemRows } = await supabase
      .from('order_items')
      .select('product_name, size, quantity, unit_price_paise, subtotal_paise, image_url')
      .eq('order_id', order.id)
      .order('created_at', { ascending: true });

    const items = (itemRows ?? []).map((row) => ({
      name: (row as { product_name: string }).product_name,
      size: (row as { size: string }).size,
      quantity: (row as { quantity: number }).quantity,
      unit_price_paise: (row as { unit_price_paise: number }).unit_price_paise,
      subtotal_paise: (row as { subtotal_paise: number }).subtotal_paise,
      image_url: (row as { image_url: string | null }).image_url,
    }));
    const firstItem = items[0];

    // Durable enqueue. Idempotency key per (order, status) so a
    // re-fire from the admin UI for the same status is a no-op while
    // a genuine confirmed → shipped → delivered sequence enqueues
    // three distinct jobs.
    await enqueue({
      kind: 'email.order_status',
      idempotencyKey: `email.order_status.${order.id}.${status}`,
      payload: {
        order: {
          id: order.id,
          order_number: order.order_number,
          customer: order.customer,
          product_name: firstItem?.name || 'Product',
          size: firstItem?.size || '',
          quantity: firstItem?.quantity ?? 1,
          subtotal_paise: (order as { subtotal_paise?: number | null }).subtotal_paise,
          discount_paise: (order as { discount_paise?: number | null }).discount_paise,
          shipping_paise: (order as { shipping_paise?: number | null }).shipping_paise,
          cod_fee_paise: (order as { cod_fee_paise?: number | null }).cod_fee_paise,
          total_paise: order.total_paise,
          payment_method: order.payment_method,
          shipping_address: order.shipping_address,
          image_url: firstItem?.image_url ?? null,
          items,
        },
        status: status as OrderStatusForEmail,
      },
    }, supabase);

    logEvent('admin.order_status_email_enqueued', {
      order_id: order.id,
      order_number: order.order_number,
      status,
    });

    return apiSuccess({ dispatched: true, status });
  } catch (err) {
    logEvent('admin.notify_status_unhandled_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return apiError(500, 'Internal server error');
  }
}
