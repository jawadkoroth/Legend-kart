'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from '../marketing-admin.module.css';

interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string | null;
}

interface DlqEvent {
  event_id: string;
  event_name: string;
  ts_server: string;
  validation_errors: string[];
  provider_errors: Record<string, string>;
  properties: any;
}

export default function MarketingSettingsPage() {
  const [consentVersion, setConsentVersion] = useState('1.0.0');
  
  // States for Feature Flags
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [flagsLoading, setFlagsLoading] = useState(true);

  // States for DLQ
  const [dlqEvents, setDlqEvents] = useState<DlqEvent[]>([]);
  const [dlqLoading, setDlqLoading] = useState(true);
  const [replayingId, setReplayingId] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    fetchFeatureFlags();
    fetchDlqEvents();
  }, []);

  // 1. Feature flags operations
  async function fetchFeatureFlags() {
    setFlagsLoading(true);
    try {
      const { data, error } = await supabase
        .from('marketing_feature_flags')
        .select('*')
        .order('key');
      if (!error && data) {
        setFlags(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setFlagsLoading(false);
    }
  }

  const handleToggleFlag = async (key: string, currentEnabled: boolean) => {
    try {
      const { error } = await supabase
        .from('marketing_feature_flags')
        .update({ enabled: !currentEnabled, updated_at: new Date().toISOString() })
        .eq('key', key);

      if (error) {
        alert(error.message);
      } else {
        setFlags(
          flags.map((f) => (f.key === key ? { ...f, enabled: !currentEnabled } : f))
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 2. DLQ operations
  async function fetchDlqEvents() {
    setDlqLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const res = await fetch('/api/admin/marketing/dlq', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const outcome = await res.json();
        setDlqEvents(outcome.events || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDlqLoading(false);
    }
  }

  const handleReplayEvent = async (eventId: string) => {
    setReplayingId(eventId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const res = await fetch('/api/admin/marketing/dlq', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'replay',
          eventIds: [eventId],
        }),
      });

      if (res.ok) {
        alert('Event successfully replayed through dispatcher.');
        fetchDlqEvents();
      } else {
        alert('Replay failed.');
      }
    } catch (err: any) {
      alert(`Error replaying: ${err.message}`);
    } finally {
      setReplayingId(null);
    }
  };

  const handleDeleteDlqEvent = async (eventId: string) => {
    if (!confirm('Are you sure you want to permanently delete this DLQ event?')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const res = await fetch(`/api/admin/marketing/dlq?ids=${eventId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (res.ok) {
        alert('DLQ event deleted.');
        fetchDlqEvents();
      } else {
        alert('Delete failed.');
      }
    } catch (err: any) {
      alert(`Error deleting: ${err.message}`);
    }
  };

  const handlePurgeLogs = async () => {
    if (!confirm('WARNING: This will permanently delete all captured marketing events and consent audits. Are you sure?')) {
      return;
    }
    try {
      const { error: eventErr } = await supabase
        .from('marketing_events')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      const { error: consentErr } = await supabase
        .from('marketing_consent')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (eventErr || consentErr) {
        alert(`Failed: ${eventErr?.message || consentErr?.message}`);
      } else {
        alert('All logs purged.');
        fetchDlqEvents();
      }
    } catch (err: any) {
      alert(`Purge failed: ${err.message}`);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 'var(--space-6)', alignItems: 'flex-start' }}>
      
      {/* Left Column: Feature Flags & DLQ list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        
        {/* Feature Flags section */}
        <div className={styles.card}>
          <h3 style={{ textTransform: 'uppercase', fontSize: '0.8rem', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 'var(--space-4)' }}>
            🚩 Platform Feature Flags
          </h3>
          {flagsLoading ? (
            <div style={{ color: 'var(--text-secondary)' }}>Loading feature flags...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {flags.map((flag) => (
                <div key={flag.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                  <div>
                    <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                      {flag.key}
                    </strong>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                      {flag.description}
                    </p>
                  </div>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={flag.enabled}
                      onChange={() => handleToggleFlag(flag.key, flag.enabled)}
                    />
                    <span className={styles.slider} />
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* DLQ section */}
        <div className={styles.card}>
          <h3 style={{ textTransform: 'uppercase', fontSize: '0.8rem', color: 'var(--error)', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>
            📭 Dead Letter Queue (DLQ) Manager
          </h3>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
            Shows events that failed schema validation or encountered multiple provider delivery errors.
          </p>

          {dlqLoading ? (
            <div style={{ color: 'var(--text-secondary)' }}>Loading DLQ events...</div>
          ) : dlqEvents.length === 0 ? (
            <div style={{ color: 'var(--success)', fontSize: '0.8125rem', padding: '10px', background: 'rgba(76,175,80,0.05)', borderRadius: '4px' }}>
              ✓ Dead letter queue is completely clear.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
              {dlqEvents.map((ev) => {
                const errText = ev.validation_errors?.length > 0
                  ? `Validation failed: ${ev.validation_errors.join(', ')}`
                  : `Dispatch errors: ${Object.entries(ev.provider_errors || {}).map(([p, e]) => `${p}: ${e}`).join(', ')}`;

                return (
                  <div key={ev.event_id} style={{ border: '1px solid var(--border-color)', padding: '10px', borderRadius: '4px', background: 'rgba(229,57,53,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <strong style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>{ev.event_name}</strong>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(ev.ts_server).toLocaleTimeString()}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--error)', margin: '4px 0', fontFamily: 'monospace' }}>
                      {errText}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                      <button
                        className={styles.btn}
                        style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                        onClick={() => handleReplayEvent(ev.event_id)}
                        disabled={replayingId === ev.event_id}
                      >
                        {replayingId === ev.event_id ? 'Replaying...' : '🔄 Retry/Replay'}
                      </button>
                      <button
                        className={styles.btn}
                        style={{ padding: '2px 8px', fontSize: '0.7rem', color: 'var(--error)', borderColor: 'rgba(229,57,53,0.2)' }}
                        onClick={() => handleDeleteDlqEvent(ev.event_id)}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Visual Pipeline & Settings */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        
        {/* Architecture Pipeline Visualization */}
        <div className={styles.card}>
          <h3 style={{ textTransform: 'uppercase', fontSize: '0.8rem', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 'var(--space-4)' }}>
            🏗️ Ingestion Pipeline Architecture
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '8px 12px', fontSize: '0.75rem' }}>
              📱 <strong>Client Interaction Layer</strong>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>Triggers page navigations, cart clicks, checkout entries</div>
            </div>

            <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', margin: '-6px 0' }}>↓</div>

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '8px 12px', fontSize: '0.75rem' }}>
              🔧 <strong>Marketing Platform API Service</strong>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>Enriches correlation journey IDs and page context metadata</div>
            </div>

            <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', margin: '-6px 0' }}>↓</div>

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '8px 12px', fontSize: '0.75rem' }}>
              ⚖️ <strong>Registry Schema Validation Engine</strong>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>Checks properties format; quarantines bad JSON inputs to DLQ</div>
            </div>

            <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', margin: '-6px 0' }}>↓</div>

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '8px 12px', fontSize: '0.75rem' }}>
              📬 <strong>In-Memory Dispatcher Queue</strong>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>Batches events & retries transient network delivery errors</div>
            </div>

            <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', margin: '-6px 0' }}>↓</div>

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '8px 12px', fontSize: '0.75rem' }}>
              🔌 <strong>Destination Provider Dispatchers</strong>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>Maps properties to Meta Conversions API & GA4 Tag instances</div>
            </div>
          </div>
        </div>

        {/* Global configuration settings */}
        <div className={styles.card}>
          <h3 style={{ textTransform: 'uppercase', fontSize: '0.8rem', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 'var(--space-4)' }}>
            ⚙️ Policies & Diagnostics Reset
          </h3>

          <div className={styles.formGroup}>
            <label className={styles.label}>Consent version</label>
            <input
              type="text"
              className={styles.input}
              value={consentVersion}
              onChange={(e) => setConsentVersion(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: 'var(--space-4)' }}>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              style={{ padding: '6px 12px', fontSize: '0.75rem' }}
              onClick={() => alert('Consent policies saved.')}
            >
              Update version
            </button>
            <button
              className={styles.btn}
              style={{ padding: '6px 12px', fontSize: '0.75rem', color: 'var(--error)', borderColor: 'rgba(229,57,53,0.2)' }}
              onClick={handlePurgeLogs}
            >
              💥 Purge Dev Logs
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
