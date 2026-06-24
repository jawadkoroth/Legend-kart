import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { MAX_QTY_PER_LINE } from '@/lib/validators';

/**
 * POST /api/cart/validate
 *
 * Re-checks live inventory + product activity for a list of cart
 * lines and returns a normalized result the client can apply via
 * `CartProvider.applyValidation`.
 *
 * The route is intentionally a pure read:
 *   - it never mutates the cart,
 *   - it never decrements inventory (that is `/api/orders`'s job under
 *     a transaction),
 *   - it never trusts `price_paise` from the client (price is read at
 *     order time from the products table; this route only reports
 *     stock and activity).
 *
 * It always returns 200 with a structured body — even when given zero
 * items — so the client can treat any non-200 strictly as a transport
 * failure and fall back to its snapshot data.
 */

export const dynamic = 'force-dynamic';

interface IncomingItem {
  product_id: string;
  size: string;
  quantity: number;
}

interface ValidationEntry {
  product_id: string;
  size: string;
  maxStock: number;
  clampedQuantity: number;
  removed: boolean;
}

function isIncoming(value: unknown): value is IncomingItem {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.product_id === 'string' &&
    v.product_id.length > 0 &&
    typeof v.size === 'string' &&
    v.size.length > 0 &&
    typeof v.quantity === 'number' &&
    Number.isFinite(v.quantity)
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  if (
    !body ||
    typeof body !== 'object' ||
    !Array.isArray((body as { items?: unknown }).items)
  ) {
    return NextResponse.json(
      { error: 'Body must be { items: [...] }' },
      { status: 400 },
    );
  }

  const rawItems = (body as { items: unknown[] }).items;
  const items: IncomingItem[] = rawItems.filter(isIncoming);

  if (items.length === 0) {
    return NextResponse.json({ items: [] }, { status: 200 });
  }

  const supabase = await createServerSupabaseClient();
  const productIds = Array.from(new Set(items.map(i => i.product_id)));

  const [productsRes, inventoryRes] = await Promise.all([
    supabase
      .from('products')
      .select('id, is_active')
      .in('id', productIds),
    supabase
      .from('inventory')
      .select('product_id, size, stock')
      .in('product_id', productIds),
  ]);

  if (productsRes.error || inventoryRes.error) {
    console.error(
      '[CART_VALIDATE_DB_ERROR]',
      productsRes.error ?? inventoryRes.error,
    );
    return NextResponse.json(
      { error: 'Inventory lookup failed' },
      { status: 500 },
    );
  }

  const activeById = new Map<string, boolean>();
  for (const row of productsRes.data ?? []) {
    activeById.set(row.id as string, Boolean(row.is_active));
  }

  const stockByKey = new Map<string, number>();
  for (const row of inventoryRes.data ?? []) {
    const key = `${row.product_id as string}::${row.size as string}`;
    stockByKey.set(key, Number(row.stock ?? 0));
  }

  const result: ValidationEntry[] = items.map(item => {
    const isActive = activeById.get(item.product_id) === true;
    const stock = stockByKey.get(`${item.product_id}::${item.size}`);
    // Removed when:
    //   - product is inactive or missing entirely, OR
    //   - no inventory row exists for this (product, size) pair.
    const removed = !isActive || stock === undefined;
    const maxStock = removed ? 0 : Math.max(0, stock);
    const requestedQty = Math.max(0, Math.floor(item.quantity));
    // Clamp to BOTH live stock and the per-line order cap, so a line the
    // server reports back can always pass orderItemSchema at checkout.
    const clampedQuantity = removed
      ? 0
      : Math.min(requestedQty, maxStock, MAX_QTY_PER_LINE);
    return {
      product_id: item.product_id,
      size: item.size,
      maxStock,
      clampedQuantity,
      removed,
    };
  });

  return NextResponse.json({ items: result }, { status: 200 });
}
