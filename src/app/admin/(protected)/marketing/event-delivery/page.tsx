import React from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import styles from '../marketing-admin.module.css';
import EventLogsTable from './EventLogsTable';

export const dynamic = 'force-dynamic';

interface MarketingEventLog {
  id: string;
  event_name: string;
  provider_status: Record<string, any> | null;
  provider_errors: Record<string, any> | null;
  duration: number | null;
  payload: any;
  correlation_id: string | null;
  created_at: string;
  anonymous_id: string;
  session_id: string;
  user_id: string | null;
}

export default async function EventDeliveryPage() {
  const supabase = createAdminClient();

  // Query last 100 event delivery logs from database
  const { data: logsRaw, error } = await supabase
    .from('marketing_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  const logs = (logsRaw || []) as unknown as MarketingEventLog[];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      
      {/* Overview stats */}
      <div className={styles.grid}>
        <div className={styles.card} style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Logs Tracked (Last 100)</span>
          <h3 style={{ fontSize: '2rem', color: 'var(--text-primary)', margin: 'var(--space-2) 0' }}>{logs.length}</h3>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Realtime events captured</span>
        </div>
        <div className={styles.card} style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Successful Deliveries</span>
          <h3 style={{ fontSize: '2rem', color: 'var(--success)', margin: 'var(--space-2) 0' }}>
            {logs.filter(l => !l.provider_errors || Object.keys(l.provider_errors).length === 0).length}
          </h3>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Status 200 OK without errors</span>
        </div>
        <div className={styles.card} style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Delivery Failures</span>
          <h3 style={{ fontSize: '2rem', color: 'var(--error)', margin: 'var(--space-2) 0' }}>
            {logs.filter(l => l.provider_errors && Object.keys(l.provider_errors).length > 0).length}
          </h3>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Dead letter queue retries pending</span>
        </div>
      </div>

      {/* Stripe-style Logs Inspector Table */}
      <div className={styles.card} style={{ overflowX: 'auto', padding: 0 }}>
        <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ textTransform: 'uppercase', fontSize: '0.85rem', color: 'var(--text-muted)', letterSpacing: '0.05em', margin: 0 }}>
            📡 Stripe-Style Event Delivery Logs
          </h3>
        </div>
        
        {error ? (
          <div style={{ padding: 'var(--space-5)', color: 'var(--error)' }}>
            Error loading logs: {error.message}
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 'var(--space-5)', color: 'var(--text-muted)', textAlign: 'center' }}>
            No marketing event logs recorded in database.
          </div>
        ) : (
          <EventLogsTable logs={logs} />
        )}
      </div>

    </div>
  );
}
