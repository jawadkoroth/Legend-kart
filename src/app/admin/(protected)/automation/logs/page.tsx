'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from '../automation.module.css';

interface LogLine {
  executionId: string;
  workflowName: string;
  timestamp: string;
  nodeName: string;
  nodeType: string;
  status: 'info' | 'success' | 'failed' | 'paused';
  message: string;
}

export default function LogsPage() {
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('');

  useEffect(() => {
    fetchLogs();
  }, [levelFilter]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/automation/executions?limit=50');
      if (!res.ok) throw new Error('Failed to load executions');
      const data = await res.json();
      if (data.success) {
        const list = data.executions || [];
        const flattened: LogLine[] = [];
        
        list.forEach((exec: any) => {
          const logs = exec.logs || [];
          logs.forEach((log: any) => {
            flattened.push({
              executionId: exec.id,
              workflowName: exec.workflows?.name || 'Deleted Flow',
              timestamp: log.timestamp,
              nodeName: log.nodeName,
              nodeType: log.nodeType,
              status: log.status,
              message: log.message
            });
          });
        });

        flattened.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setLogLines(flattened);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading logs database');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: LogLine['status']) => {
    switch (status) {
      case 'success':
        return <span className={`${styles.badge} ${styles.badgeSuccess}`} style={{ fontSize: '9px', padding: '2px 6px' }}>Success</span>;
      case 'failed':
        return <span className={`${styles.badge} ${styles.badgeFailed}`} style={{ fontSize: '9px', padding: '2px 6px' }}>Failed</span>;
      case 'paused':
        return <span className={`${styles.badge} ${styles.badgePaused}`} style={{ fontSize: '9px', padding: '2px 6px' }}>Paused</span>;
      case 'info':
        return <span className={`${styles.badge} ${styles.badgeInfo}`} style={{ fontSize: '9px', padding: '2px 6px' }}>Info</span>;
      default:
        return <span className={styles.badge} style={{ fontSize: '9px', padding: '2px 6px' }}>{status}</span>;
    }
  };

  const filteredLines = logLines.filter(line => {
    const matchesSearch = 
      line.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      line.nodeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      line.workflowName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      line.executionId.toLowerCase().includes(searchQuery.toLowerCase());
      
    const matchesLevel = levelFilter ? line.status === levelFilter : true;
    
    return matchesSearch && matchesLevel;
  });

  return (
    <div className={styles.container}>
      
      {/* Title */}
      <div className={styles.headerRow}>
        <div className={styles.titleSection}>
          <h2>Automation Logs</h2>
          <p>Search and inspect node-level evaluation logs recorded by the flow engine.</p>
        </div>
      </div>

      {/* Filter panel */}
      <div className={styles.card} style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap', padding: '15px' }}>
        <div className={styles.formGroup} style={{ flexGrow: 1, minWidth: '250px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs by message, node name, flow, or execution ID..."
            className={styles.input}
          />
        </div>
        
        <div className={styles.formGroup} style={{ width: '180px' }}>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className={styles.input}
          >
            <option value="">All Log Levels</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="paused">Paused / Delayed</option>
            <option value="info">Info</option>
          </select>
        </div>
        
        <button onClick={fetchLogs} className={styles.btn}>
          🔄 Refresh
        </button>
      </div>

      {/* Logs Table */}
      <div className={styles.card}>
        {loading && filteredLines.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
            PARSING LOG ENTRIES...
          </div>
        ) : filteredLines.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No matching log entries found in database.
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table} style={{ fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Flow</th>
                  <th>Node Details</th>
                  <th>Level</th>
                  <th>Message</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLines.map((line, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.01)' }}>
                    <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                      {new Date(line.timestamp).toLocaleTimeString('en-IN', { hour12: false })}
                    </td>
                    <td>
                      <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{line.workflowName}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: '500' }}>{line.nodeName}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{line.nodeType.toUpperCase()}</div>
                    </td>
                    <td>{getStatusBadge(line.status)}</td>
                    <td style={{ wordBreak: 'break-all', color: 'var(--text-secondary)' }}>
                      {line.message}
                    </td>
                    <td>
                      <Link 
                        href={`/admin/automation/executions/${line.executionId}`}
                        style={{ color: 'var(--accent-gold)', fontSize: '0.75rem', textDecoration: 'underline' }}
                      >
                        Trace
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
