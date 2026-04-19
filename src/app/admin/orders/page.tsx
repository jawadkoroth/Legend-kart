'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Suspense } from 'react';

interface Order {
  id: string;
  order_number: string;
  total_paise: number;
  order_status: string;
  payment_status: string;
  payment_method: string;
  customer: { name: string; phone: string };
  created_at: string;
}

function OrdersList() {
  const searchParams = useSearchParams();
  const filterParam = searchParams.get('filter');
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState(filterParam || 'all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrders() {
      setLoading(true);
      const supabase = createClient();
      let query = supabase
        .from('orders')
        .select('id, order_number, total_paise, order_status, payment_status, payment_method, customer, created_at')
        .order('created_at', { ascending: false });

      if (filter === 'pending') query = query.eq('order_status', 'pending');
      if (filter === 'confirmed') query = query.eq('order_status', 'confirmed');
      if (filter === 'shipped') query = query.eq('order_status', 'shipped');
      if (filter === 'cancelled') query = query.eq('order_status', 'cancelled');

      const { data } = await query;

      let results = data || [];

      // Filter stuck orders client-side
      if (filter === 'stuck') {
        const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        results = results.filter(
          o => o.payment_method === 'online' && o.payment_status === 'pending' && o.order_status === 'pending' && o.created_at < thirtyMinAgo
        );
      }

      setOrders(results);
      setLoading(false);
    }
    fetchOrders();
  }, [filter]);

  const formatPrice = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN');
  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const filters = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'shipped', label: 'Shipped' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'stuck', label: '⚠ Stuck' },
  ];

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 'var(--space-4)' }}>Orders</h1>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', marginBottom: 'var(--space-5)', paddingBottom: 'var(--space-2)' }}>
        {filters.map(f => (
          <button
            key={f.key}
            className={`btn btn-sm ${filter === f.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter(f.key)}
            style={{ whiteSpace: 'nowrap' }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="animate-pulse text-muted" style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>Loading orders...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {orders.map(order => (
            <Link key={order.id} href={`/admin/orders/${order.id}`} className="order-card">
              <div className="order-card-header">
                <span style={{ fontWeight: 600, fontSize: '0.8125rem', fontFamily: 'monospace' }}>{order.order_number}</span>
                <span className={`badge badge-${order.order_status}`}>{order.order_status}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                <span>{order.customer?.name} · {order.payment_method.toUpperCase()}</span>
                <span>{formatPrice(order.total_paise)}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {formatDate(order.created_at)}
                {order.payment_status === 'paid' && <span className="badge badge-paid" style={{ marginLeft: 'var(--space-2)' }}>Paid</span>}
              </div>
            </Link>
          ))}

          {orders.length === 0 && (
            <p className="text-muted" style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
              {filter === 'stuck' ? 'No stuck orders 👍' : 'No orders found'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<div className="animate-pulse text-muted" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>Loading...</div>}>
      <OrdersList />
    </Suspense>
  );
}
