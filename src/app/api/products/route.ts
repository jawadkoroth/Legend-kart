import { createAdminClient } from '@/lib/supabase/admin';
import { apiSuccess, apiError } from '@/lib/api-response';

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[PRODUCTS_FETCH_ERROR]', error);
      return apiError(500, 'Failed to fetch products');
    }

    // Fetch inventory for each product
    const productIds = products.map(p => p.id);
    const { data: inventory } = await supabase
      .from('inventory')
      .select('product_id, size, stock')
      .in('product_id', productIds);

    const productsWithInventory = products.map(p => ({
      ...p,
      inventory: (inventory || []).filter(i => i.product_id === p.id),
    }));

    return apiSuccess({ products: productsWithInventory });
  } catch (err) {
    console.error('[PRODUCTS_ERROR]', err);
    return apiError(500, 'Internal server error');
  }
}
