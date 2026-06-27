import React from 'react';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import CustomerDetailPanel from './CustomerDetailPanel';

export const dynamic = 'force-dynamic';

interface Params {
  id: string;
}

export default async function CustomerDetailPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const supabase = createAdminClient();

  // 1. Fetch Profile, Scores & Segments
  const { data: profileRaw, error: profileErr } = await supabase
    .from('customer_profiles')
    .select('*, scores:customer_scores(*), segments:customer_segments(segment_name)')
    .eq('id', id)
    .single();

  if (profileErr || !profileRaw) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: 'var(--space-8)', textAlign: 'center' }}>
        <h3>Customer profile not found</h3>
        <p style={{ fontSize: '0.8rem', marginTop: 'var(--space-3)' }}>
          Profile ID: {id} may have been merged or deleted.
        </p>
        <Link href="/admin/customers" className="btn btn-ghost" style={{ marginTop: 'var(--space-4)' }}>
          ← Back to Customers
        </Link>
      </div>
    );
  }

  // 2. Fetch Identity Links
  const { data: identityLinks } = await supabase
    .from('customer_identity_links')
    .select('*')
    .eq('customer_id', id);

  const links = identityLinks || [];

  // Extract keys to fetch related tables
  const userIds = links.filter((l) => l.identity_type === 'user_id').map((l) => l.identity_value);
  const anonIds = links.filter((l) => l.identity_type === 'anonymous_id').map((l) => l.identity_value);
  const emails = [profileRaw.email].filter((x): x is string => !!x);
  const phones = [profileRaw.phone].filter((x): x is string => !!x);

  // 3. Fetch Orders
  let ordersQuery = supabase.from('orders').select('*');
  if (userIds.length > 0) {
    if (emails.length > 0) {
      ordersQuery = ordersQuery.or(`user_id.in.(${userIds.join(',')}),customer->>email.in.(${emails.join(',')})`);
    } else {
      ordersQuery = ordersQuery.in('user_id', userIds);
    }
  } else if (emails.length > 0) {
    ordersQuery = ordersQuery.filter('customer->>email', 'in', `(${emails.join(',')})`);
  } else {
    ordersQuery = ordersQuery.eq('id', '00000000-0000-0000-0000-000000000000'); // empty fallback
  }
  const { data: ordersRaw } = await ordersQuery.order('created_at', { ascending: false });
  const orders = ordersRaw || [];

  // 4. Fetch Return Requests
  let returns: any[] = [];
  if (orders.length > 0) {
    const orderIds = orders.map((o) => o.id);
    const { data: returnsRaw } = await supabase
      .from('return_requests')
      .select('*')
      .in('order_id', orderIds)
      .order('created_at', { ascending: false });
    returns = returnsRaw || [];
  }

  // 5. Fetch Wishlist Items
  let wishlist: any[] = [];
  let wishlistQuery = supabase.from('wishlist_items').select('*, products(*)');
  if (userIds.length > 0) {
    if (anonIds.length > 0) {
      wishlistQuery = wishlistQuery.or(`user_id.in.(${userIds.join(',')}),anonymous_id.in.(${anonIds.join(',')})`);
    } else {
      wishlistQuery = wishlistQuery.in('user_id', userIds);
    }
  } else if (anonIds.length > 0) {
    wishlistQuery = wishlistQuery.in('anonymous_id', anonIds);
  } else {
    wishlistQuery = wishlistQuery.eq('id', '00000000-0000-0000-0000-000000000000');
  }
  const { data: wishlistRaw } = await wishlistQuery;
  wishlist = wishlistRaw || [];

  // 6. Fetch Recently Viewed Items
  let recentlyViewed: any[] = [];
  let recentlyViewedQuery = supabase.from('recently_viewed').select('*, products(*)');
  if (userIds.length > 0) {
    if (anonIds.length > 0) {
      recentlyViewedQuery = recentlyViewedQuery.or(`user_id.in.(${userIds.join(',')}),anonymous_id.in.(${anonIds.join(',')})`);
    } else {
      recentlyViewedQuery = recentlyViewedQuery.in('user_id', userIds);
    }
  } else if (anonIds.length > 0) {
    recentlyViewedQuery = recentlyViewedQuery.in('anonymous_id', anonIds);
  } else {
    recentlyViewedQuery = recentlyViewedQuery.eq('id', '00000000-0000-0000-0000-000000000000');
  }
  const { data: recentlyViewedRaw } = await recentlyViewedQuery.order('viewed_at', { ascending: false }).limit(20);
  recentlyViewed = recentlyViewedRaw || [];

  // 7. Fetch Marketing Event Logs for Timeline Stitching
  let events: any[] = [];
  let eventsQuery = supabase.from('marketing_events').select('*');
  if (userIds.length > 0) {
    if (anonIds.length > 0) {
      eventsQuery = eventsQuery.or(`user_id.in.(${userIds.join(',')}),anonymous_id.in.(${anonIds.join(',')})`);
    } else {
      eventsQuery = eventsQuery.in('user_id', userIds);
    }
  } else if (anonIds.length > 0) {
    eventsQuery = eventsQuery.in('anonymous_id', anonIds);
  } else {
    eventsQuery = eventsQuery.eq('id', '00000000-0000-0000-0000-000000000000');
  }
  const { data: eventsRaw } = await eventsQuery.order('created_at', { ascending: false }).limit(100);
  events = eventsRaw || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
        <Link href="/admin/customers" style={{ textDecoration: 'none', color: 'inherit' }}>
          ← Back to Customers List
        </Link>
      </button>

      {/* Main interactive Tab Panel */}
      <CustomerDetailPanel
        customer={profileRaw}
        links={links}
        orders={orders}
        returns={returns}
        wishlist={wishlist}
        recentlyViewed={recentlyViewed}
        marketingEvents={events}
      />
    </div>
  );
}
