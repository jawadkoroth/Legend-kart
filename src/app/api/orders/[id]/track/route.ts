import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiSuccess, apiError } from '@/lib/api-response';
import { canAccessOrder } from '@/lib/orders/assertOrderAccess';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { data: order, error } = await supabase
      .from('orders')
      .select('id, user_id, order_number, subtotal_paise, discount_paise, shipping_paise, cod_fee_paise, total_paise, payment_method, payment_status, order_status, customer, shipping_address, tracking_id, shipping_provider, created_at, updated_at, retry_count')
      .eq('id', id)
      .single();

    if (error || !order) {
      return apiError(404, 'Order not found');
    }

    // IDOR gate: account orders are owner-only; guest orders stay
    // accessible by UUID. Respond 404 (not 403) so we never confirm the
    // existence of an order the caller may not see.
    if (!(await canAccessOrder(order.user_id))) {
      return apiError(404, 'Order not found');
    }

    // Multi-line aware (since phase B1). Every order has at least one
    // order_items row courtesy of the migration backfill, so a single
    // query covers both legacy single-line and new multi-line orders.
    const { data: itemRows } = await supabase
      .from('order_items')
      .select('product_id, product_name, size, quantity, unit_price_paise, subtotal_paise, image_url')
      .eq('order_id', id)
      .order('created_at', { ascending: true });

    const items = itemRows ?? [];
    const head = items[0];

    // Strip user_id from the wire response — it's an internal ownership
    // key, not something the tracking UI needs.
    const orderPublic: Record<string, unknown> = { ...order };
    delete orderPublic.user_id;

    return apiSuccess({
      order: {
        ...orderPublic,
        items,
        // Legacy display fallbacks — the existing /order/[id] UI
        // reads these for the (single-line) hero row. Multi-line
        // orders override that in the page using `items` directly.
        product_name: head?.product_name ?? '',
        size: head?.size ?? '',
        quantity: head?.quantity ?? 1,
      },
    });
  } catch (err) {
    console.error('[ORDER_TRACK_ERROR]', err);
    return apiError(500, 'Internal server error');
  }
}
