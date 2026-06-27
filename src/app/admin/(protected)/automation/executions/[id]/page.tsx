'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from '../../automation.module.css';

interface ExecutionDetail {
  id: string;
  workflow_id: string;
  status: 'started' | 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  retry_count: number;
  correlation_id: string | null;
  customer_id: string | null;
  trigger_source: string;
  trigger_payload: any;
  error_message: string | null;
  logs: Array<{
    timestamp: string;
    nodeId: string;
    nodeName: string;
    nodeType: string;
    status: 'info' | 'success' | 'failed' | 'paused';
    message: string;
  }>;
  workflows: {
    name: string;
    trigger_type: string;
  } | null;
  customer: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    tags: string[];
    applied_coupons: string[];
  } | null;
}

export default function ExecutionDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: executionId } = use(params);

  const [exec, setExec] = useState<ExecutionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replaying, setReplaying] = useState(false);
  const [activeTab, setActiveTab] = useState('logs');

  useEffect(() => {
    fetchExecutionDetails();
  }, [executionId]);

  const fetchExecutionDetails = async () => {
    try {
      const res = await fetch(`/api/admin/automation/executions/${executionId}`);
      if (!res.ok) throw new Error('Execution record not found');
      const data = await res.json();
      if (data.success && data.execution) {
        setExec(data.execution);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading execution details');
    } finally {
      setLoading(false);
    }
  };

  const handleReplay = async () => {
    if (!exec) return;
    if (!confirm('Rerun this execution using the original event payload?')) return;

    setReplaying(true);
    try {
      const res = await fetch(`/api/admin/automation/executions/${exec.id}/replay`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Replay failed');
      const data = await res.json();
      if (data.success) {
        alert('Replay trigger successfully dispatched.');
        fetchExecutionDetails();
      }
    } catch (err: any) {
      alert(err.message || 'Error occurred during replay');
    } finally {
      setReplaying(false);
    }
  };

  const getStatusBadge = (status: ExecutionDetail['status']) => {
    switch (status) {
      case 'completed':
        return <span className={`${styles.badge} ${styles.badgeSuccess}`}>Completed</span>;
      case 'failed':
        return <span className={`${styles.badge} ${styles.badgeFailed}`}>Failed</span>;
      case 'running':
        return <span className={`${styles.badge} ${styles.badgeRunning}`}>Running</span>;
      case 'started':
        return <span className={`${styles.badge} ${styles.badgeInfo}`}>Started</span>;
      default:
        return <span className={styles.badge}>{status}</span>;
    }
  };

  const getLogDotClass = (status: string) => {
    switch (status) {
      case 'success':
        return styles.dotSuccess;
      case 'failed':
        return styles.dotFailed;
      case 'paused':
        return styles.dotPaused;
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '300px', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        LOADING EXECUTION TRACE LOGS...
      </div>
    );
  }

  if (error || !exec) {
    return (
      <div className={styles.container}>
        <div className={styles.card} style={{ textAlign: 'center', padding: '50px 0' }}>
          <p style={{ color: 'var(--error)' }}>{error || 'Execution not found'}</p>
          <Link href="/admin/automation/executions" className={styles.btn}>
            ← Return to Executions
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      
      {/* Back link & Title header */}
      <div className={styles.headerRow}>
        <div className={styles.titleSection}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link href="/admin/automation/executions" style={{ color: 'var(--accent-gold)', fontSize: '0.85rem' }}>
              ← Back to executions
            </Link>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>DIAGNOSTICS TRACE</span>
          </div>
          <h2 style={{ marginTop: '4px' }}>
            Run Trace: {exec.workflows?.name || 'Workflow'}
          </h2>
          <p style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
            EXECUTION ID: {exec.id} • CORRELATION ID: {exec.correlation_id || 'n/a'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {exec.status === 'failed' && (
            <button
              onClick={handleReplay}
              disabled={replaying}
              className={`${styles.btn} ${styles.btnGold}`}
            >
              {replaying ? 'Replaying...' : '🔄 Rerun Execution'}
            </button>
          )}
        </div>
      </div>

      {/* Main summary panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', alignItems: 'start' }}>
        
        {/* Left Side: logs timeline & JSON payloads */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div className={styles.card}>
            {/* Tabs */}
            <div className={styles.tabsRow}>
              <button 
                onClick={() => setActiveTab('logs')}
                className={`${styles.tabBtn} ${activeTab === 'logs' ? styles.tabBtnActive : ''}`}
              >
                📝 Step Execution Logs ({exec.logs?.length || 0})
              </button>
              <button 
                onClick={() => setActiveTab('payload')}
                className={`${styles.tabBtn} ${activeTab === 'payload' ? styles.tabBtnActive : ''}`}
              >
                🔍 Event Trigger Payload (JSON)
              </button>
            </div>

            {/* Tab contents */}
            {activeTab === 'logs' ? (
              <div className={styles.timeline}>
                {(!exec.logs || exec.logs.length === 0) ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No steps recorded yet.</p>
                ) : (
                  exec.logs.map((log, idx) => (
                    <div key={idx} className={styles.timelineItem}>
                      <span className={`${styles.timelineDot} ${getLogDotClass(log.status)}`} />
                      <div className={styles.timelineHeader}>
                        <span className={styles.timelineName}>{log.nodeName}</span>
                        <span className={styles.timelineTime}>
                          {new Date(log.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}{'.'}
                          {new Date(log.timestamp).getMilliseconds().toString().padStart(3, '0')}
                        </span>
                        <span className={styles.timelineTime} style={{ color: 'var(--accent-gold)' }}>
                          ({log.nodeType.toUpperCase()})
                        </span>
                      </div>
                      <div className={styles.timelineMessage}>
                        {log.message}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div style={{ background: '#050505', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '15px', overflowX: 'auto' }}>
                <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.75rem', color: '#8FDB8F', lineHeight: '1.5' }}>
                  {JSON.stringify(exec.trigger_payload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Execution Telemetry and Customer CDP Profile info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Telemetry card */}
          <div className={styles.card} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', margin: 0 }}>
              Telemetry Indicators
            </h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                <strong>{getStatusBadge(exec.status)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Trigger Source:</span>
                <code style={{ fontSize: '0.75rem', color: 'var(--accent-gold)' }}>{exec.trigger_source}</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Duration:</span>
                <strong>{exec.duration_ms ? `${(exec.duration_ms / 1000).toFixed(2)}s` : 'n/a'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Reruns:</span>
                <strong>{exec.retry_count}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Started:</span>
                <span>{new Date(exec.started_at).toLocaleString('en-IN')}</span>
              </div>
              {exec.completed_at && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Completed:</span>
                  <span>{new Date(exec.completed_at).toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>
            
            {exec.error_message && (
              <div style={{ background: 'rgba(229,57,53,0.06)', border: '1px solid var(--error)', padding: '10px', borderRadius: '4px', marginTop: '10px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--error)', fontWeight: 'bold', textTransform: 'uppercase' }}>Error Message</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', marginTop: '4px', wordBreak: 'break-word', fontFamily: 'monospace' }}>
                  {exec.error_message}
                </div>
              </div>
            )}
          </div>

          {/* Customer CDP Profile */}
          <div className={styles.card} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', margin: 0 }}>
              CDP Customer Profile
            </h4>
            
            {exec.customer ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem', textTransform: 'uppercase' }}>Name</span>
                  <strong style={{ fontSize: '0.95rem' }}>{exec.customer.name || 'Anonymous Guest'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem', textTransform: 'uppercase' }}>Email</span>
                  <Link 
                    href={`/admin/customers/${exec.customer.id}`}
                    style={{ color: 'var(--accent-gold)', textDecoration: 'underline' }}
                  >
                    {exec.customer.email || 'n/a'}
                  </Link>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem', textTransform: 'uppercase' }}>Customer Tags</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                    {(!exec.customer.tags || exec.customer.tags.length === 0) ? (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No tags</span>
                    ) : (
                      exec.customer.tags.map(t => (
                        <span key={t} className={styles.badge} style={{ fontSize: '9px', borderColor: 'var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
                          {t}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem', textTransform: 'uppercase' }}>Applied Coupons</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                    {(!exec.customer.applied_coupons || exec.customer.applied_coupons.length === 0) ? (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No active coupons</span>
                    ) : (
                      exec.customer.applied_coupons.map(c => (
                        <span key={c} className={styles.badge} style={{ fontSize: '9px', borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)', background: 'rgba(201,168,106,0.03)' }}>
                          {c}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
                No customer identity profile associated with this trigger execution.
              </p>
            )}
          </div>

        </div>
      </div>

    </div>
  );
}
