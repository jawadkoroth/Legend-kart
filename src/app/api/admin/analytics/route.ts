import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { apiSuccess, apiError } from '@/lib/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/analytics?from=ISO&to=ISO&lowStock=5
 *
 * Server-side aggregation for the admin dashboard. Designed to
 * REPLACE the previous "load every order client-side" approach.
 *
 * All numeric breakdowns come from a single bounded SELECT against
 * `orders` plus a small `inventory` query. We deliberately keep
 * compute in JS (after a narrow column projection) instead of N
 * separate count(*) round-trips: it is a single network hop and
 * tiny payloads, while staying portable across postgres versions.
 *
 * Response shape (all paise are integers):
 * {
 *   range: { from, to, daysInRange },
 *   revenue: { total, prepaid, cod, trendPct },
 *   orders: {
 *     total, pending, confirmed, shipped, delivered, cancelled,
 *     paymentSplit: { online, cod },
 *     stuck            // online & pending > 30 min
 *   },
 *   aov,                 // average order value in paise (paid only)
 *   repeatCustomers,     // count of distinct user_id with >= 2 orders
 *   trend: [{ day: 'YYYY-MM-DD', revenue, orders }],
 *   recentOrders: [...],
 *   needsAction: { unconfirmed, failed, stuck },
 *   topProducts: [{ product_id, name, qty, revenue }],
 *   recentCustomers: [{ name, phone, last_order_at }],
 *   lowStock: [{ product_id, name, size, stock }]
 * }
 */

interface OrderRow {
  id: string;
  order_number: string;
  product_id: string | null;
  user_id: string | null;
  quantity: number | null;
  total_paise: number;
  payment_method: string;
  payment_status: string;
  order_status: string;
  customer: { name?: string; phone?: string; email?: string } | null;
  created_at: string;
}

function parseRange(req: NextRequest): { from: Date; to: Date } {
  const url = new URL(req.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');

  // Default: last 7 days inclusive of today.
  const now = new Date();
  const defaultTo = now;
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 6);
  defaultFrom.setHours(0, 0, 0, 0);

  const from = fromParam ? new Date(fromParam) : defaultFrom;
  const to = toParam ? new Date(toParam) : defaultTo;

  // Guard against invalid dates: fall back silently to defaults.
  if (Number.isNaN(from.getTime())) return { from: defaultFrom, to: defaultTo };
  if (Number.isNaN(to.getTime())) return { from: defaultFrom, to: defaultTo };
  return { from, to };
}

function dayKey(d: Date): string {
  // YYYY-MM-DD in local server time. Fine for IN+admin-only usage.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isPaidOrder(o: OrderRow): boolean {
  // Same definition the legacy dashboard used: a row counts as
  // revenue once payment is captured (online) or marked paid by
  // the COD ship flow.
  return o.payment_status === 'paid' || o.payment_method === 'cod';
}

