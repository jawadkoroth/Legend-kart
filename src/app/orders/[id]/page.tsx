import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import styles from '../orders.module.css';

/**
 * /orders/[id] — authenticated order detail.
 *
 * UI is fully owned by the scoped `orders.module.css`. Logic, auth,
 * and ownership enforcement are unchanged: cookie-bound SSR client,
 * `.eq('user_id', user.id)` filter, RLS policy, AND a final equality
 * check before render — any single regression still fails closed
 * with `notFound()`.
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

const ALLOWED_STATUSES = [
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
] as const;
type OrderStatus = (typeof ALLOWED_STATUSES)[number];

function safeStatus(s: string): OrderStatus {
  return (ALLOWED_STATUSES as readonly string[]).includes(s)
    ? (s as OrderStatus)
    : 'pending';
}

function badgeClass(status: string): string {
  return `${styles.badge} ${styles[`badge_${safeStatus(status)}`]}`;
}

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

/**
 * Stepper progress mapping (per spec):
 *   pending    → 0%   (track only, step 1 marked current)
 *   confirmed  → 33%  (step 1 done, step 2 current)
 *   shipped    → 66%  (steps 1-2 done, step 3 current)
 *   delivered  → 100% (all steps done)
 *   cancelled  → no fill, all dots muted, banner replaces stepper
 */
const STEP_INDEX: Record<OrderStatus, number> = {
  pending: 0,
  confirmed: 1,
  shipped: 2,
  delivered: 3,
  cancelled: -1,
};

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

  const order = data as unknown as OrderDetail;
  if (order.user_id !== user.id) {
    notFound();
  }

  const status = safeStatus(order.order_status);
  const isCancelled = status === 'cancelled';
  const isPaid = order.payment_status === 'paid';

  const productImage =
    Array.isArray(order.products?.images) && order.products?.images?.[0]
      ? order.products.images[0]
      : null;
  const productName = order.products?.name ?? 'Product';

  // Build the stepper steps. `done` = strictly past steps; `current`
  // = the active step (next-to-arrive), styled with the gold pulse.
  const steps: { key: string; label: string; time: string | null }[] = [
    { key: 'placed', label: 'Placed', time: order.created_at },
    { key: 'confirmed', label: 'Confirmed', time: status === 'pending' ? null : order.updated_at },
    { key: 'shipped', label: 'Shipped', time: status === 'shipped' || status === 'delivered' ? order.updated_at : null },
    { key: 'delivered', label: 'Delivered', time: status === 'delivered' ? order.updated_at : null },
  ];
  const activeIdx = STEP_INDEX[status]; // -1 for cancelled

  return (
    <div className={styles.page}>
      <Link href="/orders" className={styles.back}>
        ← Back to orders
      </Link>

      {/* Header */}
      <header className={styles.detailHeader}>
        <div>
          <h1 className={styles.orderNumber}>{order.order_number}</h1>
          <p className={styles.placedAt}>
            Placed on {formatDate(order.created_at)}
          </p>
        </div>
        <div className={styles.badgeRow}>
          <span className={badgeClass(order.order_status)}>
            {order.order_status}
          </span>
          <span
            className={`${styles.badge} ${isPaid ? styles.badge_paid : styles.badge_unpaid
              }`}
          >
            {order.payment_method === 'cod'
              ? `COD · ${order.payment_status}`
              : order.payment_status}
          </span>
        </div>
      </header>

      {/* Stepper or cancelled banner */}
      {isCancelled ? (
        <section className={styles.cancelledBanner}>
          <p className={styles.cancelledLabel}>Order cancelled</p>
          {order.cancel_reason && (
            <p className={styles.cancelledReason}>{order.cancel_reason}</p>
          )}
        </section>
      ) : (
        <section className={styles.section}>
          <p className={styles.sectionLabel}>Progress</p>
          <div
            className={styles.stepper}
            role="list"
            aria-label="Order progress"
          >
            <div className={styles.stepperTrack} aria-hidden="true">
              <div
                className={`${styles.stepperFill} ${styles[`fill_${status}`]}`}
              />
            </div>
            {steps.map((step, idx) => {
              const isPastOrCurrent = idx <= activeIdx;
              const isCurrent = idx === activeIdx && status !== 'delivered';
              const dotClass = [
                styles.dot,
                isPastOrCurrent ? styles.dotDone : '',
                isCurrent ? styles.dotCurrent : '',
              ]
                .filter(Boolean)
                .join(' ');
              const labelClass = `${styles.stepLabel} ${isPastOrCurrent ? styles.stepLabelDone : ''
                }`;
              return (
                <div
                  key={step.key}
                  className={styles.step}
                  role="listitem"
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  <span className={dotClass} aria-hidden="true" />
                  <span className={labelClass}>{step.label}</span>
                  {step.time && isPastOrCurrent ? (
                    <span className={styles.stepTime}>
                      {formatDate(step.time)}
                    </span>
                  ) : null}
                  <span className={styles.srOnly}>
                    {`Step ${idx + 1} of ${steps.length}: ${step.label}, ${isCurrent ? 'in progress' : isPastOrCurrent ? 'completed' : 'pending'
                      }`}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Items */}
      <section className={styles.section}>
        <p className={styles.sectionLabel}>Items</p>
        <ul className={styles.itemList}>
          <li className={styles.itemRow}>
            <div className={styles.thumb}>
              {productImage ? (
                <Image
                  src={productImage}
                  alt={productName}
                  fill
                  sizes="72px"
                  style={{ objectFit: 'cover' }}
                />
              ) : null}
            </div>
            <div className={styles.itemMeta}>
              <p className={styles.itemName}>{productName}</p>
              <p className={styles.itemSub}>
                Size {order.size} · Qty {order.quantity}
              </p>
            </div>
            <p className={styles.itemPrice}>
              {formatPrice(order.unit_price_paise * order.quantity)}
            </p>
          </li>
        </ul>
      </section>

      {/* Totals */}
      <section className={styles.section}>
        <p className={styles.sectionLabel}>Summary</p>
        <div className={`${styles.totalsRow} ${styles.totalsRowMuted}`}>
          <span>Subtotal</span>
          <span>{formatPrice(order.subtotal_paise)}</span>
        </div>
        {order.discount_paise > 0 && (
          <div className={`${styles.totalsRow} ${styles.totalsRowDiscount}`}>
            <span>
              Discount{order.coupon_code ? ` (${order.coupon_code})` : ''}
            </span>
            <span>− {formatPrice(order.discount_paise)}</span>
          </div>
        )}
        <div className={styles.totalsTotal}>
          <span>Total</span>
          <span>{formatPrice(order.total_paise)}</span>
        </div>
      </section>

      {/* Delivery address */}
      <section className={styles.section}>
        <p className={styles.sectionLabel}>Delivery address</p>
        <p className={styles.addressName}>{order.customer.name}</p>
        <p className={styles.addressPhone}>{order.customer.phone}</p>
        <p className={styles.addressLines}>
          {order.shipping_address.line1}
          {order.shipping_address.line2 ? `, ${order.shipping_address.line2}` : ''}
          <br />
          {order.shipping_address.city}, {order.shipping_address.state}{' '}
          {order.shipping_address.pincode}
        </p>
      </section>
    </div>
  );
}
