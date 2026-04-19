import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { apiSuccess, apiError } from '@/lib/api-response';
import { getShippingProvider } from '@/lib/shipping';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 1. Verify admin
    const serverSupabase = await createServerSupabaseClient();
    const { data: { user } } = await serverSupabase.auth.getUser();
    if (!user) return apiError(401, 'Unauthorized');

    const supabase = createAdminClient();

    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('id')
      .eq('id', user.id)
      .single();
    if (!adminUser) return apiError(401, 'Not admin');

    // 2. Get order
    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (!order) return apiError(404, 'Order not found');
    if (order.order_status !== 'confirmed') return apiError(400, 'Order must be confirmed first');
    if (order.tracking_id) return apiError(400, 'Shipment already created');

    // 3. Get shipping settings
    const { data: settings } = await supabase
      .from('shipping_settings')
      .select('*')
      .single();

    if (!settings) return apiError(500, 'Shipping settings not configured');

    // 4. Get product info
    const { data: product } = await supabase
      .from('products')
      .select('name')
      .eq('id', order.product_id)
      .single();

    // 5. Create shipment
    const provider = getShippingProvider(settings.active_provider, settings.provider_config);

    const result = await provider.createShipment({
      order_number: order.order_number,
      customer: order.customer,
      address: order.shipping_address,
      product: {
        name: product?.name || 'Product',
        quantity: order.quantity,
        weight_grams: 300, // Configurable per product in future
      },
      payment: {
        method: order.payment_method === 'cod' ? 'cod' : 'prepaid',
        cod_amount_paise: order.payment_method === 'cod' ? order.total_paise : undefined,
      },
    });

    if (!result.success) {
      console.error('[SHIPPING_FAILED]', id, result.raw_response);
      return apiError(500, result.error || 'Shipment creation failed');
    }

    // 6. Update order with tracking info
    // Store both Supabase URL (when implemented) and original provider URL
    await supabase
      .from('orders')
      .update({
        tracking_id: result.tracking_id,
        label_url: result.label_url, // For now, use original URL directly
        label_url_original: result.label_url, // Backup
        shipping_provider: settings.active_provider,
        order_status: 'shipped',
      })
      .eq('id', id);

    console.log(`[SHIPMENT_CREATED] ${order.order_number} tracking: ${result.tracking_id}`);

    return apiSuccess({
      tracking_id: result.tracking_id,
      label_url: result.label_url,
    });
  } catch (err) {
    console.error('[SHIP_ERROR]', err);
    return apiError(500, 'Internal server error');
  }
}
