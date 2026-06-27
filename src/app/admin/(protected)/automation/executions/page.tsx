'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from '../automation.module.css';

interface Execution {
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
  workflows: {
    name: string;
    trigger_type: string;
  } | null;
  customer: {
    name: string | null;
    email: string | null;
  } | null;
}

export default function ExecutionsPage() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [replayingId, setReplayingId] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const limit = 20;

  useEffect(() => {
    fetchExecutions();
  }, [statusFilter, page]);

  const fetchExecutions = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        limit: String(limit),
        page: String(page)
      });
      if (statusFilter) query.append('status', statusFilter);

      const res = await fetch(`/api/admin/automation/executions?${query.toString()}`);
      if (!res.ok) throw new Error('Failed to load executions');
      
      const data = await res.json();
      if (data.success) {
        setExecutions(data.executions || []);
        setTotalCount(data.count || 0);
      }
    } catch (err: any) {
      setError(err.message || 'Error occurred while loading executions');
    } finally {
      setLoading(false);
    }
  };

  const handleReplay = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Rerun this execution? This resets the status, bumps retry counter, and executes the nodes again using the original event payload.')) {
      return;
    }

    setReplayingId(id);
    try {
      const res = await fetch(`/api/admin/automation/executions/${id}/replay`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Replay trigger failed');
      const data = await res.json();
      if (data.success) {
        alert('Replay trigger dispatched successfully.');
        fetchExecutions();
      } else {
        alert(data.error || 'Replay failed');
      }
    } catch (err: any) {
      alert(err.message || 'Error triggering replay');
    } finally {
      setReplayingId(null);
    }
  };

  const getStatusBadge = (status: Execution['status']) => {
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

  const formatDuration = (ms: number | null) => {
    if (ms === null) return 'n/a';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <div className={styles.container}>
      
      {/* Title */}
      <div className={styles.headerRow}>
        <div className={styles.titleSection}>
          <h2>Automation Executions</h2>
          <p>Real-time telemetry trace logs of active customer flows, delays, and action executions.</p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label className={styles.label} style={{ margin: 0 }}>Filter Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className={styles.input}
            style={{ width: '150px', padding: '6px' }}
          >
            <option value="">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="running">Running</option>
            <option value="started">Started</option>
          </select>
        </div>
      </div>

      {error && (
        <div style={{ color: 'var(--error)', background: 'rgba(229,57,53,0.05)', padding: 'var(--space-3)', borderRadius: '4px', fontSize: '0.8rem' }}>
          Error: {error}
        </div>
      )}

      {/* List Card */}
      <div className={styles.card}>
        {loading && executions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-10) 0', color: 'var(--text-muted)' }}>
            LOADING TELEMETRY EVENTS...
          </div>
        ) : executions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-10) 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No executions found matching the criteria.
          </div>
        ) : (
          <>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Workflow Name</th>
                    <th>Target Profile (CDP)</th>
                    <th>Trigger Source</th>
                    <th>Started At</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.map((exec) => (
                    <tr key={exec.id}>
                      <td>
                        <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>
                          <Link href={`/admin/automation/executions/${exec.id}`}>
                            {exec.workflows?.name || 'Deleted Workflow'}
                          </Link>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          ID: <code style={{ fontFamily: 'monospace' }}>{exec.id.slice(0, 8)}</code>
                          {exec.retry_count > 0 && ` • Retries: ${exec.retry_count}`}
                        </div>
                      </td>
                      <td>
                        {exec.customer_id ? (
                          <div>
                            <Link 
                              href={`/admin/customers/${exec.customer_id}`}
                              style={{ color: 'var(--accent-gold)', textDecoration: 'underline' }}
                            >
                              {exec.customer?.name || exec.customer?.email || 'Unified Profile'}
                            </Link>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Anonymous Guest</span>
                        )}
                      </td>
                      <td>
                        <code style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{exec.trigger_source}</code>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {new Date(exec.started_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}{' '}
                          {new Date(exec.started_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {formatDuration(exec.duration_ms)}
                        </span>
                      </td>
                      <td>
                        {getStatusBadge(exec.status)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          <Link href={`/admin/automation/executions/${exec.id}`}>
                            <button className={styles.btn} style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
                              View Logs
                            </button>
                          </Link>
                          {exec.status === 'failed' && (
                            <button
                              onClick={(e) => handleReplay(e, exec.id)}
                              disabled={replayingId === exec.id}
                              className={`${styles.btn} ${styles.btnGold}`}
                              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                            >
                              {replayingId === exec.id ? 'Replaying...' : '🔄 Replay'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: 'var(--space-5)' }}>
                <button
                  onClick={() => setPage(prev => Math.max(1, prev - 1))}
                  disabled={page === 1}
                  className={styles.btn}
                >
                  ◀ Previous
                </button>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Page <strong>{page}</strong> of {totalPages}
                </span>
                <button
                  onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={page === totalPages}
                  className={styles.btn}
                >
                  Next ▶
                </button>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}
