import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import ProductCard, { type ProductCardData } from '@/components/ProductCard';
import SortSelect, { type SortValue } from '@/components/SortSelect';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbLd, collectionLd } from '@/lib/seo/jsonLd';
import { BRAND, absoluteUrl, canonicalUrl } from '@/lib/seo/site';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

/**
 * Collection metadata. The canonical points at the unfiltered
 * listing so that every `?sort=` variant consolidates its ranking
 * signal to a single URL — this is how we avoid splitting authority
 * across sort permutations without having to `Disallow` them in
 * robots.txt.
 */
export const metadata: Metadata = {
  title: 'The Collection',
  description:
    'The full catalogue. Monochrome menswear in permanent black — shirts, trousers, and outerwear.',
  alternates: { canonical: canonicalUrl('/products') },
  openGraph: {
    type: 'website',
    url: canonicalUrl('/products'),
    title: `The Collection — ${BRAND.name}`,
    description:
      'The full catalogue. Monochrome menswear in permanent black.',
  },
};

const VALID_SORTS: SortValue[] = ['latest', 'price-asc', 'price-desc'];

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  price_paise: number;
  sale_price_paise: number | null;
  images: unknown;
  is_active: boolean;
  created_at: string;
}

interface InventoryRow {
  product_id: string;
  stock: number;
}

/**
 * Public product catalog.
 *
 * Server-rendered with `force-dynamic` so admin add/deactivate/delete
 * is reflected on the next navigation — no caching, no client refetch.
 *
 * Stock is computed *explicitly* by aggregating `inventory.stock` per
 * product. The `products` table has no stock column and we never
 * pretend it does.
 */
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const params = await searchParams;
  const sort: SortValue = VALID_SORTS.includes(params.sort as SortValue)
    ? (params.sort as SortValue)
    : 'latest';

  const supabase = await createServerSupabaseClient();

  // 1. Pull all active products with the ordering the user picked.
  // For 'latest' we let Postgres ORDER BY created_at (fast, index-backed).
  // For price sorts we fetch unordered then sort in the server component
  // using EFFECTIVE price = sale_price_paise ?? price_paise. The Supabase
  // JS client cannot express COALESCE() in .order(), and a DB-generated
  // column would require a migration. Since all active products are fetched
  // in a single query (no cursor pagination today), the server-side sort is
  // correct and O(n log n) on a small catalogue.
  let productsQuery = supabase
    .from('products')
    .select('id, slug, name, price_paise, sale_price_paise, images, is_active, created_at')
    .eq('is_active', true);

  if (sort === 'latest') {
    productsQuery = productsQuery.order('created_at', { ascending: false });
  }
  // price-asc / price-desc: fetch without DB ordering, sort below.

  const { data: productRows } = await productsQuery;
  let products = (productRows ?? []) as ProductRow[];

  const effectivePrice = (p: ProductRow) => p.sale_price_paise ?? p.price_paise;

  if (sort === 'price-asc') {
    products = products.slice().sort((a, b) => effectivePrice(a) - effectivePrice(b));
  } else if (sort === 'price-desc') {
    products = products.slice().sort((a, b) => effectivePrice(b) - effectivePrice(a));
  }

  // 2. Pull inventory for those product ids and aggregate explicitly.
  const ids = products.map(p => p.id);
  let stockByProduct = new Map<string, number>();

  if (ids.length > 0) {
    const { data: inventoryRows } = await supabase
      .from('inventory')
      .select('product_id, stock')
      .in('product_id', ids);

    for (const row of (inventoryRows ?? []) as InventoryRow[]) {
      stockByProduct.set(
        row.product_id,
        (stockByProduct.get(row.product_id) ?? 0) + (row.stock ?? 0),
      );
    }
  }

  // 3. Shape into card data. Coerce JSONB images defensively.
  const cards: ProductCardData[] = products.map(p => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    price_paise: p.price_paise,
    sale_price_paise: p.sale_price_paise,
    images: Array.isArray(p.images) ? (p.images as string[]) : [],
    totalStock: stockByProduct.get(p.id) ?? 0,
  }));

  const collectionUrl = canonicalUrl('/products');
  const featuredForSchema = cards.slice(0, 12).map((c) => ({
    name: c.name,
    url: absoluteUrl(`/product/${c.slug}`),
  }));

  return (
    <div className={styles.page}>
      <JsonLd
        data={breadcrumbLd([
          { name: 'Home', path: '/' },
          { name: 'The Collection', path: '/products' },
        ])}
      />
      <JsonLd
        data={collectionLd({
          name: 'The Collection',
          description:
            'Monochrome menswear in permanent black — shirts, trousers, and outerwear.',
          url: collectionUrl,
          items: featuredForSchema,
        })}
      />
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>The Collection</p>
          <h1 className={styles.title}>All Products</h1>
        </div>
        {cards.length > 0 && <SortSelect current={sort} />}
      </header>

      {cards.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>Nothing here yet</p>
          <p className={styles.emptyBody}>
            New pieces are being prepared. Please check back soon.
          </p>
        </div>
      ) : (
        <div className={styles.grid}>
          {cards.map(p => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
