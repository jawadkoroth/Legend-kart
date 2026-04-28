'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface Stats {
  totalOrders: number;
  pendingOrders: number;
  confirmedOrders: number;
  revenue: number;
  stuckOrders: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ totalOrders: 0, pendingOrders: 0, confirmedOrders: 0, revenue: 0, stuckOrders: 0 });
  const [recentOrders, setRecentOrders] = useState<Array<{ id: string; order_number: string; total_paise: number; order_status: string; payment_method: string; customer: { name: string }; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const { data: orders } = await supabase
        .from('orders')
        .select('id, order_number, total_paise, order_status, payment_status, payment_method, customer, created_at')
        .order('created_at', { ascending: false });

      if (orders) {
        const pending = orders.filter(o => o.order_status === 'pending');
        const confirmed = orders.filter(o => o.order_status === 'confirmed');
        const paidOrders = orders.filter(o => o.payment_status === 'paid' || o.payment_method === 'cod');
        const revenue = paidOrders.reduce((sum, o) => sum + o.total_paise, 0);

        // Stuck orders — online + pending > 30 min
        const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const stuck = orders.filter(
          o => o.payment_method === 'online' && o.payment_status === 'pending' && o.order_status === 'pending' && o.created_at < thirtyMinAgo
        );

        setStats({
          totalOrders: orders.length,
          pendingOrders: pending.length,
          confirmedOrders: confirmed.length,
          revenue,
          stuckOrders: stuck.length,
        });

        setRecentOrders(orders.slice(0, 5));
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  const formatPrice = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN');

  if (loading) {
    return <div className="animate-pulse text-muted" style={{ padding: 'var(--space-5)', textAlign: 'center' }}>Loading dashboard...</div>;
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 'var(--space-5)' }}>Dashboard</h1>

      {/* Stuck Orders Warning */}
      {stats.stuckOrders > 0 && (
        <div className="warning-banner" style={{ marginBottom: 'var(--space-5)' }}>
          ⚠ {stats.stuckOrders} online order{stats.stuckOrders > 1 ? 's' : ''} pending payment &gt; 30 min
          <Link href="/admin/orders?filter=stuck" style={{ marginLeft: 'auto', textDecoration: 'underline', fontSize: '0.8125rem' }}>
            Review →
          </Link>
        </div>
      )}

      {/* Stats Grid */}
      <div className="stats-grid" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="stat-card">
          <div className="stat-value">{stats.totalOrders}</div>
          <div className="stat-label">Total Orders</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--warning)' }}>{stats.pendingOrders}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--info)' }}>{stats.confirmedOrders}</div>
          <div className="stat-label">Confirmed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--success)' }}>{formatPrice(stats.revenue)}</div>
          <div className="stat-label">Revenue</div>
        </div>
      </div>

      {/* Recent Orders */}
      <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-3)' }}>Recent Orders</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {recentOrders.map(order => (
          <Link key={order.id} href={`/admin/orders/${order.id}`} className="order-card">
            <div className="order-card-header">
              <span style={{ fontWeight: 600, fontSize: '0.875rem', fontFamily: 'monospace' }}>{order.order_number}</span>
              <span className={`badge badge-${order.order_status}`}>{order.order_status}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              <span>{order.customer?.name}</span>
              <span>{formatPrice(order.total_paise)}</span>
            </div>
          </Link>
        ))}

        {recentOrders.length === 0 && (
          <p className="text-muted" style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>No orders yet</p>
        )}
      </div>
    </div>
  );
}
