import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiError } from '@/lib/api-response';

/**
 * GET /api/products — public catalogue.
 *
 * Edge-cached. The catalogue is the single highest-volume read in
 * the app (every homepage / product page hit) and changes
 * infrequently (admin edits, occasional new SKUs).
 *
 *   Cache-Control: public, s-maxage=30, stale-while-revalidate=120
 *
 * What this means in practice on Vercel:
 *   * The Vercel edge serves a cached response for up to 30s after
 *     the first miss. Repeat requests within that window never hit
 *     Supabase.
 *   * Between 30s and 150s the edge serves the stale response and
 *     revalidates in the background — no user ever waits on a
 *     cold fetch.
 *   * After 150s, the next request waits for a fresh fetch.
 *
 * Why 30s is acceptable for stock counts:
 *   The catalogue's stock numbers are ALWAYS advisory. Order
 *   placement re-checks under lock via `create_order_atomic`, and
 *   raises STOCK_UNAVAILABLE if the displayed count was stale. So
 *   the worst-case UX of edge caching is "buyer clicked size that
 *   ran out 25 seconds ago, sees 409 at checkout" — exactly the
 *   same outcome as a slow page-load on uncached data.
 *
 * `dynamic = 'force-dynamic'` is intentionally REMOVED: that flag
 * only governs build-time rendering, but it also disables Next's
 * default response caching heuristics. We want this route to be
 * dynamic at the FUNCTION level (always re-runs on a miss) but
 * cacheable at the EDGE level (HTTP semantics). Default behaviour
 * gives us exactly that.
 */

const CACHE_HEADER = 'public, s-maxage=30, stale-while-revalidate=120';

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

    // Fetch inventory for each product. One round trip with
    // .in() — no N+1.
    const productIds = products.map(p => p.id);
    const { data: inventory } = await supabase
      .from('inventory')
      .select('product_id, size, stock')
      .in('product_id', productIds);

    const productsWithInventory = products.map(p => ({
      ...p,
      inventory: (inventory || []).filter(i => i.product_id === p.id),
    }));

    return NextResponse.json(
      { success: true, products: productsWithInventory },
      {
        status: 200,
        headers: {
          'Cache-Control': CACHE_HEADER,
          // Echo the same as CDN-Cache-Control so providers that
          // honour the dedicated header (Vercel, Cloudflare) can't
          // be confused by an upstream stripping Cache-Control.
          'CDN-Cache-Control': CACHE_HEADER,
        },
      },
    );
  } catch (err) {
    console.error('[PRODUCTS_ERROR]', err);
    return apiError(500, 'Internal server error');
  }
}
