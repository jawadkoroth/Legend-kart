import React from 'react';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import styles from './customers.module.css';
import { InfoTooltip } from '@/components/admin/AdminTooltip';

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
      <div className={styles.tableCard} style={{ overflowX: 'auto', padding: 0 }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Segments</th>
              <th>
                Lifetime Value (LTV) <InfoTooltip content="Lifetime Value (LTV) represents the total purchase revenue generated by this customer profile." />
              </th>
              <th>Orders</th>
              <th>Preferred Device</th>
              <th>Engagement Score</th>
              <th>Last Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {error ? (
              <tr>
                <td colSpan={8} style={{ color: 'var(--error)', padding: 'var(--space-5)', textAlign: 'center' }}>
                  Error fetching customers data: {error.message}
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ color: 'var(--text-muted)', padding: 'var(--space-5)', textAlign: 'center' }}>
                  No customer profiles matched the criteria.
                </td>
              </tr>
            ) : (
              customers.map((c) => {
                const preferredDevice = c.scores?.preferred_device || 'n/a';
                return (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <strong style={{ color: 'var(--text-primary)' }}>{c.name || 'Anonymous Guest'}</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.email || 'No email'}</span>
                        {c.phone && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.phone}</span>}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {c.segments && c.segments.length > 0 ? (
                          c.segments.map((s) => (
                            <span
                              key={s.segment_name}
                              className={styles.badge}
                              style={{
                                background: s.segment_name === 'VIP' ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.03)',
                                color: s.segment_name === 'VIP' ? 'var(--accent-gold)' : 'var(--text-secondary)',
                                borderColor: s.segment_name === 'VIP' ? 'var(--accent-gold)' : 'var(--border-color)'
                              }}
                            >
                              {s.segment_name}
                            </span>
                          ))
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>none</span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                      ₹{((c.scores?.ltv_paise || 0) / 100).toLocaleString('en-IN')}
                    </td>
                    <td>{c.scores?.total_orders || 0}</td>
                    <td style={{ textTransform: 'capitalize' }}>
                      {preferredDevice === 'mobile' && '📱 Mobile'}
                      {preferredDevice === 'tablet' && '📟 Tablet'}
                      {preferredDevice === 'desktop' && '💻 Desktop'}
                      {preferredDevice === 'n/a' && 'Unknown'}
                    </td>
                    <td>
                      <span className={styles.badge} style={{ background: 'rgba(0,188,212,0.08)', color: '#00BCD4' }}>
                        {c.scores?.engagement_score || 0} pts
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {c.scores?.last_active ? new Date(c.scores.last_active).toLocaleDateString('en-IN') : 'n/a'}
                    </td>
                    <td>
                      <Link href={`/admin/customers/${c.id}`} className={styles.btnLink}>
                        View Profile ↗
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 20px', borderTop: '1px solid var(--border-color)', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Showing Page {page} of {totalPages}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {page > 1 && (
                <Link href={`/admin/customers?q=${q}&segment=${segment}&page=${page - 1}`} className={styles.btnOutline}>
                  Previous
                </Link>
              )}
              {page < totalPages && (
                <Link href={`/admin/customers?q=${q}&segment=${segment}&page=${page + 1}`} className={styles.btnOutline}>
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
