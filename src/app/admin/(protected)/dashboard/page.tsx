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
import {
  Activity,
  Bell,
  Database,
  Layers,
  Zap,
  ShoppingCart,
  RefreshCw,
  AlertOctagon,
  HelpCircle,
  ArrowRight,
  TrendingUp,
  Truck,
  Users,
  Settings,
  ShieldAlert,
  BarChart3,
  Calendar,
  CheckCircle2,
  FileText,
  Search,
  MessageSquare,
  Tag
} from 'lucide-react';

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
  visitors?: number;
  conversion?: number;
  topCategories?: { name: string; qty: number; revenue: number }[];
  couponUsage?: Record<string, number>;
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
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tabs state
  const [activeTab, setActiveTab] = useState<'overview' | 'activity' | 'system' | 'alerts'>('overview');

  // Additional control center states
  const [pendingShipmentsCount, setPendingShipmentsCount] = useState(0);
  const [returnsCount, setReturnsCount] = useState(0);
  const [customerGrowthCount, setCustomerGrowthCount] = useState(0);
  const [systemHealth, setSystemHealth] = useState<{ queued: number; running: number; failed: number; dead: number }>({ queued: 0, running: 0, failed: 0, dead: 0 });
  const [marketingPerformance, setMarketingPerformance] = useState<{ activeProviders: number; totalSyncs: number }>({ activeProviders: 0, totalSyncs: 0 });
  const [automationStatus, setAutomationStatus] = useState<{ activeFlows: number; totalExecutions: number }>({ activeFlows: 0, totalExecutions: 0 });
  const [recentNotifications, setRecentNotifications] = useState<any[]>([]);
  const [activityFeed, setActivityFeed] = useState<any[]>([]);

  const range = useMemo(
    () => presetRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

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

  // Fetch control center metrics in parallel
  const fetchControlCenterStats = useCallback(async () => {
    try {
      const supabase = createClient();
      
      // 1. Pending Shipments count (status = 'pending')
      const { count: pendingShipments } = await supabase
        .from('shipments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      setPendingShipmentsCount(pendingShipments || 0);

      // 2. Return requests count (status = 'pending' or active)
      const { count: activeReturns } = await supabase
        .from('return_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      setReturnsCount(activeReturns || 0);

      // 3. Customer growth in selected range
      const { count: custGrowth } = await supabase
        .from('customer_profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', range.from.toISOString())
        .lte('created_at', range.to.toISOString());
      setCustomerGrowthCount(custGrowth || 0);

      // 4. System Health (job_queue distribution)
      const { data: jobs } = await supabase
        .from('job_queue')
        .select('status');
      if (jobs) {
        const counts = { queued: 0, running: 0, failed: 0, dead: 0 };
        jobs.forEach((j: any) => {
          if (j.status === 'queued') counts.queued++;
          else if (j.status === 'running') counts.running++;
          else if (j.status === 'failed') counts.failed++;
          else if (j.status === 'dead') counts.dead++;
        });
        setSystemHealth(counts);
      }

      // 5. Automation Status (workflows and executions)
      const { count: activeFlows } = await supabase
        .from('workflows')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);
      
      const { count: totalExecutions } = await supabase
        .from('workflow_executions')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', range.from.toISOString());
      setAutomationStatus({
        activeFlows: activeFlows || 0,
        totalExecutions: totalExecutions || 0
      });

      // 6. Marketing performance (active providers)
      const { count: activeProviders } = await supabase
        .from('marketing_providers')
        .select('*', { count: 'exact', head: true })
        .eq('is_enabled', true);
      
      const { count: totalSyncs } = await supabase
        .from('marketing_events')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', range.from.toISOString());
      setMarketingPerformance({
        activeProviders: activeProviders || 0,
        totalSyncs: totalSyncs || 0
      });

      // 7. Recent Notifications
      const { data: notifications } = await supabase
        .from('admin_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      setRecentNotifications(notifications || []);

      // 8. Global Activity Feed Assembly
      // Query audit logs
      const { data: auditLogs } = await supabase
        .from('admin_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      // Query returns
      const { data: recentReturns } = await supabase
        .from('return_requests')
        .select('id, type, reason, created_at, orders(order_number, customer)')
        .order('created_at', { ascending: false })
        .limit(10);

      // Assemble stitched Activity Feed chronologically
      const feed: any[] = [];
      
      (auditLogs || []).forEach(log => {
        feed.push({
          id: `audit-${log.id}`,
          title: `${log.entity_type} ${log.action}`,
          body: `Admin performed action on ${log.entity_type} ID: ${log.entity_id}. Details: ${JSON.stringify(log.metadata)}`,
          date: log.created_at,
          category: 'audit',
          icon: log.entity_type === 'product' ? Tag : Settings
        });
      });

      (recentReturns || []).forEach(ret => {
        const orderData = ret.orders as any;
        feed.push({
          id: `return-${ret.id}`,
          title: ret.type === 'exchange' ? '🔀 Exchange Request Filed' : '🔄 Return Request Filed',
          body: `Order #${orderData?.order_number || ''} by ${orderData?.customer?.name || 'Guest'}. Reason: ${ret.reason || 'n/a'}`,
          date: ret.created_at,
          category: 'return',
          icon: RefreshCw
        });
      });

      feed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setActivityFeed(feed.slice(0, 20));

    } catch (err) {
      console.error('[CONTROL_CENTER_STATS_FETCH]', err);
    }
  }, [range.from, range.to]);

  // Initial + filter-change fetch (debounced for custom range typing).
  useEffect(() => {
    setLoading(true);
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => {
      fetchAnalytics();
      fetchControlCenterStats();
    }, 200);
    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
    };
  }, [fetchAnalytics, fetchControlCenterStats]);

  // Realtime: refetch on new-order event (debounced so a burst of
  // inserts doesn't hammer the API).
  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | null = null;
    const onOrder = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        fetchAnalytics();
        fetchControlCenterStats();
      }, 800);
    };
    window.addEventListener(ADMIN_ORDER_CREATED_EVENT, onOrder);
    return () => {
      window.removeEventListener(ADMIN_ORDER_CREATED_EVENT, onOrder);
      if (pending) clearTimeout(pending);
    };
  }, [fetchAnalytics, fetchControlCenterStats]);

  return (
    <div className="admin-page-container">
      {/* Personalized Admin Welcome */}
      <AdminWelcome />

      {/* Title block & range presets */}
      <div className="admin-header-row">
        <div className="admin-title-area">
          <div>
            <h1 className="admin-page-title">Noir Control Center</h1>
            <p className="admin-page-desc">Complete operational metrics, active triggers, and platform health.</p>
          </div>
          <div className="admin-actions-group">
            <FilterPills
              preset={preset}
              onChange={(p) => setPreset(p)}
              customFrom={customFrom}
              customTo={customTo}
              setCustomFrom={setCustomFrom}
              setCustomTo={setCustomTo}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="warning-banner">
          ⚠ {error}
        </div>
      )}

      {/* 1. Core SaaS Metrics Grid (Stripe style) */}
      <div className="admin-stats-layout">
        <MetricCard
          label="Today's Revenue"
          value={loading || !data ? '—' : formatPrice(data.revenue.total)}
          trend={data ? { pct: data.revenue.trendPct, label: 'vs prev period' } : undefined}
          icon={TrendingUp}
          loading={loading}
        />
        <MetricCard
          label="Total Orders"
          value={loading || !data ? '—' : String(data.orders.total)}
          icon={ShoppingCart}
          loading={loading}
        />
        <MetricCard
          label="Pending Shipments"
          value={loading ? '—' : String(pendingShipmentsCount)}
          icon={Truck}
          accent={pendingShipmentsCount > 0 ? 'warning' : undefined}
          loading={loading}
        />
        <MetricCard
          label="Active Returns"
          value={loading ? '—' : String(returnsCount)}
          icon={RefreshCw}
          accent={returnsCount > 0 ? 'info' : undefined}
          loading={loading}
        />
      </div>

      {/* 2. Secondary Metrics Row */}
      <div className="admin-stats-layout">
        <MetricCard
          label="Average Order Value"
          value={loading || !data ? '—' : formatPrice(data.aov)}
          loading={loading}
        />
        <MetricCard
          label="Customer Growth"
          value={loading ? '—' : `+${customerGrowthCount}`}
          icon={Users}
          loading={loading}
        />
        <MetricCard
          label="Active Workflows"
          value={loading ? '—' : `${automationStatus.activeFlows} flows`}
          icon={Zap}
          loading={loading}
        />
        <MetricCard
          label="System Health Status"
          value={loading ? '—' : systemHealth.dead > 0 ? 'Degraded' : 'Nominal'}
          icon={Database}
          accent={systemHealth.dead > 0 ? 'critical' : 'success'}
          loading={loading}
        />
      </div>

      {/* 3. Dashboard Tabbed Panes (Vercel-style) */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
        {[
          { id: 'overview', label: 'Performance Charts', icon: BarChart3 },
          { id: 'activity', label: 'Global Activity Feed', icon: Activity },
          { id: 'system', label: 'Engine & Health Diagnostics', icon: Database },
          { id: 'alerts', label: 'Stock & Action Items', icon: ShieldAlert }
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              style={{
                background: 'none',
                border: 'none',
                padding: '8px 12px',
                fontSize: '0.85rem',
                color: activeTab === t.id ? 'var(--accent-gold)' : 'var(--text-muted)',
                borderBottom: activeTab === t.id ? '2px solid var(--accent-gold)' : 'none',
                cursor: 'pointer',
                fontWeight: activeTab === t.id ? 'bold' : 'normal',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap'
              }}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab Body Contents */}
      <div style={{ minHeight: '380px' }}>
        
        {/* Tab A: Overview & Charts */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-3)' }}>
              <ChartCard title="Revenue Trend (₹ paise)">
                {data ? <RevenueTrendChart data={data.trend} /> : <ChartSkeleton />}
              </ChartCard>
              <ChartCard title="Orders Trend (Count)">
                {data ? <OrderTrendChart data={data.trend} /> : <ChartSkeleton />}
              </ChartCard>
              <ChartCard title="Payment Method split">
                {data ? (
                  <div style={{ paddingTop: 8 }}>
                    <PaymentSplitBar
                      online={data.orders.paymentSplit.online}
                      cod={data.orders.paymentSplit.cod}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-4)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <span>Prepaid Revenue: {formatPrice(data.revenue.prepaid)}</span>
                      <span>COD Revenue: {formatPrice(data.revenue.cod)}</span>
                    </div>
                  </div>
                ) : (
                  <ChartSkeleton />
                )}
              </ChartCard>
            </div>

            {/* Metrics tables summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
              <SectionCard title="Top Products Sold" empty={data && data.topProducts.length === 0 ? 'No sales yet' : null}>
                {data && data.topProducts.length > 0 && (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {data.topProducts.map((p, idx) => (
                      <li key={p.product_id || idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                        <span>{p.name} <span style={{ color: 'var(--text-muted)' }}>×{p.qty}</span></span>
                        <strong style={{ color: 'var(--accent-gold)' }}>{formatPrice(p.revenue)}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>

              <SectionCard title="Recent Orders" empty={data && data.recentOrders.length === 0 ? 'No orders in range' : null}>
                {data && data.recentOrders.length > 0 && (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {data.recentOrders.map((o) => (
                      <li key={o.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                        <Link href={`/admin/orders/${o.id}`} style={{ fontWeight: 600, textDecoration: 'underline' }}>
                          #{o.order_number}
                        </Link>
                        <span style={{ color: 'var(--text-muted)' }}>{o.customer_name || 'Guest'}</span>
                        <strong>{formatPrice(o.total_paise)}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>
          </div>
        )}

        {/* Tab B: Global Activity Feed */}
        {activeTab === 'activity' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 'var(--space-5)' }}>
            {/* Chronological activity timeline */}
            <div className="card" style={{ padding: 'var(--space-5)' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 'var(--space-4)' }}>Enterprise Activity Stream</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '1px solid var(--border-color)', paddingLeft: '16px', marginLeft: '8px' }}>
                {activityFeed.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No recent audit activity.</div>
                ) : (
                  activityFeed.map((act) => {
                    const Icon = act.icon;
                    return (
                      <div key={act.id} style={{ position: 'relative' }}>
                        <span style={{
                          position: 'absolute',
                          left: '-24px',
                          top: '2px',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '8px'
                        }}>
                          <Icon size={10} style={{ color: 'var(--accent-gold)' }} />
                        </span>
                        
                        <div style={{ fontSize: '0.8rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>{act.title}</strong>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{formatRelative(act.date)}</span>
                          </div>
                          <p style={{ color: 'var(--text-secondary)', margin: '2px 0 0 0', fontSize: '0.75rem' }}>{act.body}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Quick alert notifications preview */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div className="card" style={{ padding: 'var(--space-4)' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-gold)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Bell size={14} /> Live Alerts Log
                </h4>
                {recentNotifications.length === 0 ? (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No unread alarms.</p>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {recentNotifications.map((notif: any) => (
                      <li key={notif.id} style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', fontSize: '0.75rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{notif.title}</div>
                        <div style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{notif.body}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab C: Engine & Health Diagnostics */}
        {activeTab === 'system' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
            
            {/* System Health details */}
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Database size={14} /> Job Queue Diagnostics
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Waiting Jobs:</span>
                  <strong>{systemHealth.queued}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Running Jobs:</span>
                  <strong>{systemHealth.running}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Recovering (Failed) Jobs:</span>
                  <strong style={{ color: systemHealth.failed > 0 ? 'var(--warning)' : 'inherit' }}>{systemHealth.failed}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Dead Jobs (Alert!):</span>
                  <strong style={{ color: systemHealth.dead > 0 ? 'var(--error)' : 'inherit' }}>{systemHealth.dead}</strong>
                </div>
              </div>
            </div>

            {/* Automation flow details */}
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Zap size={14} /> Automation Triggers
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Active Engine Flows:</span>
                  <strong>{automationStatus.activeFlows}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Workflow Runs (Recent):</span>
                  <strong>{automationStatus.totalExecutions}</strong>
                </div>
              </div>
            </div>

            {/* Marketing platform performance */}
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layers size={14} /> Marketing Platform
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Active Marketing Connections:</span>
                  <strong>{marketingPerformance.activeProviders} providers</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Synced Audience Events:</span>
                  <strong>{marketingPerformance.totalSyncs}</strong>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Tab D: Stock Warnings & Action items */}
        {activeTab === 'alerts' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
            
            {/* Low Stock Items */}
            <SectionCard title="Inventory Stock Warnings" empty={data && data.lowStock.length === 0 ? 'All sizes fully stocked ✓' : null}>
              {data && data.lowStock.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {data.lowStock.slice(0, 10).map((row, i) => (
                    <li key={`${row.product_id}-${row.size}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                      <span>{row.name} <span style={{ color: 'var(--text-muted)' }}>· {row.size}</span></span>
                      <strong style={{ color: row.stock === 0 ? 'var(--error)' : 'var(--warning)' }}>
                        {row.stock} left
                      </strong>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            {/* Action Orders */}
            <SectionCard
              title="Awaiting Manual Actions"
              empty={
                data &&
                data.needsAction.unconfirmed === 0 &&
                data.needsAction.failed === 0 &&
                data.needsAction.stuck === 0
                  ? 'All clear ✓'
                  : null
              }
            >
              {data && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.needsAction.unconfirmed > 0 && (
                    <ActionRow
                      label="Paid orders requiring confirmation"
                      count={data.needsAction.unconfirmed}
                      href="/admin/orders?filter=unconfirmed"
                    />
                  )}
                  {data.needsAction.failed > 0 && (
                    <ActionRow
                      label="Failed checkouts"
                      count={data.needsAction.failed}
                      href="/admin/orders?filter=failed"
                      tone="error"
                    />
                  )}
                  {data.needsAction.stuck > 0 && (
                    <ActionRow
                      label="Awaiting online payments (>30m)"
                      count={data.needsAction.stuck}
                      href="/admin/orders?filter=stuck"
                      tone="warning"
                    />
                  )}
                </div>
              )}
            </SectionCard>

          </div>
        )}

      </div>
    </div>
  );
}

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
              borderColor: active ? 'rgba(201,168,106,0.55)' : 'var(--border-color)',
              background: active ? 'rgba(201,168,106,0.1)' : 'var(--bg-secondary)',
              color: active ? 'var(--accent-gold)' : 'var(--text-secondary)',
              padding: '6px 12px',
              borderRadius: 20,
              fontSize: '0.75rem',
              fontWeight: 600,
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
  background: 'var(--bg-input)',
  border: '1px solid var(--border-color)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  padding: '4px 6px',
  fontSize: '0.75rem',
  colorScheme: 'dark',
};

function MetricCard({
  label,
  value,
  accent,
  trend,
  icon: Icon,
  loading,
}: {
  label: string;
  value: string;
  accent?: 'success' | 'warning' | 'info' | 'critical';
  trend?: { pct: number; label: string };
  icon?: React.ComponentType<any>;
  loading?: boolean;
}) {
  const getAccentColor = (acc?: string) => {
    if (acc === 'success') return 'var(--success)';
    if (acc === 'warning') return 'var(--warning)';
    if (acc === 'critical') return 'var(--error)';
    if (acc === 'info') return 'var(--accent-gold)';
    return undefined;
  };

  return (
    <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span className="stat-label" style={{ margin: 0 }}>{label}</span>
        {Icon && <Icon size={16} style={{ color: getAccentColor(accent) || 'var(--text-muted)' }} />}
      </div>
      
      <div
        className="stat-value"
        style={{ color: getAccentColor(accent), fontSize: '1.65rem' }}
      >
        {loading ? <span className="animate-pulse" style={{ opacity: 0.5 }}>—</span> : value}
      </div>
      
      {trend && (
        <div
          style={{
            marginTop: 4,
            fontSize: '0.7rem',
            color:
              trend.pct > 0
                ? 'var(--success)'
                : trend.pct < 0
                  ? 'var(--error)'
                  : 'var(--text-muted)',
            letterSpacing: '0.04em',
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
    <div
      className="card"
      style={{
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      <p
        className="input-label"
        style={{ margin: 0, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', fontSize: '0.75rem' }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

function SectionCard({
  title,
  children,
  empty,
}: {
  title: string;
  children: React.ReactNode;
  empty: string | null;
}) {
  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <p
        className="input-label"
        style={{ marginBottom: 'var(--space-3)', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', fontSize: '0.75rem' }}
      >
        {title}
      </p>
      {empty ? (
        <p className="text-muted" style={{ fontSize: '0.8125rem' }}>{empty}</p>
      ) : (
        children
      )}
    </div>
  );
}

function ActionRow({
  label,
  count,
  href,
  tone,
}: {
  label: string;
  count: number;
  href: string;
  tone?: 'warning' | 'error';
}) {
  const c =
    tone === 'error'
      ? 'var(--error)'
      : tone === 'warning'
        ? 'var(--warning)'
        : 'var(--text)';
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        border: '1px solid var(--border-color)',
        borderRadius: 8,
        textDecoration: 'none',
        color: 'var(--text-primary)',
        fontSize: '0.8125rem',
      }}
      className="admin-table-row"
    >
      <span>{label}</span>
      <span style={{ color: c, fontWeight: 700 }}>{count}</span>
    </Link>
  );
}

function ChartSkeleton() {
  return (
    <div
      className="skeleton"
      style={{ height: 120, borderRadius: 8 }}
    />
  );
}
