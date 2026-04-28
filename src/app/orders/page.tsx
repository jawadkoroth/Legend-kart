import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * /orders — authenticated list of the current user's orders.
 *
 * Server component. The cookie-bound SSR client doubles as the auth
 * gate: if `auth.getUser()` returns null we redirect to /auth with
 * a `next` query so the user is bounced back here after sign-in.
 *
 * Strict ownership: every row returned has `user_id = auth.uid()`,
 * enforced both by our explicit `.eq('user_id', user.id)` filter AND
 * by the migration-006 RLS policy (`USING (user_id = auth.uid())`)
 * as belt-and-braces.
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
    <div
      style={{
        maxWidth: '720px',
        margin: '0 auto',
        padding: 'var(--space-6) var(--space-4)',
      }}
    >
      <header style={{ marginBottom: 'var(--space-6)' }}>
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '1.75rem',
            fontWeight: 500,
            letterSpacing: '-0.01em',
          }}
        >
          Your orders
        </h1>
        <p
          className="text-sm text-muted"
          style={{ marginTop: 'var(--space-2)' }}
        >
          {orders.length === 0
            ? 'You haven’t placed any orders yet.'
            : `${orders.length} order${orders.length === 1 ? '' : 's'}`}
        </p>
      </header>

      {orders.length === 0 ? (
        <div
          className="card"
          style={{ textAlign: 'center', padding: 'var(--space-8)' }}
        >
          <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>
            When you place an order, it will appear here.
          </p>
          <Link href="/" className="btn btn-secondary">
            Continue shopping
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="order-card"
            >
              <div className="order-card-header">
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: '0.8125rem',
                    fontFamily: 'monospace',
                  }}
                >
                  {order.order_number}
                </span>
                <span className={`badge badge-${order.order_status}`}>
                  {order.order_status}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.8125rem',
                  color: 'var(--text-muted)',
                }}
              >
                <span>{formatDate(order.created_at)}</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
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
