'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/useToast';

interface Order {
  id: string;
  order_number: string;
  product_id: string;
  size: string;
  quantity: number;
  unit_price_paise: number;
  subtotal_paise: number;
  discount_paise: number;
  total_paise: number;
  coupon_code: string | null;
  payment_method: string;
  payment_status: string;
  order_status: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  customer: { name: string; phone: string; email?: string };
  shipping_address: { line1: string; line2?: string; city: string; state: string; pincode: string };
  tracking_id: string | null;
  label_url: string | null;
  shipping_provider: string | null;
  cancel_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export default function AdminOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [productName, setProductName] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [noteText, setNoteText] = useState('');
  const { toast, showToast } = useToast();

  useEffect(() => {
    fetchOrder();
  }, [id]);

  async function fetchOrder() {
    const supabase = createClient();
    const { data } = await supabase.from('orders').select('*').eq('id', id).single();
    if (data) {
      setOrder(data);
      setNoteText(data.notes || '');
      const { data: product } = await supabase.from('products').select('name').eq('id', data.product_id).single();
      setProductName(product?.name || '');
    }
    setLoading(false);
  }

  const formatPrice = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN');
  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  async function handleAction(action: string) {
    if (actionLoading || !order) return;
    setActionLoading(action);

    const supabase = createClient();

    try {
      if (action === 'verify') {
        await supabase.from('orders').update({ payment_status: 'verified' }).eq('id', id);
      }

      // Track which actions transition order_status so we can fire
      // the lifecycle email afterwards. Notes / payment-verify are
      // not status transitions and skip the notify call.
      let statusChanged = false;

      if (action === 'confirm') {
        await supabase.from('orders').update({ order_status: 'confirmed' }).eq('id', id);
        statusChanged = true;
      }

      if (action === 'cancel') {
        if (!cancelReason.trim()) { setActionLoading(''); return; }
        await supabase.from('orders').update({ order_status: 'cancelled', cancel_reason: cancelReason }).eq('id', id);
        // Restore stock
        await supabase.rpc('restore_stock', { p_product_id: order.product_id, p_size: order.size, p_quantity: order.quantity });
        statusChanged = true;
      }

      if (action === 'ship') {
        const res = await fetch(`/api/admin/orders/${id}/ship`, { method: 'POST' });
        const data = await res.json();
        if (!data.success) {
          showToast(data.error || 'Shipment creation failed', 'error');
          setActionLoading('');
          return;
        }
        statusChanged = true;
      }

      if (action === 'deliver') {
        await supabase.from('orders').update({ order_status: 'delivered' }).eq('id', id);
        statusChanged = true;
      }

      if (action === 'save-notes') {
        await supabase.from('orders').update({ notes: noteText }).eq('id', id);
      }

      // Fire-and-forget lifecycle email. Server route reads the
      // current status from the DB so it's never spoofable from
      // here. Errors are silently logged server-side.
      if (statusChanged) {
        fetch(`/api/admin/orders/${id}/notify-status`, { method: 'POST' }).catch(() => { });
      }

      await fetchOrder();
      showToast('Action successful', 'success');
    } catch (err) {
      console.error('Action failed:', err);
      showToast('Action failed', 'error');
    }
    setActionLoading('');
  }

  if (loading) return <div className="animate-pulse text-muted" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>Loading...</div>;
  if (!order) return <div className="text-muted" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>Order not found</div>;

  const isCOD = order.payment_method === 'cod';
  const isPending = order.order_status === 'pending';
  const isConfirmed = order.order_status === 'confirmed';
  const isCancelled = order.order_status === 'cancelled';

  return (
    <div>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      <button onClick={() => router.push('/admin/orders')} className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-4)' }}>← Back to Orders</button>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
        <div>
          <h1 style={{ fontSize: '1.125rem', fontWeight: 600, fontFamily: 'monospace' }}>{order.order_number}</h1>
          <p className="text-xs text-muted">{formatDate(order.created_at)}</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <span className={`badge badge-${order.order_status}`}>{order.order_status}</span>
          <span className={`badge ${order.payment_status === 'paid' ? 'badge-paid' : 'badge-pending'}`}>
            {order.payment_method === 'cod' ? 'COD' : order.payment_status}
          </span>
        </div>
      </div>

      {/* Customer */}
      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <p className="input-label" style={{ marginBottom: 'var(--space-3)' }}>Customer</p>
        <p style={{ fontWeight: 500 }}>{order.customer.name}</p>
        <p className="text-sm text-muted">{order.customer.phone}</p>
        {order.customer.email && <p className="text-sm text-muted">{order.customer.email}</p>}
      </div>

