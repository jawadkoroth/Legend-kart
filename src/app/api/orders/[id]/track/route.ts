import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiSuccess, apiError } from '@/lib/api-response';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { data: order, error } = await supabase
      .from('orders')
      .select('id, order_number, size, quantity, subtotal_paise, discount_paise, shipping_paise, cod_fee_paise, total_paise, payment_method, payment_status, order_status, customer, shipping_address, tracking_id, shipping_provider, created_at, updated_at, retry_count')
      .eq('id', id)
      .single();

    if (error || !order) {
      return apiError(404, 'Order not found');
    }

    // Also get product name
    const { data: orderFull } = await supabase
      .from('orders')
      .select('product_id')
      .eq('id', id)
      .single();

    let productName = '';
    if (orderFull) {
      const { data: product } = await supabase
        .from('products')
        .select('name')
        .eq('id', orderFull.product_id)
        .single();
      productName = product?.name || '';
    }

    return apiSuccess({
      order: { ...order, product_name: productName },
    });
  } catch (err) {
    console.error('[ORDER_TRACK_ERROR]', err);
    return apiError(500, 'Internal server error');
  }
}
