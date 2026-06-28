'use client';

import { useEffect, useState, useMemo, useCallback, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { ADMIN_ORDER_CREATED_EVENT } from '@/components/admin/AdminRealtimeProvider';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import { Search } from 'lucide-react';

/**
 * Admin Orders list — server-driven filters, search, pagination,
 * and bulk actions. Mirrors the dashboard aesthetic: pill filters,
 * gold-accent active state, premium dark/glass cards.
 */

interface OrderRow {
  id: string;
  order_number: string;
  total_paise: number;
  order_status: string;
  payment_status: string;
  payment_method: string;
  customer_name: string;
  customer_phone: string;
  created_at: string;
}

const STATUS_FILTERS = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'stuck', label: '⚠ Stuck' },
] as const;

const PAYMENT_FILTERS = [
  { key: '', label: 'Any' },
  { key: 'online', label: 'Online' },
  { key: 'cod', label: 'COD' },
] as const;

const formatPrice = (paise: number) =>
  '₹' + (paise / 100).toLocaleString('en-IN');
const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

function OrdersList() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [status, setStatus] = useState<string>(searchParams.get('filter') ?? searchParams.get('status') ?? '');
  const [payment, setPayment] = useState<string>(searchParams.get('payment') ?? '');
  const [from, setFrom] = useState<string>(searchParams.get('from') ?? '');
  const [to, setTo] = useState<string>(searchParams.get('to') ?? '');
  const [q, setQ] = useState<string>(searchParams.get('q') ?? '');
  const [debouncedQ, setDebouncedQ] = useState<string>(q);

  const [page, setPage] = useState<number>(1);
  const pageSize = 20;

  const [rows, setRows] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [bulkBusy, setBulkBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Debounce search input (250 ms).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  // Reset to page 1 whenever filters change.
  useEffect(() => {
    setPage(1);
  }, [status, payment, from, to, debouncedQ]);

  // Mirror filters into the URL so refreshes preserve state.
  useEffect(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (payment) params.set('payment', payment);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (debouncedQ) params.set('q', debouncedQ);
    const qs = params.toString();
    router.replace(qs ? `/admin/orders?${qs}` : '/admin/orders', { scroll: false });
  }, [status, payment, from, to, debouncedQ, router]);

  const inFlight = useRef<AbortController | null>(null);

  const fetchOrders = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setLoading(true);
    setError('');

    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (payment) params.set('payment', payment);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (debouncedQ) params.set('q', debouncedQ);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));

    try {
      const res = await fetch(`/api/admin/orders?${params.toString()}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'Failed to load orders');
        return;
      }
      setRows(json.orders ?? []);
      setTotal(json.total ?? 0);
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      console.error('[ADMIN_ORDERS_FETCH]', err);
      setError('Failed to load orders');
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
      setLoading(false);
    }
  }, [status, payment, from, to, debouncedQ, page]);

  useEffect(() => {
    fetchOrders();
    return () => {
      inFlight.current?.abort();
    };
  }, [fetchOrders]);

  // Realtime: refetch on new-order event so the list stays live.
  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | null = null;
    const onOrder = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => fetchOrders(), 600);
    };
    window.addEventListener(ADMIN_ORDER_CREATED_EVENT, onOrder);
    return () => {
      window.removeEventListener(ADMIN_ORDER_CREATED_EVENT, onOrder);
      if (pending) clearTimeout(pending);
    };
  }, [fetchOrders]);

  async function runBulkWithIds(action: 'cancel' | 'mark_shipped' | 'mark_delivered', ids: string[]) {
    if (ids.length === 0 || bulkBusy) return;
    const verbs: Record<typeof action, string> = {
      cancel: 'cancel',
      mark_shipped: 'mark as shipped',
      mark_delivered: 'mark as delivered',
    };
    if (!confirm(`${ids.length === 1 ? '1 order' : `${ids.length} orders`} will be ${verbs[action]}d. Proceed?`)) {
      return;
    }
    setBulkBusy(true);
    try {
      const res = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, order_ids: ids }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'Bulk action failed');
      } else {
        fetchOrders();
      }
    } catch (err) {
      console.error('[ADMIN_ORDERS_BULK_FAIL]', err);
      setError('Bulk action failed');
    } finally {
      setBulkBusy(false);
    }
  }

  const columns: AdminTableColumn<OrderRow>[] = [
    {
      key: 'order_number',
      label: 'Order Number',
      sortable: true,
      width: 140,
      render: (row) => (
        <Link href={`/admin/orders/${row.id}`} style={{ fontWeight: 600, fontFamily: 'monospace', textDecoration: 'underline', color: 'var(--accent-gold)' }}>
          {row.order_number}
        </Link>
      )
    },
    {
      key: 'customer_name',
      label: 'Customer',
      sortable: true,
      width: 180,
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span>{row.customer_name || 'Guest'}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{row.customer_phone}</span>
        </div>
      )
    },
    {
      key: 'payment_method',
      label: 'Payment Method',
      sortable: true,
      width: 120,
      render: (row) => <span style={{ textTransform: 'uppercase' }}>{row.payment_method}</span>
    },
    {
      key: 'total_paise',
      label: 'Total Amount',
      sortable: true,
      width: 130,
      render: (row) => <strong>{formatPrice(row.total_paise)}</strong>
    },
    {
      key: 'order_status',
      label: 'Order Status',
      sortable: true,
      width: 130,
      render: (row) => <span className={`badge badge-${row.order_status}`}>{row.order_status}</span>
    },
    {
      key: 'payment_status',
      label: 'Payment Status',
      sortable: true,
      width: 130,
      render: (row) => (
        <span className={`badge badge-${row.payment_status === 'paid' ? 'paid' : 'cancelled'}`}>
          {row.payment_status}
        </span>
      )
    },
    {
      key: 'created_at',
      label: 'Date Placed',
      sortable: true,
      width: 180,
      render: (row) => <span>{formatDate(row.created_at)}</span>
    }
  ];

  const bulkActions = [
    {
      label: 'Mark Shipped',
      onClick: (selectedRows: OrderRow[]) => {
        runBulkWithIds('mark_shipped', selectedRows.map(r => r.id));
      }
    },
    {
      label: 'Mark Delivered',
      onClick: (selectedRows: OrderRow[]) => {
        runBulkWithIds('mark_delivered', selectedRows.map(r => r.id));
      }
    },
    {
      label: 'Cancel Orders',
      onClick: (selectedRows: OrderRow[]) => {
        runBulkWithIds('cancel', selectedRows.map(r => r.id));
      }
    }
  ];

  return (
    <div className="admin-page-container">
      <div className="admin-header-row">
        <div className="admin-title-area">
          <div>
            <h1 className="admin-page-title">Orders</h1>
            <p className="admin-page-desc">Manage customer payments, shipping details, and logistics pipelines.</p>
          </div>
          <span className="text-xs text-muted">
            {loading ? 'Loading…' : `${total.toLocaleString('en-IN')} matches`}
          </span>
        </div>
      </div>

      {/* Filters Area */}
      <div className="admin-filters-bar" style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'stretch' }}>
        
        {/* Status Tab Pills */}
        <div
          role="tablist"
          aria-label="Filter by status"
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          {STATUS_FILTERS.map((f) => {
            const active = status === f.key;
            return (
              <button
                key={f.key || 'all'}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatus(f.key)}
                style={{
                  border: '1px solid',
                  borderColor: active ? 'rgba(201,168,106,0.55)' : 'var(--border-color)',
                  background: active ? 'rgba(201,168,106,0.1)' : 'transparent',
                  color: active ? 'var(--accent-gold)' : 'var(--text-secondary)',
                  padding: '6px 12px',
                  borderRadius: 20,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Secondary filters inputs row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 'var(--space-3)',
          }}
        >
          <div className="admin-search-input-wrapper" style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="search"
              placeholder="Search by order # or customer"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="admin-search-input"
              style={{ paddingLeft: '36px', height: '38px' }}
            />
          </div>
          
          <select
            value={payment}
            onChange={(e) => setPayment(e.target.value)}
            className="admin-form-input"
            aria-label="Payment method"
            style={{ height: '38px', padding: '0 12px' }}
          >
            {PAYMENT_FILTERS.map((p) => (
              <option key={p.key || 'any'} value={p.key}>
                Payment: {p.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            aria-label="From date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="admin-form-input"
            style={{ height: '38px', colorScheme: 'dark' }}
          />
          <input
            type="date"
            aria-label="To date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="admin-form-input"
            style={{ height: '38px', colorScheme: 'dark' }}
          />
        </div>
      </div>

      {error && (
        <div className="warning-banner">
          ⚠ {error}
        </div>
      )}

      {/* Main Standardized Table Component */}
      <AdminTable
        columns={columns}
        data={rows}
        loading={loading}
        emptyMessage={status === 'stuck' ? 'No stuck orders 👍' : 'No orders match these filters'}
        bulkActions={bulkActions}
        total={total}
        limit={pageSize}
        offset={(page - 1) * pageSize}
        onPageChange={(newOffset) => setPage(Math.floor(newOffset / pageSize) + 1)}
      />
    </div>
  );
}

export default function AdminOrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="animate-pulse text-muted" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          Loading...
        </div>
      }
    >
      <OrdersList />
    </Suspense>
  );
}
