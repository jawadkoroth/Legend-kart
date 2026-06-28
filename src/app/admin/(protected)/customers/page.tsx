import React from 'react';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import styles from './customers.module.css';
import { InfoTooltip } from '@/components/admin/AdminTooltip';
import CustomerTableClient from '@/components/admin/CustomerTableClient';

export const dynamic = 'force-dynamic';

interface CustomerRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  scores: {
    ltv_paise: number;
    total_orders: number;
    engagement_score: number;
    last_active: string | null;
    preferred_device: string | null;
  } | null;
  segments: Array<{ segment_name: string }>;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; segment?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q || '';
  const segment = sp.segment || '';
  const page = parseInt(sp.page || '1', 10);
  const limit = 20;
  const offset = (page - 1) * limit;

  const supabase = createAdminClient();

  // 1. Core Profile Query builders
  let query = supabase
    .from('customer_profiles')
    .select('*, scores:customer_scores(*), segments:customer_segments(segment_name)', { count: 'exact' });

  // 2. Filter by search query (checks name, email, phone, or identity links)
  if (q.trim()) {
    // Check if q matches any identity links first
    const { data: identityMatches } = await supabase
      .from('customer_identity_links')
      .select('customer_id')
      .ilike('identity_value', `%${q}%`);

    const matchedIds = (identityMatches || []).map((link) => link.customer_id);

    if (matchedIds.length > 0) {
      query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,id.in.(${matchedIds.join(',')})`);
    } else {
      query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
    }
  }

  // 3. Filter by segment
  if (segment) {
    const { data: segmentMatches } = await supabase
      .from('customer_segments')
      .select('customer_id')
      .eq('segment_name', segment);

    const matchedIds = (segmentMatches || []).map((seg) => seg.customer_id);
    query = query.in('id', matchedIds);
  }

  // 4. Execute paginated fetch
  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const customers = (data || []) as unknown as CustomerRow[];
  const totalCount = count || 0;
  const totalPages = Math.ceil(totalCount / limit);

  // 5. Fetch distinct segments list for filters dropdown
  const { data: segmentNames } = await supabase
    .from('customer_segments')
    .select('segment_name');

  const distinctSegments = Array.from(
    new Set((segmentNames || []).map((s) => s.segment_name))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      
      {/* Header telemetry stats */}
      <div className={styles.metricGrid}>
        <div className={styles.metricCard}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Customer Profiles</span>
          <h3 style={{ fontSize: '2rem', color: 'var(--text-primary)', margin: 'var(--space-2) 0' }}>{totalCount}</h3>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Unified stitched profile identities</span>
        </div>
        <div className={styles.metricCard}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Average Engagement <InfoTooltip content="Engagement points summarized from active page clicks and checkout orders." />
          </span>
          <h3 style={{ fontSize: '2rem', color: 'var(--accent-gold)', margin: 'var(--space-2) 0' }}>
            {customers.length > 0
              ? Math.round(customers.reduce((sum, c) => sum + (c.scores?.engagement_score || 0), 0) / customers.length)
              : 0} pts
          </h3>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Interaction scores summary</span>
        </div>
      </div>

      {/* Search & Filter Options */}
      <div className={styles.filterCard}>
        <form method="GET" style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', alignItems: 'center' }}>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search by name, email, phone, customer ID, or anonymous ID..."
            className={styles.inputField}
          />
          <select name="segment" defaultValue={segment} className={styles.inputField} style={{ width: '180px' }}>
            <option value="">All Segments</option>
            {distinctSegments.map((seg) => (
              <option key={seg} value={seg}>
                {seg}
              </option>
            ))}
          </select>
          <button type="submit" className={styles.btnPrimary} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
            Filter & Search
          </button>
        </form>
      </div>

      {/* Main Customers List */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '20px' }}>
        <CustomerTableClient
          customers={customers}
          total={totalCount}
          limit={limit}
          offset={offset}
        />
      </div>

    </div>
  );
}
