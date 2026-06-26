import type { Metadata } from 'next';
import Link from 'next/link';
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
  category: string | null;
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
  searchParams: Promise<{ sort?: string; page?: string; q?: string; category?: string }>;
}) {
  const params = await searchParams;
  const sort: SortValue = VALID_SORTS.includes(params.sort as SortValue)
    ? (params.sort as SortValue)
    : 'latest';
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
  const q = params.q?.trim() ?? '';
  const category = params.category?.trim() ?? '';

  const pageSize = 12;
  const offset = (page - 1) * pageSize;

  const supabase = await createServerSupabaseClient();

  // 1. Pull unique active categories dynamically
  const { data: allCatRows } = await supabase
    .from('products')
    .select('category')
    .eq('is_active', true);

  const categories = Array.from(
    new Set((allCatRows ?? []).map(r => r.category).filter((c): c is string => typeof c === 'string' && c.trim().length > 0))
  ).sort();

  // 2. Pull paged active products with filters and ordering.
  let productsQuery = supabase
    .from('products')
    .select('id, slug, name, price_paise, sale_price_paise, images, is_active, category, created_at', { count: 'exact' })
    .eq('is_active', true);

  if (category) {
    productsQuery = productsQuery.eq('category', category);
  }

  if (q) {
    productsQuery = productsQuery.ilike('name', `%${q}%`);
  }

  if (sort === 'latest') {
    productsQuery = productsQuery.order('created_at', { ascending: false });
  } else if (sort === 'price-asc') {
    productsQuery = productsQuery.order('price_paise', { ascending: true });
  } else if (sort === 'price-desc') {
    productsQuery = productsQuery.order('price_paise', { ascending: false });
  }

  productsQuery = productsQuery.range(offset, offset + pageSize - 1);

  const { data: productRows, count } = await productsQuery;
  const products = (productRows ?? []) as ProductRow[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // 3. Pull inventory for those product ids and aggregate explicitly.
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

  // 4. Shape into card data. Coerce JSONB images defensively.
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

  function buildFilterUrl(cat: string | null, searchQuery: string, sortVal: string, pageVal?: number) {
    const p = new URLSearchParams();
    if (cat) p.set('category', cat);
    if (searchQuery) p.set('q', searchQuery);
    if (sortVal && sortVal !== 'latest') p.set('sort', sortVal);
    if (pageVal && pageVal > 1) p.set('page', String(pageVal));
    const qs = p.toString();
    return qs ? `/products?${qs}` : '/products';
  }

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
        {total > 0 && <SortSelect current={sort} />}
      </header>

      <div className={styles.controls}>
        <div className={styles.searchAndSort}>
          <form action="/products" method="GET" style={{ width: '100%' }}>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search pieces..."
              className={styles.searchInput}
              aria-label="Search products"
            />
            {category && <input type="hidden" name="category" value={category} />}
            {sort !== 'latest' && <input type="hidden" name="sort" value={sort} />}
          </form>
        </div>

        {categories.length > 0 && (
          <div className={styles.categories}>
            <Link
              href={buildFilterUrl(null, q, sort)}
              className={`${styles.catPill} ${!category ? styles.catPillActive : ''}`}
            >
              All
            </Link>
            {categories.map(cat => (
              <Link
                key={cat}
                href={buildFilterUrl(cat, q, sort)}
                className={`${styles.catPill} ${category === cat ? styles.catPillActive : ''}`}
              >
                {cat}
              </Link>
            ))}
          </div>
        )}
      </div>

      {products.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>Nothing here yet</p>
          <p className={styles.emptyBody}>
            {q || category
              ? 'No products match your search or filter.'
              : 'New pieces are being prepared. Please check back soon.'}
          </p>
          {(q || category) && (
            <Link href="/products" className={styles.catPill} style={{ display: 'inline-block', marginTop: 16 }}>
              Clear Filters
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className={styles.grid}>
            {cards.map(p => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className={styles.pagination}>
              {page > 1 ? (
                <Link href={buildFilterUrl(category || null, q, sort, page - 1)} className={styles.pageBtn}>
                  ← Previous
                </Link>
              ) : (
                <span className={`${styles.pageBtn} ${styles.pageBtnDisabled}`}>
                  ← Previous
                </span>
              )}

              <span className={styles.pageInfo}>
                Page {page} of {totalPages}
              </span>

              {page < totalPages ? (
                <Link href={buildFilterUrl(category || null, q, sort, page + 1)} className={styles.pageBtn}>
                  Next →
                </Link>
              ) : (
                <span className={`${styles.pageBtn} ${styles.pageBtnDisabled}`}>
                  Next →
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

