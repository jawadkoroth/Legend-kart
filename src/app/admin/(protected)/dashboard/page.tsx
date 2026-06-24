'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  RevenueTrendChart,
  OrderTrendChart,
  PaymentSplitBar,
} from '@/components/admin/DashboardCharts';
import { ADMIN_ORDER_CREATED_EVENT } from '@/components/admin/AdminRealtimeProvider';
import AdminWelcome from '@/components/admin/AdminWelcome';

type Preset = 'today' | 'yesterday' | '7d' | 'month' | 'custom';

interface Analytics {
  range: { from: string; to: string; daysInRange: number };
  revenue: { total: number; prepaid: number; cod: number; trendPct: number };
  orders: {
    total: number;
    pending: number;
    confirmed: number;
    shipped: number;
    delivered: number;
    cancelled: number;
    paymentSplit: { online: number; cod: number };
    stuck: number;
  };
  aov: number;
  repeatCustomers: number;
  trend: { day: string; revenue: number; orders: number }[];
  recentOrders: {
    id: string;
    order_number: string;
    total_paise: number;
    order_status: string;
    payment_status: string;
    payment_method: string;
    customer_name: string;
    created_at: string;
  }[];
  needsAction: { unconfirmed: number; failed: number; stuck: number };
  topProducts: {
    product_id: string;
    name: string;
    qty: number;
    revenue: number;
  }[];
  recentCustomers: {
    name: string;
    phone: string;
    last_order_at: string;
  }[];
  lowStock: {
    product_id: string;
    name: string;
    size: string;
    stock: number;
  }[];
}

interface TimelineItem {
  id: string;
  type: 'NEW_ORDER' | 'RETURN_REQUEST' | 'EXCHANGE_REQUEST' | 'DELIVERED' | 'ADMIN_NOTE';
  title: string;
  body: string;
  time: string;
  link: string;
  icon: string;
  color: string;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function presetRange(preset: Preset, customFrom?: string, customTo?: string) {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case '7d': {
      const f = new Date(now);
      f.setDate(f.getDate() - 6);
      return { from: startOfDay(f), to: endOfDay(now) };
    }
    case 'month': {
      const f = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: startOfDay(f), to: endOfDay(now) };
    }
    case 'custom': {
      const f = customFrom ? new Date(customFrom) : startOfDay(now);
      const t = customTo ? new Date(customTo) : endOfDay(now);
      return { from: startOfDay(f), to: endOfDay(t) };
    }
  }
}

const formatPrice = (paise: number) =>
  '₹' + (paise / 100).toLocaleString('en-IN');

const formatRelative = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
};

