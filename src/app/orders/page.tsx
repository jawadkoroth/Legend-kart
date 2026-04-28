import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import styles from './orders.module.css';

/**
 * /orders — authenticated list of the current user's orders.
 *
 * UI is fully owned by `orders.module.css` (scoped). Logic, auth, and
 * data fetching are unchanged from the previous implementation:
 * cookie-bound SSR client → redirect to /auth if signed-out → strict
 * `.eq('user_id', user.id)` filter (RLS belt-and-braces).
 */
export const dynamic = 'force-dynamic';

type OrderRow = {
  id: string;
  order_number: string;
  total_paise: number;
  order_status: string;
  payment_status: string;
  payment_method: string;
  created_at: string;
};

const ALLOWED_STATUSES = [
  'pending',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
] as const;
type OrderStatus = (typeof ALLOWED_STATUSES)[number];

function badgeClass(status: string): string {
  const safe: OrderStatus = (ALLOWED_STATUSES as readonly string[]).includes(status)
    ? (status as OrderStatus)
    : 'pending';
  return `${styles.badge} ${styles[`badge_${safe}`]}`;
}

const formatPrice = (paise: number) =>
  '₹' + (paise / 100).toLocaleString('en-IN');

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export default async function OrdersPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth?next=/orders');
  }

  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, order_number, total_paise, order_status, payment_status, payment_method, created_at',
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const orders: OrderRow[] = error || !data ? [] : (data as OrderRow[]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Your orders</h1>
        <p className={styles.subtitle}>
          {orders.length === 0
            ? 'You haven’t placed any orders yet.'
            : `${orders.length} order${orders.length === 1 ? '' : 's'}`}
        </p>
      </header>

      {orders.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>
            When you place an order, it will appear here.
          </p>
          <Link href="/" className={styles.emptyLink}>
            Continue shopping
          </Link>
        </div>
      ) : (
        <div className={styles.list}>
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className={styles.card}
            >
              <div className={styles.cardHeader}>
                <span className={styles.orderNumber}>{order.order_number}</span>
                <span className={badgeClass(order.order_status)}>
                  {order.order_status}
                </span>
              </div>
              <div className={styles.cardMeta}>
                <span>{formatDate(order.created_at)}</span>
                <span className={styles.cardTotal}>
                  {formatPrice(order.total_paise)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
