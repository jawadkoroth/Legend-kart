import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import ProductDetailClient, {
  type ProductDetail,
  type InventoryItem,
} from './ProductDetailClient';

export const dynamic = 'force-dynamic';

interface ProductRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_paise: number;
  sale_price_paise: number | null;
  images: unknown;
  sizes: unknown;
  is_active: boolean;
}

interface InventoryRow {
  size: string;
  stock: number;
}

/**
 * Server-rendered product detail.
 *
 * Fetches the single product by slug. There is no fallback to "first
 * product" and no `useEffect` round-trip — invalid or inactive slugs
 * trigger Next's `notFound()` which renders the framework 404 page.
 *
 * Total stock is computed by aggregating `inventory.stock` across all
 * sizes — never read from a non-existent `products.stock` column.
 */
export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: productRow } = await supabase
    .from('products')
    .select('id, name, slug, description, price_paise, sale_price_paise, images, sizes, is_active')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle<ProductRow>();

  if (!productRow) {
    notFound();
  }

  const { data: inventoryRows } = await supabase
    .from('inventory')
    .select('size, stock')
    .eq('product_id', productRow.id);

  const inventory: InventoryItem[] = (inventoryRows ?? []) as InventoryRow[];
  const totalStock = inventory.reduce((sum, row) => sum + (row.stock ?? 0), 0);

  // Coerce JSONB defensively so the client never has to.
  const product: ProductDetail = {
    id: productRow.id,
    name: productRow.name,
    slug: productRow.slug,
    description: productRow.description ?? '',
    price_paise: productRow.price_paise,
    sale_price_paise: productRow.sale_price_paise ?? null,
    images: Array.isArray(productRow.images) ? (productRow.images as string[]) : [],
    sizes: Array.isArray(productRow.sizes) ? (productRow.sizes as string[]) : [],
  };

  return (
    <ProductDetailClient
      product={product}
      inventory={inventory}
      totalStock={totalStock}
    />
  );
}
