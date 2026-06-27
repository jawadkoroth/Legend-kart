import React from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import styles from '../marketing-admin.module.css';

export const dynamic = 'force-dynamic';

export default async function MarketingDiagnosticsPage() {
  const supabase = createAdminClient();

  let dbStatus: 'ok' | 'error' = 'ok';
  let dbMessage = 'Operational';
  
  let totalEvents = 0;
  let totalConsent = 0;
  let dlqEventsCount = 0;
  let invalidEventsCount = 0;
  let avgLatency = 0;
  let providerCount = 0;

  try {
    const { count: eventsCount } = await supabase
      .from('marketing_events')
      .select('id', { count: 'exact', head: true });

    const { count: consentCount } = await supabase
      .from('marketing_consent')
      .select('id', { count: 'exact', head: true });

    const { count: dlqCount } = await supabase
      .from('marketing_events')
      .select('id', { count: 'exact', head: true })
      .eq('in_dlq', true);

    // Fetch invalid events (validation_errors is not empty JSONB)
    const { data: recentEvents, error } = await supabase
      .from('marketing_events')
      .select('duration, validation_errors')
      .order('ts_server', { ascending: false })
      .limit(100);

    if (error) {
      dbStatus = 'error';
      dbMessage = 'Table Access Error / Out of Sync Schema';
    } else {
      totalEvents = eventsCount || 0;
      totalConsent = consentCount || 0;
      dlqEventsCount = dlqCount || 0;

      if (recentEvents && recentEvents.length > 0) {
        let sumDuration = 0;
        let countedDuration = 0;

        recentEvents.forEach((ev) => {
          if (ev.duration) {
            sumDuration += ev.duration;
            countedDuration++;
          }
          if (Array.isArray(ev.validation_errors) && ev.validation_errors.length > 0) {
            invalidEventsCount++;
          }
        });

        avgLatency = countedDuration > 0 ? Math.round(sumDuration / countedDuration) : 0;
      }
    }
  } catch (err: any) {
    dbStatus = 'error';
    dbMessage = err.message || 'Supabase Link Offline';
  }

  // Fetch Providers
  const { data: dbProviders } = await supabase
    .from('marketing_providers')
    .select('id, enabled, status, last_error');

  providerCount = dbProviders?.length || 0;
  const active = dbProviders?.filter((p) => p.enabled) || [];

  // Compute breakdown scores
  const dbScore = dbStatus === 'ok' ? 100 : 0;
  
  let providerScore = 100;
  if (active.length > 0) {
    const broken = active.filter((p) => p.status === 'error').length;
    providerScore = Math.max(0, 100 - (broken / active.length) * 50);
  }

  // Queue & Validation scores on last 100 events
  const totalCounted = 100;
  const dlqScore = Math.max(0, 100 - (dlqEventsCount > 0 ? (dlqEventsCount / Math.max(1, totalEvents)) * 100 : 0));
  const validationScore = Math.max(0, 100 - (invalidEventsCount / totalCounted) * 100);

  const overallHealth = Math.round(
    (dbScore * 0.2) + (providerScore * 0.3) + (dlqScore * 0.3) + (validationScore * 0.2)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Visual Health Score Widget */}
      <div
        className={styles.card}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-6)',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-color)',
          padding: 'var(--space-5)',
        }}
      >
        <div
          style={{
            minWidth: '110px',
            height: '110px',
            borderRadius: '50%',
            background: 'rgba(0, 0, 0, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `4px solid ${overallHealth >= 90 ? 'var(--success)' : overallHealth >= 70 ? 'var(--warning)' : 'var(--error)'}`,
            boxShadow: '0 0 15px rgba(255,255,255,0.02)',
          }}
        >
          <strong style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
            {overallHealth}%
          </strong>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>
            Overall Platform Health Score
          </h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', maxWidth: '460px', margin: 0 }}>
            Aggregates indices across DB write layers (20%), Provider connection status (30%), Queue/DLQ rates (30%), and Event Validation accuracy (20%).
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginTop: '4px' }}>
            <span style={{ fontSize: '0.75rem' }}>🗄️ Database: <strong style={{ color: 'var(--text-primary)' }}>{dbScore}%</strong></span>
            <span style={{ fontSize: '0.75rem' }}>🔌 Providers: <strong style={{ color: 'var(--text-primary)' }}>{providerScore}%</strong></span>
            <span style={{ fontSize: '0.75rem' }}>📬 DLQ/Queue: <strong style={{ color: 'var(--text-primary)' }}>{Math.round(dlqScore)}%</strong></span>
            <span style={{ fontSize: '0.75rem' }}>🧪 Validation: <strong style={{ color: 'var(--text-primary)' }}>{Math.round(validationScore)}%</strong></span>
          </div>
        </div>
      </div>

      <div className={styles.grid}>
        {/* DB Connectivity Card */}
        <div className={styles.card} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-3)' }}>
              Database Connectivity
            </h3>
            <p style={{ fontSize: '1.25rem', fontWeight: '500', color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
              Supabase Storage Lake
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Total Logs: <strong>{totalEvents}</strong> events in archive. Reads and writes tables check.
            </p>
          </div>
          <div style={{ marginTop: 'var(--space-6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className={`${styles.indicator} ${dbStatus === 'ok' ? styles.indicatorSuccess : styles.indicatorError}`}>
              {dbStatus === 'ok' ? '✓ Connected' : '✗ Offline'}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {dbMessage}
            </span>
          </div>
        </div>

        {/* Queue & Dispatcher Health */}
        <div className={styles.card} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-3)' }}>
              Queue & DLQ Health
            </h3>
            <p style={{ fontSize: '1.25rem', fontWeight: '500', color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
              Dispatcher Batch Engine
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              <div>• Mean Processing Duration: <strong>{avgLatency}ms</strong></div>
              <div>• Quarantined in DLQ: <strong style={{ color: dlqEventsCount > 0 ? 'var(--error)' : 'inherit' }}>{dlqEventsCount}</strong></div>
            </div>
          </div>
          <div style={{ marginTop: 'var(--space-6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className={`${styles.indicator} ${dlqEventsCount === 0 ? styles.indicatorSuccess : styles.indicatorWarning}`}>
              {dlqEventsCount === 0 ? '✓ Healthy' : '⚠ Action Required'}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {dlqEventsCount === 0 ? 'No stuck events' : `${dlqEventsCount} in DLQ`}
            </span>
          </div>
        </div>

        {/* Consent System Health */}
        <div className={styles.card} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-3)' }}>
              Event Validation Engine
            </h3>
            <p style={{ fontSize: '1.25rem', fontWeight: '500', color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
              Registry Schema Gates
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Simulated or invalid inputs caught: <strong>{invalidEventsCount}</strong> in recent telemetry. Blocks corrupted payloads from routing.
            </p>
          </div>
          <div style={{ marginTop: 'var(--space-6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className={`${styles.indicator} ${validationScore >= 95 ? styles.indicatorSuccess : styles.indicatorWarning}`}>
              {validationScore >= 95 ? '✓ Clean Data' : '⚠ Validation Triggers'}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {Math.round(validationScore)}% Valid Ratio
            </span>
          </div>
        </div>
      </div>

      {/* Integration Providers Health Grid */}
      <h2 className={styles.title} style={{ fontSize: '1.25rem', marginTop: 'var(--space-4)' }}>
        Destination Provider Integration Health
      </h2>
      
      <div className={styles.grid}>
        {dbProviders?.map((prov) => {
          const isErr = prov.status === 'error';
          const isEnabled = prov.enabled;

          return (
            <div key={prov.id} className={styles.card} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                  <h4 style={{ textTransform: 'uppercase', fontWeight: '600', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    {prov.id} Adapter
                  </h4>
                  <span className={styles.badge} style={{ fontSize: '9px' }}>
                    {isEnabled ? 'ENABLED' : 'DISABLED'}
                  </span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {prov.id === 'meta' && 'Server conversions API matching and browser event trigger state.'}
                  {prov.id === 'google' && 'Google Tag Manager / GA4 endpoint connection and tags verification.'}
                  {prov.id === 'console' && 'Standard standard out pipeline for developer debugging prints.'}
                </p>
                {isErr && prov.last_error && (
                  <div style={{ marginTop: 'var(--space-3)', background: 'rgba(229, 57, 53, 0.05)', color: 'var(--error)', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', fontSize: '0.7rem', fontFamily: 'monospace' }}>
                    Error: {prov.last_error}
                  </div>
                )}
              </div>
              <div style={{ marginTop: 'var(--space-6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {!isEnabled ? (
                  <span className={styles.indicator} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                    Off
                  </span>
                ) : prov.status === 'connected' ? (
                  <span className={`${styles.indicator} ${styles.indicatorSuccess}`}>
                    Green
                  </span>
                ) : prov.status === 'error' ? (
                  <span className={`${styles.indicator} ${styles.indicatorError}`}>
                    Red
                  </span>
                ) : (
                  <span className={`${styles.indicator} ${styles.indicatorWarning}`}>
                    Yellow
                  </span>
                )}
                
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {isEnabled ? (isErr ? 'Error status' : 'Active connection') : 'Inactive'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