export default function AdminDashboard() {
  const [preset, setPreset] = useState<Preset>('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Operational Control Center States
  const [todayRevenue, setTodayRevenue] = useState<number>(0);
  const [todayOrders, setTodayOrders] = useState<number>(0);
  const [pendingShipments, setPendingShipments] = useState<number>(0);
  const [pendingReturns, setPendingReturns] = useState<number>(0);
  const [pendingExchanges, setPendingExchanges] = useState<number>(0);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);

  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const range = useMemo(
    () => presetRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  // Fetch range analytics (trends/split charts)
  const fetchAnalytics = useCallback(async () => {
    setError(null);
    try {
      const url = new URL('/api/admin/analytics', window.location.origin);
      url.searchParams.set('from', range.from.toISOString());
      url.searchParams.set('to', range.to.toISOString());
      const res = await fetch(url.toString(), { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'Failed to load analytics');
        return;
      }
      setData(json as Analytics);
    } catch (err) {
      console.error('[ANALYTICS_FETCH]', err);
      setError('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  // Fetch real-time operational dashboard (Today stats + return counts + timeline)
  const fetchOperationalCenter = useCallback(async () => {
    try {
      const supabase = createClient();

      // A. Today's Revenue and Orders
      const tNow = new Date();
      const tFrom = startOfDay(tNow).toISOString();
      const tTo = endOfDay(tNow).toISOString();
      const url = new URL('/api/admin/analytics', window.location.origin);
      url.searchParams.set('from', tFrom);
      url.searchParams.set('to', tTo);
      const res = await fetch(url.toString(), { cache: 'no-store' });
      const json = await res.json();
      if (json.success) {
        setTodayRevenue(json.revenue.total);
        setTodayOrders(json.orders.total);
      }

      // B. Pending Shipments (confirmed but not yet shipped/delivered)
      const { count: sCount } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('order_status', 'confirmed');
      setPendingShipments(sCount ?? 0);

      // C. Returns Pending
      const { count: rCount } = await supabase
        .from('return_requests')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'return')
        .in('status', ['requested', 'under_review']);
      setPendingReturns(rCount ?? 0);

      // D. Exchanges Pending
      const { count: eCount } = await supabase
        .from('return_requests')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'exchange')
        .in('status', ['requested', 'under_review']);
      setPendingExchanges(eCount ?? 0);

      // E. Timeline (Recent Notifications & Activities)
      setTimelineLoading(true);
      
      const { data: rawOrders } = await supabase
        .from('orders')
        .select('id, order_number, customer, total_paise, created_at')
        .order('created_at', { ascending: false })
        .limit(6);

      const { data: rawReturns } = await supabase
        .from('return_requests')
        .select('id, order_id, type, status, reason, created_at, orders(order_number)')
        .order('created_at', { ascending: false })
        .limit(6);

      const { data: rawNotes } = await supabase
        .from('admin_notes')
        .select('id, order_id, admin_email, content, created_at, orders(order_number)')
        .order('created_at', { ascending: false })
        .limit(6);

      const { data: rawDeliveries } = await supabase
        .from('shipment_status_history')
        .select('id, shipment_id, created_at, shipments(order_id, orders(order_number, customer))')
        .eq('next_status', 'delivered')
        .order('created_at', { ascending: false })
        .limit(6);

      // Transform and combine
      const timelineItems: TimelineItem[] = [];

      (rawOrders || []).forEach(o => {
        timelineItems.push({
          id: `order-${o.id}`,
          type: 'NEW_ORDER',
          title: 'New Order Received',
          body: `${o.customer?.name || 'Guest'} placed order ${o.order_number} · ${formatPrice(o.total_paise)}`,
          time: o.created_at,
          link: `/admin/orders/${o.id}`,
          icon: '💰',
          color: '#4CAF50'
        });
      });

      (rawReturns || []).forEach(r => {
        const isExchange = r.type === 'exchange';
        const orderNum = (r.orders as any)?.order_number || '';
        timelineItems.push({
          id: `return-${r.id}`,
          type: isExchange ? 'EXCHANGE_REQUEST' : 'RETURN_REQUEST',
          title: isExchange ? 'Exchange Requested' : 'Return Requested',
          body: `Order ${orderNum}: ${r.reason}`,
          time: r.created_at,
          link: `/admin/orders/${r.order_id}`,
          icon: isExchange ? '🔀' : '🔄',
          color: isExchange ? '#2196F3' : '#FF9800'
        });
      });

      (rawNotes || []).forEach(n => {
        const orderNum = (n.orders as any)?.order_number || '';
        timelineItems.push({
          id: `note-${n.id}`,
          type: 'ADMIN_NOTE',
          title: 'Internal Admin Note',
          body: `${n.admin_email?.split('@')[0] || 'System'}: ${n.content} on order ${orderNum}`,
          time: n.created_at,
          link: `/admin/orders/${n.order_id}`,
          icon: '📝',
          color: '#D4AF37'
        });
      });

      (rawDeliveries || []).forEach(d => {
        const shipmentData = d.shipments as any;
        const orderData = shipmentData?.orders as any;
        const orderNum = orderData?.order_number || '';
        const custName = orderData?.customer?.name || 'Guest';
        timelineItems.push({
          id: `delivery-${d.id}`,
          type: 'DELIVERED',
          title: 'Shipment Delivered',
          body: `Order ${orderNum} delivered to ${custName}`,
          time: d.created_at,
          link: `/admin/orders/${shipmentData?.order_id || ''}`,
          icon: '📦',
          color: '#00E676'
        });
      });

      const sorted = timelineItems
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
        .slice(0, 10);

      setTimeline(sorted);
    } catch (e) {
      console.error('[OPERATIONAL_CENTER_FETCH_FAILED]', e);
    } finally {
      setTimelineLoading(false);
    }
  }, []);

  // Initial loads
  useEffect(() => {
    setLoading(true);
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => {
      fetchAnalytics();
      fetchOperationalCenter();
    }, 200);
    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
    };
  }, [fetchAnalytics, fetchOperationalCenter]);

  // Realtime: Listen for new orders / update events
  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | null = null;
    const onOrder = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        fetchAnalytics();
        fetchOperationalCenter();
      }, 800);
    };
    window.addEventListener(ADMIN_ORDER_CREATED_EVENT, onOrder);
    return () => {
      window.removeEventListener(ADMIN_ORDER_CREATED_EVENT, onOrder);
      if (pending) clearTimeout(pending);
    };
  }, [fetchAnalytics, fetchOperationalCenter]);

  return (
    <div style={{ paddingBottom: '32px' }}>
      {/* Personalized Admin Welcome */}
      <AdminWelcome />

      {/* ─── PHASE 4 REDESIGN: OPERATIONAL CONTROL CENTER ─── */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <span style={{ fontSize: '1.5rem' }}>⚡</span>
          <h2 style={{
            fontSize: '1.2rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
            margin: 0,
            textTransform: 'uppercase',
            color: 'var(--gold, #D4AF37)',
            fontFamily: 'var(--font-serif, serif)'
          }}>
            Operations Control Center
          </h2>
        </div>

        {/* Large, Touch-Friendly Metrics Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          marginBottom: '20px'
        }}>
          {/* Today's Revenue */}
          <div style={cardStyle('linear-gradient(135deg, rgba(212, 175, 55, 0.15) 0%, rgba(18, 18, 18, 0.85) 100%)', 'rgba(212, 175, 55, 0.25)')}>
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>💰</div>
            <div style={cardLabelStyle}>Today's Revenue</div>
            <div style={cardValueStyle}>{formatPrice(todayRevenue)}</div>
          </div>

          {/* Today's Orders */}
          <div style={cardStyle('linear-gradient(135deg, rgba(76, 175, 80, 0.12) 0%, rgba(18, 18, 18, 0.85) 100%)', 'rgba(76, 175, 80, 0.2)')}>
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>📦</div>
            <div style={cardLabelStyle}>Today's Orders</div>
            <div style={cardValueStyle}>{todayOrders}</div>
          </div>

          {/* Pending Shipments */}
          <div style={cardStyle('linear-gradient(135deg, rgba(33, 150, 243, 0.12) 0%, rgba(18, 18, 18, 0.85) 100%)', 'rgba(33, 150, 243, 0.2)')}>
            <Link href="/admin/orders?filter=confirmed" style={{ textDecoration: 'none', color: 'inherit', display: 'block', width: '100%', height: '100%' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🚚</div>
              <div style={cardLabelStyle}>Pending Shipments</div>
              <div style={cardValueStyle}>{pendingShipments}</div>
            </Link>
          </div>

          {/* Returns Pending */}
          <div style={cardStyle('linear-gradient(135deg, rgba(255, 152, 0, 0.12) 0%, rgba(18, 18, 18, 0.85) 100%)', 'rgba(255, 152, 0, 0.2)')}>
            <Link href="/admin/orders" style={{ textDecoration: 'none', color: 'inherit', display: 'block', width: '100%', height: '100%' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🔄</div>
              <div style={cardLabelStyle}>Returns Pending</div>
              <div style={cardValueStyle}>{pendingReturns}</div>
            </Link>
          </div>

          {/* Exchange Requests */}
          <div style={cardStyle('linear-gradient(135deg, rgba(156, 39, 176, 0.12) 0%, rgba(18, 18, 18, 0.85) 100%)', 'rgba(156, 39, 176, 0.2)')}>
            <Link href="/admin/orders" style={{ textDecoration: 'none', color: 'inherit', display: 'block', width: '100%', height: '100%' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🔀</div>
              <div style={cardLabelStyle}>Exchanges Pending</div>
              <div style={cardValueStyle}>{pendingExchanges}</div>
            </Link>
          </div>
        </div>
      </div>

      {/* Needs action warnings banner */}
      {data && data.orders.stuck > 0 && (
        <div className="warning-banner" style={{ marginBottom: '24px', background: 'rgba(244, 67, 54, 0.12)', border: '1px solid rgba(244, 67, 54, 0.3)', padding: '12px 16px', borderRadius: '12px', color: '#FF7675', display: 'flex', alignItems: 'center' }}>
          <span>⚠ {data.orders.stuck} stuck online order{data.orders.stuck > 1 ? 's' : ''} (&gt;30m delay)</span>
          <Link
            href="/admin/orders?filter=stuck"
            style={{
              marginLeft: 'auto',
              textDecoration: 'underline',
              fontSize: '0.8rem',
              color: '#FF7675',
              fontWeight: 600
            }}
          >
            Review Stuck
          </Link>
        </div>
      )}

      {/* Split Feeds: Recent Orders & Unified Activity Timeline */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
        gap: '20px',
        marginBottom: '28px'
      }}>
        {/* Left Col: Recent Orders */}
        <div style={feedCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={feedTitleStyle}>Recent Orders</h3>
            <Link href="/admin/orders" style={viewAllLinkStyle}>View all →</Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {loading && !data && (
              <div style={{ color: '#8A8A8A', fontSize: '0.85rem', textAlign: 'center', padding: '24px 0' }}>
                Loading recent orders...
              </div>
            )}
            {data?.recentOrders.map((o) => (
              <Link key={o.id} href={`/admin/orders/${o.id}`} style={touchOrderCardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', fontFamily: 'var(--font-mono, monospace)', color: '#FFF' }}>
                    {o.order_number}
                  </span>
                  <span style={badgeStyle(o.order_status)}>{o.order_status.toUpperCase()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#AAA' }}>
                  <span>{o.customer_name || 'Guest'} · {o.payment_method.toUpperCase()}</span>
                  <span style={{ fontWeight: 600, color: 'var(--gold, #D4AF37)' }}>{formatPrice(o.total_paise)}</span>
                </div>
              </Link>
            ))}
            {data && data.recentOrders.length === 0 && (
              <div style={{ color: '#8A8A8A', fontSize: '0.85rem', textAlign: 'center', padding: '24px 0' }}>
                No recent orders found.
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Recent Notifications Timeline */}
        <div style={feedCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={feedTitleStyle}>Recent Notifications</h3>
            <span style={{ fontSize: '0.7rem', color: '#8A8A8A', fontWeight: 600 }}>REAL-TIME UPDATES</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative' }}>
            {timelineLoading && timeline.length === 0 ? (
              <div style={{ color: '#8A8A8A', fontSize: '0.85rem', textAlign: 'center', padding: '24px 0' }}>
                Loading activities feed...
              </div>
            ) : (
              timeline.map((item, idx) => (
                <Link key={item.id} href={item.link} style={{
                  display: 'flex',
                  gap: '12px',
                  textDecoration: 'none',
                  color: 'inherit',
                  padding: '8px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  transition: 'background 200ms ease',
                  border: '1px solid rgba(255,255,255,0.03)'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'; }}
                >
                  {/* Timeline Badge */}
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: `${item.color}15`,
                    border: `1px solid ${item.color}40`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
                    flexShrink: 0
                  }}>
                    {item.icon}
                  </div>

                  {/* Timeline Content */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#FFF' }}>{item.title}</span>
                      <span style={{ fontSize: '0.65rem', color: '#8A8A8A' }}>{formatRelative(item.time)}</span>
                    </div>
                    <span style={{
                      fontSize: '0.75rem',
                      color: '#AAA',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {item.body}
                    </span>
                  </div>
                </Link>
              ))
            )}
            {timeline.length === 0 && !timelineLoading && (
              <div style={{ color: '#8A8A8A', fontSize: '0.85rem', textAlign: 'center', padding: '24px 0' }}>
                No recent notifications/activities logged.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── HISTORICAL ANALYTICS & TRENDS ─── */}
      <div style={{
        background: 'rgba(12, 12, 12, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '16px',
        padding: '20px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          gap: '12px',
          flexWrap: 'wrap',
        }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#FFF', margin: 0 }}>Analytics Insights</h3>
            <span style={{ fontSize: '0.75rem', color: '#8A8A8A' }}>Review historical performance trends</span>
          </div>
          <FilterPills
            preset={preset}
            onChange={(p) => setPreset(p)}
            customFrom={customFrom}
            customTo={customTo}
            setCustomFrom={setCustomFrom}
            setCustomTo={setCustomTo}
          />
        </div>

        {error && (
          <div style={{ marginBottom: '16px', color: '#FF7675', fontSize: '0.85rem' }}>⚠ {error}</div>
        )}

        {/* Metric Cards Row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '12px',
          marginBottom: '20px'
        }}>
          <MetricCard
            label="Period Revenue"
            value={loading || !data ? '—' : formatPrice(data.revenue.total)}
            accent="success"
            trend={
              data
                ? { pct: data.revenue.trendPct, label: 'vs prev period' }
                : undefined
            }
            loading={loading}
          />
          <MetricCard
            label="Total Orders"
            value={loading || !data ? '—' : String(data.orders.total)}
            loading={loading}
          />
          <MetricCard
            label="AOV"
            value={loading || !data ? '—' : formatPrice(data.aov)}
            loading={loading}
          />
          <MetricCard
            label="Repeat Customers"
            value={loading || !data ? '—' : String(data.repeatCustomers)}
            loading={loading}
          />
        </div>

        {/* Split Charts */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '16px',
        }}>
          <ChartCard title="Revenue Trend">
            {data ? <RevenueTrendChart data={data.trend} /> : <ChartSkeleton />}
          </ChartCard>
          <ChartCard title="Orders Trend">
            {data ? <OrderTrendChart data={data.trend} /> : <ChartSkeleton />}
          </ChartCard>
          <ChartCard title="Payment Gateway Split">
            {data ? (
              <div style={{ paddingTop: 8 }}>
                <PaymentSplitBar
                  online={data.orders.paymentSplit.online}
                  cod={data.orders.paymentSplit.cod}
                />
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '12px',
                  fontSize: '0.7rem',
                  color: '#8A8A8A',
                }}>
                  <span>Online: {formatPrice(data.revenue.prepaid)}</span>
                  <span>COD: {formatPrice(data.revenue.cod)}</span>
                </div>
              </div>
            ) : (
              <ChartSkeleton />
            )}
          </ChartCard>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Styling Configurations ─────────────── */

const cardStyle = (background: string, borderColor: string): React.CSSProperties => ({
  background,
  border: `1px solid ${borderColor}`,
  borderRadius: '16px',
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  minHeight: '110px',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
  cursor: 'pointer',
  transition: 'transform 150ms ease, box-shadow 150ms ease',
});

const cardLabelStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#AAA',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  marginBottom: '4px'
};

const cardValueStyle: React.CSSProperties = {
  fontSize: '1.25rem',
  fontWeight: 700,
  color: '#FFF',
  letterSpacing: '0.02em'
};

const feedCardStyle: React.CSSProperties = {
  background: 'rgba(18, 18, 18, 0.85)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.05)',
  borderRadius: '16px',
  padding: '18px',
  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.35)',
};

const feedTitleStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: 700,
  color: '#FFF',
  margin: 0,
  letterSpacing: '0.02em',
};

const viewAllLinkStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--gold, #D4AF37)',
  textDecoration: 'none',
  fontWeight: 600
};

const touchOrderCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  padding: '12px',
  borderRadius: '12px',
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(255, 255, 255, 0.04)',
  textDecoration: 'none',
  cursor: 'pointer',
  transition: 'all 200ms ease'
};

const badgeStyle = (status: string): React.CSSProperties => {
  let bg = 'rgba(255,255,255,0.08)';
  let color = '#FFF';
  if (status === 'delivered') { bg = 'rgba(76,175,80,0.12)'; color = '#4CAF50'; }
  else if (status === 'pending') { bg = 'rgba(255,152,0,0.12)'; color = '#FF9800'; }
  else if (status === 'shipped') { bg = 'rgba(33,150,243,0.12)'; color = '#2196F3'; }
  else if (status === 'confirmed') { bg = 'rgba(0,188,212,0.12)'; color = '#00BCD4'; }
  else if (status === 'cancelled') { bg = 'rgba(244,67,54,0.12)'; color = '#F44336'; }

  return {
    fontSize: '0.62rem',
    fontWeight: 800,
    letterSpacing: '0.06em',
    padding: '3px 8px',
    borderRadius: '8px',
    background: bg,
    color,
    border: `1px solid ${color}20`
  };
};

/* ─────────────── small presentational helpers ─────────────── */

function FilterPills({
  preset,
  onChange,
  customFrom,
  customTo,
  setCustomFrom,
  setCustomTo,
}: {
  preset: Preset;
  onChange: (p: Preset) => void;
  customFrom: string;
  customTo: string;
  setCustomFrom: (v: string) => void;
  setCustomTo: (v: string) => void;
}) {
  const opts: { id: Preset; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: '7d', label: '7d' },
    { id: 'month', label: 'Month' },
    { id: 'custom', label: 'Custom' },
  ];
  return (
    <div
      role="tablist"
      aria-label="Date range filter"
      style={{
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      {opts.map((o) => {
        const active = preset === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            style={{
              border: '1px solid',
              borderColor: active ? 'rgba(212,175,55,0.55)' : 'rgba(255, 255, 255, 0.08)',
              background: active ? 'rgba(212,175,55,0.10)' : 'transparent',
              color: active ? 'var(--gold, #D4AF37)' : '#AAA',
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: '0.72rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
              cursor: 'pointer',
            }}
          >
            {o.label}
          </button>
        );
      })}
      {preset === 'custom' && (
        <span style={{ display: 'inline-flex', gap: 6, marginLeft: 6 }}>
          <input
            type="date"
            aria-label="From date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            style={dateInput}
          />
          <input
            type="date"
            aria-label="To date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            style={dateInput}
          />
        </span>
      )}
    </div>
  );
}

const dateInput: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: 6,
  color: '#FFF',
  padding: '4px 6px',
  fontSize: '0.7rem',
  colorScheme: 'dark',
};

function MetricCard({
  label,
  value,
  accent,
  trend,
  loading,
}: {
  label: string;
  value: string;
  accent?: 'success' | 'warning' | 'info' | 'error';
  trend?: { pct: number; label: string };
  loading?: boolean;
}) {
  let valueColor = '#FFF';
  if (accent === 'success') valueColor = '#4CAF50';
  else if (accent === 'warning') valueColor = '#FF9800';
  else if (accent === 'info') valueColor = '#2196F3';
  else if (accent === 'error') valueColor = '#F44336';

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.04)',
      borderRadius: '12px',
      padding: '14px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px'
    }}>
      <div style={{
        fontSize: '1.1rem',
        fontWeight: 700,
        color: valueColor,
        letterSpacing: '0.02em'
      }}>
        {loading ? <span style={{ opacity: 0.5 }}>—</span> : value}
      </div>
      <div style={{ fontSize: '0.72rem', color: '#8A8A8A', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      {trend && (
        <div
          style={{
            marginTop: 2,
            fontSize: '0.65rem',
            color:
              trend.pct > 0
                ? '#4CAF50'
                : trend.pct < 0
                  ? '#FF7675'
                  : '#8A8A8A',
            letterSpacing: '0.02em',
          }}
        >
          {trend.pct > 0 ? '▲ ' : trend.pct < 0 ? '▼ ' : ''}
          {Math.abs(trend.pct)}% {trend.label}
        </div>
      )}
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.01)',
      border: '1px solid rgba(255,255,255,0.03)',
      borderRadius: '12px',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    }}>
      <span style={{ fontSize: '0.75rem', color: '#8A8A8A', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {title}
      </span>
      {children}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div style={{
      height: '110px',
      borderRadius: '8px',
      background: 'rgba(255,255,255,0.02)',
      animation: 'pulse 1.5s infinite ease-in-out'
    }} />
  );
}
