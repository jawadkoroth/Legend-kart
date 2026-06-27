import React from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import styles from './marketing-admin.module.css';

export const dynamic = 'force-dynamic';

export default async function MarketingOverviewPage() {
  const supabase = createAdminClient();

  // 1. Fetch Event Metrics
  const { count: totalEvents } = await supabase
    .from('marketing_events')
    .select('id', { count: 'exact', head: true });

  const { count: clientEvents } = await supabase
    .from('marketing_events')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'client');

  const { count: serverEvents } = await supabase
    .from('marketing_events')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'server');

  // 2. Fetch Providers status
  const { data: providers } = await supabase
    .from('marketing_providers')
    .select('id, enabled');

  const activeCount = providers?.filter(p => p.enabled).length || 0;

  // 3. Fetch Consent distribution
  const { count: totalConsent } = await supabase
    .from('marketing_consent')
    .select('id', { count: 'exact', head: true });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Metric Cards Grid */}
      <div className={styles.grid}>
        <div className={styles.card}>
          <span className={styles.label}>Total Marketing Events</span>
          <p style={{ fontSize: '2.5rem', fontWeight: '600', margin: 'var(--space-2) 0', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
            {totalEvents || 0}
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-4)', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            <span>💻 Browser: {clientEvents || 0}</span>
            <span>🖥️ Server: {serverEvents || 0}</span>
          </div>
        </div>

        <div className={styles.card}>
          <span className={styles.label}>Active Destinations</span>
          <p style={{ fontSize: '2.5rem', fontWeight: '600', margin: 'var(--space-2) 0', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
            {activeCount} <span style={{ fontSize: '1rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>/ {providers?.length || 3}</span>
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {providers?.map((p) => (
              <span
                key={p.id}
                className={`${styles.badge} ${p.enabled ? styles.indicatorSuccess : ''}`}
                style={{ textTransform: 'uppercase', padding: '2px 8px', fontSize: '10px' }}
              >
                {p.id}: {p.enabled ? 'ON' : 'OFF'}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.card}>
          <span className={styles.label}>Consent Audits</span>
          <p style={{ fontSize: '2.5rem', fontWeight: '600', margin: 'var(--space-2) 0', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
            {totalConsent || 0}
          </p>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Total auditable preference records captured.
          </p>
        </div>
      </div>

      {/* Platform Description */}
      <div className={styles.card} style={{ borderLeft: '3px solid var(--accent-gold)' }}>
        <h2 className={styles.title} style={{ fontSize: '1.25rem', marginBottom: 'var(--space-2)' }}>
          Sprint 1 Foundations Active
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: '1.6' }}>
          Every interaction emitting from browser user sessions or server-side transactional controllers triggers flows through the consolidated Event Engine. 
          The dispatcher batches event payloads, verifies compliance checks via the local cookie consent manager, 
          and triggers client or server integrations behind standard interfaces. Live events appear under the <strong>Event Inspector</strong> tab.
        </p>
      </div>
    </div>
  );
}
