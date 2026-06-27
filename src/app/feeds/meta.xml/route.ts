import type { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BRAND, SITE_URL, absoluteUrl } from '@/lib/seo/site';

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
  brand: string | null;
  google_product_category: string | null;
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
  return `${(paise / 100).toFixed(2)} ${BRAND.currency}`;
}

function buildMetaItem(row: FeedRow, stock: number): string {
  const url = `${SITE_URL}/product/${row.slug}`;
  const images = normaliseImages(row.images);
  const sizes = Array.isArray(row.sizes)
    ? row.sizes.filter((s): s is string => typeof s === 'string')
    : [];

  const description =
    stripHtml(row.description) ||
    `${row.name} — ${BRAND.description}`;

  const availability = stock > 0 ? 'in stock' : 'out of stock';
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
  parts.push(`<g:brand>${cdata(row.brand || BRAND.name)}</g:brand>`);
  
  parts.push(
    `<g:google_product_category>${xmlEscape(row.google_product_category || 'Apparel & Accessories > Clothing')}</g:google_product_category>`
  );

  parts.push('<g:gender>unisex</g:gender>');
  parts.push('<g:age_group>adult</g:age_group>');

  if (sizes.length > 0) {
    parts.push(`<g:size>${xmlEscape(sizes[0])}</g:size>`);
  }
  parts.push('</item>');
  return parts.join('');
}

export async function GET(_req: NextRequest) {
  const supabase = createAdminClient();

  const { data: productRows, error: productsError } = await supabase
    .from('products')
    .select(
      'id, slug, name, description, price_paise, sale_price_paise, images, sizes, is_active, brand, google_product_category, updated_at',
    )
    .eq('is_active', true)
    .limit(5000);

  if (productsError) {
    return new Response('Meta Feed error', { status: 500 });
  }
  const products = (productRows ?? []) as FeedRow[];

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

  const itemsXml = products
    .map((p) => buildMetaItem(p, stockByProduct.get(p.id) ?? 0))
    .join('');

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">' +
    '<channel>' +
    `<title>${cdata(BRAND.name + ' - Meta Catalog Feed')}</title>` +
    `<link>${xmlEscape(SITE_URL)}</link>` +
    `<description>${cdata('Product Catalog feed for Facebook Shops and Instagram Shopping')}</description>` +
    itemsXml +
    '</channel>' +
    '</rss>';

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
    },
  });
}
