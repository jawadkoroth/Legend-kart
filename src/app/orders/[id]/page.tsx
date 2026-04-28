import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * /orders/[id] — authenticated order detail.
 *
 * Strict ownership: the row is fetched WITH `.eq('user_id', user.id)`
 * AND the migration-006 RLS policy enforces `user_id = auth.uid()`
 * at the DB layer. Either guard alone would suffice; both together
 * make tampering (different id, expired session, etc.) fail closed
 * with `notFound()` instead of any data leak.
 */
export const dynamic = 'force-dynamic';

type OrderDetail = {
  id: string;
  order_number: string;
  user_id: string | null;
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
  customer: { name: string; phone: string; email?: string };
  shipping_address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
  };
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  products?: { name: string; images: string[] | null } | null;
};

const formatPrice = (paise: number) =>
  '₹' + (paise / 100).toLocaleString('en-IN');

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth?next=/orders/${id}`);
  }

  const { data, error } = await supabase
    .from('orders')
    .select(
      `
      id, order_number, user_id, product_id, size, quantity,
      unit_price_paise, subtotal_paise, discount_paise, total_paise,
      coupon_code, payment_method, payment_status, order_status,
      customer, shipping_address, cancel_reason, created_at, updated_at,
      products ( name, images )
      `,
    )
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    notFound();
  }

  // Defensive belt-and-braces: even if RLS or the .eq filter ever
  // regress, this final equality check prevents any cross-user leak.
  const order = data as unknown as OrderDetail;
  if (order.user_id !== user.id) {
    notFound();
  }

  const isCancelled = order.order_status === 'cancelled';
  const isPaid = order.payment_status === 'paid';

  const productImage =
    Array.isArray(order.products?.images) && order.products?.images?.[0]
      ? order.products.images[0]
      : null;
  const productName = order.products?.name ?? 'Product';

  const statusSteps: { key: string; label: string; done: boolean; time: string | null }[] = [
    {
      key: 'pending',
      label: 'Order Placed',
      done: true,
      time: order.created_at,
    },
    {
      key: 'confirmed',
      label: 'Confirmed',
      done: ['confirmed', 'shipped', 'delivered'].includes(order.order_status),
      time:
        order.order_status === 'pending' ? null : order.updated_at,
    },
    {
      key: 'shipped',
      label: 'Shipped',
      done: ['shipped', 'delivered'].includes(order.order_status),
      time:
        order.order_status === 'shipped' || order.order_status === 'delivered'
          ? order.updated_at
          : null,
    },
    {
      key: 'delivered',
      label: 'Delivered',
      done: order.order_status === 'delivered',
      time: order.order_status === 'delivered' ? order.updated_at : null,
    },
  ];

  return (
    <div
      style={{
        maxWidth: '720px',
        margin: '0 auto',
        padding: 'var(--space-6) var(--space-4)',
      }}
    >
      <Link
        href="/orders"
        className="btn btn-ghost btn-sm"
        style={{ marginBottom: 'var(--space-4)' }}
      >
        ← Back to orders
      </Link>

      {/* Header */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-5)',
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'monospace',
              fontSize: '1.125rem',
              fontWeight: 600,
            }}
          >
            {order.order_number}
          </h1>
          <p
            className="text-xs text-muted"
            style={{ marginTop: 'var(--space-1)' }}
          >
            Placed on {formatDate(order.created_at)}
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          <span className={`badge badge-${order.order_status}`}>
            {order.order_status}
          </span>
          <span
            className={`badge ${isPaid ? 'badge-paid' : 'badge-pending'}`}
          >
            {order.payment_method === 'cod'
              ? `COD · ${order.payment_status}`
              : order.payment_status}
          </span>
        </div>
      </header>

      {/* Items */}
      <section
        className="card"
        style={{ marginBottom: 'var(--space-4)' }}
      >
        <p
          className="input-label"
          style={{ marginBottom: 'var(--space-3)' }}
        >
          Items
        </p>
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
          }}
        >
          <li
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-secondary)',
                overflow: 'hidden',
                position: 'relative',
                flexShrink: 0,
              }}
            >
              {productImage ? (
                <Image
                  src={productImage}
                  alt={productName}
                  fill
                  sizes="64px"
                  style={{ objectFit: 'cover' }}
                />
              ) : null}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 500 }}>{productName}</p>
              <p className="text-sm text-muted">
                Size {order.size} · Qty {order.quantity}
              </p>
            </div>
            <p style={{ fontWeight: 600 }}>
              {formatPrice(order.unit_price_paise * order.quantity)}
            </p>
          </li>
        </ul>
      </section>

      {/* Totals */}
      <section
        className="card"
        style={{ marginBottom: 'var(--space-4)' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.875rem',
            marginBottom: 'var(--space-2)',
          }}
        >
          <span className="text-muted">Subtotal</span>
          <span>{formatPrice(order.subtotal_paise)}</span>
        </div>
        {order.discount_paise > 0 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.875rem',
              marginBottom: 'var(--space-2)',
              color: 'var(--accent-gold)',
            }}
          >
            <span>
              Discount{order.coupon_code ? ` (${order.coupon_code})` : ''}
            </span>
            <span>− {formatPrice(order.discount_paise)}</span>
          </div>
        )}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            paddingTop: 'var(--space-2)',
            borderTop: '1px solid var(--border-color)',
            marginTop: 'var(--space-2)',
            fontWeight: 600,
          }}
        >
          <span>Total</span>
          <span>{formatPrice(order.total_paise)}</span>
        </div>
      </section>

      {/* Delivery address */}
      <section
        className="card"
        style={{ marginBottom: 'var(--space-4)' }}
      >
        <p
          className="input-label"
          style={{ marginBottom: 'var(--space-3)' }}
        >
          Delivery address
        </p>
        <p style={{ fontWeight: 500 }}>{order.customer.name}</p>
        <p className="text-sm text-muted">{order.customer.phone}</p>
        <p
          className="text-sm"
          style={{ marginTop: 'var(--space-2)', lineHeight: 1.5 }}
        >
          {order.shipping_address.line1}
          {order.shipping_address.line2 ? `, ${order.shipping_address.line2}` : ''}
          <br />
          {order.shipping_address.city}, {order.shipping_address.state}{' '}
          {order.shipping_address.pincode}
        </p>
      </section>

      {/* Timeline OR cancelled banner */}
      {isCancelled ? (
        <section
          className="card"
          style={{
            borderColor: 'var(--error)',
            marginBottom: 'var(--space-4)',
          }}
        >
          <p
            className="input-label"
            style={{ color: 'var(--error)' }}
          >
            Order cancelled
          </p>
          {order.cancel_reason && (
            <p
              className="text-sm"
              style={{ marginTop: 'var(--space-2)' }}
            >
              {order.cancel_reason}
            </p>
          )}
        </section>
      ) : (
        <section
          className="card"
          style={{ marginBottom: 'var(--space-4)' }}
        >
          <p
            className="input-label"
            style={{ marginBottom: 'var(--space-4)' }}
          >
            Progress
          </p>
          <div className="timeline">
            {statusSteps.map((step) => (
              <div key={step.key} className="timeline-item">
                <div
                  className={`timeline-dot ${step.done ? 'timeline-dot-success' : ''}`}
                />
                <div className="timeline-content">
                  <div className="timeline-title">{step.label}</div>
                  {step.done && step.time && (
                    <div className="timeline-time">
                      {formatDate(step.time)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