      {/* Address */}
      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <p className="input-label" style={{ marginBottom: 'var(--space-3)' }}>Shipping Address</p>
        <p className="text-sm">{order.shipping_address.line1}</p>
        {order.shipping_address.line2 && <p className="text-sm">{order.shipping_address.line2}</p>}
        <p className="text-sm">{order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.pincode}</p>
      </div>

      {/* Product */}
      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <p className="input-label" style={{ marginBottom: 'var(--space-3)' }}>Product</p>
        <p style={{ fontWeight: 500 }}>{productName} · {order.size}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginTop: 'var(--space-2)' }}>
          <span className="text-muted">{formatPrice(order.subtotal_paise)} {order.discount_paise > 0 ? `- ${formatPrice(order.discount_paise)}` : ''}</span>
          <span style={{ fontWeight: 600 }}>{formatPrice(order.total_paise)}</span>
        </div>
        {order.coupon_code && <p className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>Coupon: {order.coupon_code}</p>}
      </div>

      {/* Shipping */}
      {order.tracking_id && (
        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
          <p className="input-label" style={{ marginBottom: 'var(--space-3)' }}>Shipping</p>
          <p style={{ fontWeight: 500 }}>Tracking: {order.tracking_id}</p>
          <p className="text-sm text-muted">Provider: {order.shipping_provider}</p>
          {order.label_url && (
            <a href={order.label_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" style={{ marginTop: 'var(--space-3)', width: '100%' }}>
              Download Label PDF
            </a>
          )}
        </div>
      )}

      {/* Actions */}
      {!isCancelled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
          {/* COD Verify explicitly bounds to payment_status verified explicitly skipping shipping */}
          {isCOD && order.payment_status === 'pending' && (
            <button
              className={`btn btn-success btn-sm ${actionLoading === 'verify' ? 'btn-loading' : ''}`}
              onClick={() => handleAction('verify')}
              disabled={!!actionLoading}
              style={{ width: '100%' }}
            >
              ✓ Mark Payment Verified
            </button>
          )}

          {isPending && (
            <button
              className={`btn btn-primary ${actionLoading === 'confirm' ? 'btn-loading' : ''}`}
              onClick={() => handleAction('confirm')}
              disabled={!!actionLoading}
            >
              CONFIRM ORDER
            </button>
          )}

          {isConfirmed && !order.tracking_id && (
            <button
              className={`btn btn-primary ${actionLoading === 'ship' ? 'btn-loading' : ''}`}
              onClick={() => handleAction('ship')}
              disabled={!!actionLoading}
            >
              CREATE SHIPMENT
            </button>
          )}

          {order.order_status === 'shipped' && (
            <button
              className={`btn btn-success ${actionLoading === 'deliver' ? 'btn-loading' : ''}`}
              onClick={() => handleAction('deliver')}
              disabled={!!actionLoading}
            >
              MARK DELIVERED
            </button>
          )}

          {!showCancelForm ? (
            <button className="btn btn-ghost" onClick={() => setShowCancelForm(true)} style={{ color: 'var(--error)' }}>
              Cancel Order
            </button>
          ) : (
            <div className="card">
              <p className="input-label" style={{ marginBottom: 'var(--space-3)' }}>Cancel Reason</p>
              <input
                className="input-field"
                placeholder="Enter reason..."
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowCancelForm(false)}>Back</button>
                <button
                  className={`btn btn-danger btn-sm ${actionLoading === 'cancel' ? 'btn-loading' : ''}`}
                  onClick={() => handleAction('cancel')}
                  disabled={!cancelReason.trim() || !!actionLoading}
                  style={{ flex: 1 }}
                >
                  CANCEL ORDER
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
        <p className="input-label" style={{ marginBottom: 'var(--space-3)' }}>Admin Notes</p>
        <textarea
          className="input-field"
          placeholder="Add notes..."
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
          rows={3}
          style={{ resize: 'vertical', minHeight: '80px' }}
        />
        <button
          className={`btn btn-secondary btn-sm ${actionLoading === 'save-notes' ? 'btn-loading' : ''}`}
          onClick={() => handleAction('save-notes')}
          disabled={!!actionLoading}
          style={{ marginTop: 'var(--space-3)', width: '100%' }}
        >
          Save Notes
        </button>
      </div>

      {/* Cancel reason display */}
      {isCancelled && order.cancel_reason && (
        <div className="card" style={{ borderColor: 'var(--error)' }}>
          <p className="input-label" style={{ color: 'var(--error)' }}>Cancellation Reason</p>
          <p className="text-sm" style={{ marginTop: 'var(--space-2)' }}>{order.cancel_reason}</p>
        </div>
      )}
    </div>
  );
}