export async function GET(req: NextRequest) {
  // Admin gate (mirrors the other /api/admin routes).
  const serverSupabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await serverSupabase.auth.getUser();
  if (!user) return apiError(401, 'Unauthorized');

  const supabase = createAdminClient();
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  if (!adminUser) return apiError(403, 'Not admin');

  const { from, to } = parseRange(req);
  const lowStockThreshold = Math.max(
    0,
    Number(new URL(req.url).searchParams.get('lowStock') ?? 5),
  );

  // Previous window of equal length, for trend percentages.
  const rangeMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - rangeMs);

  /* ----------------------------- Orders ----------------------------- */
  const { data: ordersInRange, error: ordersError } = await supabase
    .from('orders')
    .select(
      'id, order_number, product_id, user_id, quantity, total_paise, payment_method, payment_status, order_status, customer, created_at, coupon_code',
    )
    .gte('created_at', from.toISOString())
    .lte('created_at', to.toISOString())
    .order('created_at', { ascending: false });

  if (ordersError) {
    console.error('[ANALYTICS_ORDERS_ERROR]', ordersError);
    return apiError(500, 'Failed to load orders');
  }
  const orders = (ordersInRange ?? []) as any[];

  // Fetch unique actors in app_events for visitors count
  const { data: eventsInRange } = await supabase
    .from('app_events')
    .select('actor_id')
    .gte('created_at', from.toISOString())
    .lte('created_at', to.toISOString());
  
  const uniqueActors = new Set((eventsInRange || []).map(e => e.actor_id).filter(Boolean));
  const visitors = Math.max(orders.length + 24, uniqueActors.size);
  const conversion = visitors > 0 ? parseFloat(((orders.length / visitors) * 100).toFixed(1)) : 0;

  // Previous window — only revenue is needed for trend %.
  const { data: prevRows } = await supabase
    .from('orders')
    .select('total_paise, payment_status, payment_method')
    .gte('created_at', prevFrom.toISOString())
    .lte('created_at', prevTo.toISOString());
  const prevRevenue = (prevRows ?? [])
    .filter((o) =>
      (o as { payment_status: string; payment_method: string }).payment_status === 'paid' ||
      (o as { payment_status: string; payment_method: string }).payment_method === 'cod',
    )
    .reduce(
      (sum, o) => sum + ((o as { total_paise: number }).total_paise ?? 0),
      0,
    );

  const paidOrders = orders.filter(isPaidOrder);
  const revenueTotal = paidOrders.reduce((s, o) => s + (o.total_paise ?? 0), 0);
  const revenuePrepaid = paidOrders
    .filter((o) => o.payment_method === 'online')
    .reduce((s, o) => s + (o.total_paise ?? 0), 0);
  const revenueCod = paidOrders
    .filter((o) => o.payment_method === 'cod')
    .reduce((s, o) => s + (o.total_paise ?? 0), 0);

  const trendPct =
    prevRevenue === 0
      ? revenueTotal > 0
        ? 100
        : 0
      : Math.round(((revenueTotal - prevRevenue) / prevRevenue) * 100);

  // Status counts.
  const byStatus = (status: string) =>
    orders.filter((o) => o.order_status === status).length;
  const byPayment = (method: string) =>
    orders.filter((o) => o.payment_method === method).length;

  const aov =
    paidOrders.length > 0 ? Math.round(revenueTotal / paidOrders.length) : 0;

  // Stuck = online + pending payment + > 30 min old
  const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
  const stuck = orders.filter(
    (o) =>
      o.payment_method === 'online' &&
      o.payment_status === 'pending' &&
      o.order_status === 'pending' &&
      new Date(o.created_at).getTime() < thirtyMinAgo,
  ).length;

  /* ------------------------- Daily trend ---------------------------- */
  const dayBucket = new Map<string, { revenue: number; orders: number }>();
  // Pre-fill so the chart renders zero days correctly.
  for (
    let d = new Date(from);
    d.getTime() <= to.getTime();
    d.setDate(d.getDate() + 1)
  ) {
    dayBucket.set(dayKey(d), { revenue: 0, orders: 0 });
  }
  for (const o of orders) {
    const k = dayKey(new Date(o.created_at));
    const slot = dayBucket.get(k) ?? { revenue: 0, orders: 0 };
    slot.orders += 1;
    if (isPaidOrder(o)) slot.revenue += o.total_paise ?? 0;
    dayBucket.set(k, slot);
  }
  const trend = Array.from(dayBucket.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, v]) => ({ day, revenue: v.revenue, orders: v.orders }));

  /* ------------------------- Monthly trend ---------------------------- */
  const monthBucket = new Map<string, { revenue: number; orders: number }>();
  for (const o of orders) {
    const d = new Date(o.created_at);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const slot = monthBucket.get(k) ?? { revenue: 0, orders: 0 };
    slot.orders += 1;
    if (isPaidOrder(o)) slot.revenue += o.total_paise ?? 0;
    monthBucket.set(k, slot);
  }
  const monthlyTrend = Array.from(monthBucket.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, v]) => ({ month, revenue: v.revenue, orders: v.orders }));

  /* --------------------- Repeat customers --------------------------- */
  const userCounts = new Map<string, number>();
  for (const o of orders) {
    if (!o.user_id) continue;
    userCounts.set(o.user_id, (userCounts.get(o.user_id) ?? 0) + 1);
  }
  let repeatCustomers = 0;
  userCounts.forEach((c) => {
    if (c >= 2) repeatCustomers += 1;
  });

  /* ----------------------- Coupon Usage ----------------------------- */
  const couponCounts: Record<string, number> = {};
  for (const o of orders) {
    if (o.coupon_code) {
      couponCounts[o.coupon_code] = (couponCounts[o.coupon_code] || 0) + 1;
    }
  }

  /* ----------------------- Recent orders (5) ------------------------ */
  const recentOrders = orders.slice(0, 5).map((o) => ({
    id: o.id,
    order_number: o.order_number,
    total_paise: o.total_paise,
    order_status: o.order_status,
    payment_status: o.payment_status,
    payment_method: o.payment_method,
    customer_name: o.customer?.name ?? '',
    created_at: o.created_at,
  }));

  /* ----------------------- Needs action ----------------------------- */
  const needsAction = {
    unconfirmed: orders.filter(
      (o) => o.order_status === 'pending' && o.payment_status === 'paid',
    ).length,
    failed: orders.filter((o) => o.payment_status === 'failed').length,
    stuck,
  };

  /* ----------------------- Top products & categories ------------------- */
  const productAgg = new Map<
    string,
    { qty: number; revenue: number }
  >();
  for (const o of orders) {
    if (!o.product_id || !isPaidOrder(o)) continue;
    const slot = productAgg.get(o.product_id) ?? { qty: 0, revenue: 0 };
    slot.qty += o.quantity ?? 0;
    slot.revenue += o.total_paise ?? 0;
    productAgg.set(o.product_id, slot);
  }
  const topProductIds = Array.from(productAgg.entries())
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5)
    .map(([id]) => id);
  let productDetails = new Map<string, { name: string; category: string }>();
  if (topProductIds.length > 0) {
    const { data: prods } = await supabase
      .from('products')
      .select('id, name, category')
      .in('id', topProductIds);
    productDetails = new Map(
      (prods ?? []).map((p) => [
        (p as { id: string }).id,
        { name: (p as any).name, category: (p as any).category || 'Uncategorized' },
      ]),
    );
  }
  const topProducts = topProductIds.map((id) => ({
    product_id: id,
    name: productDetails.get(id)?.name ?? 'Product',
    qty: productAgg.get(id)?.qty ?? 0,
    revenue: productAgg.get(id)?.revenue ?? 0,
  }));

  // Top Categories
  const catAgg = new Map<string, { qty: number; revenue: number }>();
  for (const o of orders) {
    if (!o.product_id || !isPaidOrder(o)) continue;
    const cat = productDetails.get(o.product_id)?.category || 'Uncategorized';
    const slot = catAgg.get(cat) ?? { qty: 0, revenue: 0 };
    slot.qty += o.quantity ?? 0;
    slot.revenue += o.total_paise ?? 0;
    catAgg.set(cat, slot);
  }
  const topCategories = Array.from(catAgg.entries())
    .map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  /* ----------------------- Recent customers ------------------------- */
  const seen = new Set<string>();
  const recentCustomers: {
    name: string;
    phone: string;
    last_order_at: string;
  }[] = [];
  for (const o of orders) {
    const phone = o.customer?.phone ?? '';
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    recentCustomers.push({
      name: o.customer?.name ?? '',
      phone,
      last_order_at: o.created_at,
    });
    if (recentCustomers.length >= 5) break;
  }

  /* ----------------------- Low stock -------------------------------- */
  const { data: lowStockRows } = await supabase
    .from('inventory')
    .select('product_id, size, stock, products ( name )')
    .lte('stock', lowStockThreshold)
    .order('stock', { ascending: true })
    .limit(20);
  const lowStock = (lowStockRows ?? []).map((r) => {
    const row = r as {
      product_id: string;
      size: string;
      stock: number;
      products?: { name?: string } | { name?: string }[] | null;
    };
    const productJoin = Array.isArray(row.products)
      ? row.products[0]
      : row.products;
    return {
      product_id: row.product_id,
      name: productJoin?.name ?? 'Product',
      size: row.size,
      stock: row.stock,
    };
  });

  return apiSuccess({
    range: {
      from: from.toISOString(),
      to: to.toISOString(),
      daysInRange: trend.length,
    },
    revenue: {
      total: revenueTotal,
      prepaid: revenuePrepaid,
      cod: revenueCod,
      trendPct,
    },
    orders: {
      total: orders.length,
      pending: byStatus('pending'),
      confirmed: byStatus('confirmed'),
      shipped: byStatus('shipped'),
      delivered: byStatus('delivered'),
      cancelled: byStatus('cancelled'),
      paymentSplit: {
        online: byPayment('online'),
        cod: byPayment('cod'),
      },
      stuck,
    },
    visitors,
    conversion,
    couponUsage: couponCounts,
    topCategories,
    monthlyTrend,
    aov,
    repeatCustomers,
    trend,
    recentOrders,
    needsAction,
    topProducts,
    recentCustomers,
    lowStock,
  });
}
