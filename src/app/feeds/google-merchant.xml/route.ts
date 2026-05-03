import type { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BRAND, SITE_URL, absoluteUrl } from '@/lib/seo/site';

/**
 * Google Merchant Center — RSS 2.0 product feed.
 *
 * Serves at /feeds/google-merchant.xml.
 *
 *   - Ingested by Merchant Center in "scheduled fetch" mode.
 *   - Drives Google Shopping (organic + Performance Max ads) and
 *     image-search Shopping annotations.
 *   - Variant-less feed: we emit one <item> per active product,
 *     not per size, because sizes are handled as a single SKU with
 *     size information inside `product_detail`. If you later need
 *     per-size inventory (recommended once you have real GTINs),
 *     split here by (product × size) and key with `<id>` =
 *     `product_id:size`.
 *
 *   - `g:identifier_exists=no` is emitted when we have no GTIN/MPN.
 *     Do NOT invent a GTIN — that is an account-level policy
 *     violation.
 *
 * Response caching: 30 min at the edge. Merchant Center only
 * fetches every few hours; this prevents hot-path DB load when
 * the feed is crawled by generic bots.
 *
 * Excluded via robots.ts (`/feeds/`) so it doesn't pollute
 * general search. Google's Merchant Center bot ignores robots.txt
 * for feeds it's explicitly configured to fetch.
 */

// `force-dynamic` keeps the handler out of the build-time prerender
// phase (where the Supabase env vars may be absent in CI). Fresh
// data is served on each cold request; the `Cache-Control` headers
// below let Vercel's edge cache repeat hits for 30 minutes, which
// is the real hot path.
export const dynamic = 'force-dynamic';

interface FeedRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_paise: number;
  sale_price_paise: number | null;
  images: unknown;
  sizes: unknown;
  is_active: boolean;
  updated_at: string | null;
}

interface InventoryAggRow {
  product_id: string;
  stock: number;
}

const XML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

function xmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => XML_ENTITIES[c] ?? c);
}

function cdata(s: string): string {
  // CDATA cannot contain `]]>`. Split any occurrence across two
  // CDATA sections as recommended by the XML 1.0 spec.
  const safe = s.replace(/]]>/g, ']]]]><![CDATA[>');
  return `<![CDATA[${safe}]]>`;
}

function normaliseImages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
    .map((x) => absoluteUrl(x));
}

function stripHtml(s: string | null): string {
  if (!s) return '';
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rupees(paise: number): string {
  // Google expects "<amount> <currency>" e.g. "1299.00 INR".
  return `${(paise / 100).toFixed(2)} ${BRAND.currency}`;
}

function buildItem(row: FeedRow, stock: number): string {
  const url = `${SITE_URL}/product/${row.slug}`;
  const images = normaliseImages(row.images);
  const sizes = Array.isArray(row.sizes)
    ? row.sizes.filter((s): s is string => typeof s === 'string')
    : [];

  const description =
    stripHtml(row.description) ||
    `${row.name} — ${BRAND.description}`;

  const availability = stock > 0 ? 'in_stock' : 'out_of_stock';

  const price = rupees(row.price_paise);
  const salePrice =
    row.sale_price_paise && row.sale_price_paise < row.price_paise
      ? rupees(row.sale_price_paise)
      : null;

  const parts: string[] = [];
  parts.push('<item>');
  parts.push(`<g:id>${xmlEscape(row.id)}</g:id>`);
  parts.push(`<title>${cdata(row.name)}</title>`);
  parts.push(`<description>${cdata(description)}</description>`);
  parts.push(`<link>${xmlEscape(url)}</link>`);

  if (images[0]) {
    parts.push(`<g:image_link>${xmlEscape(images[0])}</g:image_link>`);
  }
  // Up to 10 additional images.
  for (const img of images.slice(1, 11)) {
    parts.push(
      `<g:additional_image_link>${xmlEscape(img)}</g:additional_image_link>`,
    );
  }

  parts.push(`<g:availability>${availability}</g:availability>`);
  parts.push(`<g:price>${xmlEscape(price)}</g:price>`);
  if (salePrice) {
    parts.push(`<g:sale_price>${xmlEscape(salePrice)}</g:sale_price>`);
  }
  parts.push('<g:condition>new</g:condition>');
  parts.push(`<g:brand>${cdata(BRAND.name)}</g:brand>`);

  // Required category taxonomy. "Apparel & Accessories > Clothing"
  // is the safest generic; refine per-product once we have a
  // products.google_category column.
  parts.push(
    '<g:google_product_category>Apparel &amp; Accessories &gt; Clothing</g:google_product_category>',
  );
  parts.push('<g:product_type>Apparel</g:product_type>');

  // We don't have GTINs yet — explicitly tell Google so the feed
  // isn't rejected.
  parts.push('<g:identifier_exists>no</g:identifier_exists>');

  parts.push('<g:gender>male</g:gender>');
  parts.push('<g:age_group>adult</g:age_group>');
  parts.push('<g:color>Black</g:color>');

  if (sizes.length > 0) {
    // Merchant Center accepts a single `<g:size>` or per-variant
    // entries. With a non-variant feed we emit a comma-list inside
    // `product_detail` so the value is queryable without duplicating
    // rows. The first size also populates `g:size` for compatibility.
    parts.push(`<g:size>${xmlEscape(sizes[0])}</g:size>`);
    parts.push(
      `<g:product_detail><g:section_name>Sizes</g:section_name>` +
      `<g:attribute_name>Available sizes</g:attribute_name>` +
      `<g:attribute_value>${xmlEscape(sizes.join(', '))}</g:attribute_value>` +
      `</g:product_detail>`,
    );
  }

  parts.push('</item>');
  return parts.join('');
}

export async function GET(_req: NextRequest) {
  const supabase = createAdminClient();

  // 1. Active products.
  const { data: productRows, error: productsError } = await supabase
    .from('products')
    .select(
      'id, slug, name, description, price_paise, sale_price_paise, images, sizes, is_active, updated_at',
    )
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(5000);

  if (productsError) {
    return new Response('Feed error', { status: 500 });
  }
  const products = (productRows ?? []) as FeedRow[];

  // 2. Aggregate inventory per product (sum of all sizes).
  const productIds = products.map((p) => p.id);
  const stockByProduct = new Map<string, number>();
  if (productIds.length > 0) {
    const { data: invRows } = await supabase
      .from('inventory')
      .select('product_id, stock')
      .in('product_id', productIds);
    for (const row of (invRows ?? []) as InventoryAggRow[]) {
      stockByProduct.set(
        row.product_id,
        (stockByProduct.get(row.product_id) ?? 0) + (row.stock ?? 0),
      );
    }
  }

  // 3. Build XML.
  const itemsXml = products
    .map((p) => buildItem(p, stockByProduct.get(p.id) ?? 0))
    .join('');

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">' +
    '<channel>' +
    `<title>${cdata(BRAND.name)}</title>` +
    `<link>${xmlEscape(SITE_URL)}</link>` +
    `<description>${cdata(BRAND.description)}</description>` +
    itemsXml +
    '</channel>' +
    '</rss>';

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
      'CDN-Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
    },
  });
}
