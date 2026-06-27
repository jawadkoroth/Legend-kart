'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './automation.module.css';

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  is_active: boolean;
  created_at: string;
}

export default function WorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  // Telemetry state
  const [totalCount, setTotalCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [execCount, setExecCount] = useState(0);
  const [successRate, setSuccessRate] = useState(100);

  useEffect(() => {
    fetchWorkflows();
    fetchTelemetry();
  }, []);

  const fetchWorkflows = async () => {
    try {
      const res = await fetch('/api/admin/automation/workflows');
      if (!res.ok) {
        throw new Error('Failed to fetch workflows');
      }
      const data = await res.json();
      if (data.success) {
        setWorkflows(data.workflows || []);
        setTotalCount(data.workflows?.length || 0);
        setActiveCount(data.workflows?.filter((w: Workflow) => w.is_active).length || 0);
      } else {
        setError(data.error || 'Failed to load workflows');
      }
    } catch (err: any) {
      setError(err.message || 'Error occurred while loading data');
    } finally {
      setLoading(false);
    }
  };

  const fetchTelemetry = async () => {
    try {
      const res = await fetch('/api/admin/automation/executions?limit=50');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setExecCount(data.count || 0);
          
          const list = data.executions || [];
          if (list.length > 0) {
            const completed = list.filter((e: any) => e.status === 'completed').length;
            const failed = list.filter((e: any) => e.status === 'failed').length;
            const rate = Math.round((completed / (completed + failed || 1)) * 100);
            setSuccessRate(rate);
          }
        }
      }
    } catch (err) {
      console.error('Telemetry fetch error:', err);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/admin/automation/workflows/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentStatus })
      });
      if (res.ok) {
        setWorkflows(workflows.map(w => w.id === id ? { ...w, is_active: !currentStatus } : w));
        setActiveCount(prev => currentStatus ? prev - 1 : prev + 1);
      } else {
        alert('Failed to update active state');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteWorkflow = async (id: string) => {
    if (!confirm('Are you sure you want to delete this workflow? All executions and history will be permanently deleted.')) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/automation/workflows/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setWorkflows(workflows.filter(w => w.id !== id));
        setTotalCount(prev => prev - 1);
        setActiveCount(prev => workflows.find(w => w.id === id)?.is_active ? prev - 1 : prev);
      } else {
        alert('Failed to delete workflow');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateWorkflow = async () => {
    setCreating(true);
    try {
      const defaultFlow = {
        name: 'New Custom Flow',
        description: 'Automated workflow triggers on events.',
        trigger_type: 'product_viewed',
        definition: {
          trigger: {
            type: 'product_viewed',
            nextNodeId: null
          },
          nodes: {}
        },
        is_active: false
      };

      const res = await fetch('/api/admin/automation/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(defaultFlow)
      });

      if (!res.ok) {
        throw new Error('Failed to create workflow');
      }

      const data = await res.json();
      if (data.success && data.workflow) {
        router.push(`/admin/automation/${data.workflow.id}`);
      } else {
        alert(data.error || 'Failed to create workflow');
      }
    } catch (err: any) {
      alert(err.message || 'Error occurred while creating workflow');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '300px', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        LOADING AUTOMATION MODULE...
      </div>
    );
  }

  return (
    <div className={styles.container}>
      
      {/* Header Title Section */}
      <div className={styles.headerRow}>
        <div className={styles.titleSection}>
          <h2>Panther Flow Engine</h2>
          <p>Orchestrate marketing rules, CRM segmentation, background operations and notifications.</p>
        </div>
        
        <button 
          onClick={handleCreateWorkflow} 
          className={`${styles.btn} ${styles.btnPrimary}`}
          disabled={creating}
        >
          {creating ? 'Creating...' : '➕ Create New Workflow'}
        </button>
      </div>

      {/* Telemetry Stats Panel */}
      <div className={styles.metricGrid}>
        <div className={styles.metricCard}>
          <span className={styles.metricTitle}>Active Automation Rules</span>
          <h3 className={styles.metricValue}>{activeCount} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/ {totalCount}</span></h3>
          <span className={styles.metricFootnote}>Live event listeners running</span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricTitle}>Total Triggered Executions</span>
          <h3 className={styles.metricValue}>{execCount}</h3>
          <span className={styles.metricFootnote}>Flow logs tracked in CDP</span>
        </div>
        <div className={styles.metricCard}>
          <span className={styles.metricTitle}>Engine Success Rate</span>
          <h3 className={styles.metricValue} style={{ color: successRate >= 90 ? 'var(--success)' : 'var(--warning)' }}>{successRate}%</h3>
          <span className={styles.metricFootnote}>Traversals completed without failures</span>
        </div>
      </div>

      {/* Workflows Table */}
      <div className={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', margin: 0 }}>
            ⛓️ Configured Automation Flows
          </h3>
        </div>

        {error && (
          <div style={{ color: 'var(--error)', background: 'rgba(229,57,53,0.05)', padding: 'var(--space-3)', borderRadius: '4px', fontSize: '0.8rem' }}>
            Error: {error}
          </div>
        )}

        {workflows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-10) var(--space-4)', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)', margin: 'var(--space-4) 0' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-4)' }}>⚡</div>
            <h4 style={{ color: 'var(--text-primary)', margin: '0 0 var(--space-2) 0', fontSize: '1rem' }}>No Automation Workflows Configured</h4>
            <p style={{ maxWidth: '480px', margin: '0 auto var(--space-6) auto', fontSize: '0.8125rem', lineHeight: '1.4' }}>
              Panther Flow orchestrates marketing rules, customer segmentations, dynamic coupon generation, and team notifications. Get started by creating a custom workflow or select a prebuilt template.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button onClick={handleCreateWorkflow} className={`${styles.btn} ${styles.btnPrimary}`} style={{ fontSize: '0.75rem', padding: '6px 16px' }}>
                ➕ Create Flow
              </button>
              <Link href="/admin/automation/templates">
                <button className={styles.btn} style={{ fontSize: '0.75rem', padding: '6px 16px' }}>
                  📋 Browse Templates
                </button>
              </Link>
            </div>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Workflow Name</th>
                  <th>Trigger Event</th>
                  <th>Created Date</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {workflows.map((flow) => (
                  <tr key={flow.id}>
                    <td>
                      <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>
                        <Link href={`/admin/automation/${flow.id}`} style={{ textDecoration: 'none' }}>
                          {flow.name}
                        </Link>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {flow.description || 'No description provided'}
                      </div>
                    </td>
                    <td>
                      <code style={{ fontSize: '0.75rem', color: 'var(--accent-gold)', background: 'rgba(0,0,0,0.15)', padding: '2px 6px', borderRadius: '3px', fontFamily: 'monospace' }}>
                        {flow.trigger_type}
                      </code>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {new Date(flow.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => handleToggleActive(flow.id, flow.is_active)}
                        className={`${styles.btn}`}
                        style={{
                          padding: '4px 10px',
                          fontSize: '0.7rem',
                          borderColor: flow.is_active ? 'var(--success)' : 'var(--border-color)',
                          color: flow.is_active ? 'var(--success)' : 'var(--text-muted)',
                          background: flow.is_active ? 'rgba(76, 175, 80, 0.05)' : 'transparent'
                        }}
                      >
                        {flow.is_active ? '● Active' : '○ Draft'}
                      </button>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '8px' }}>
                        <Link href={`/admin/automation/${flow.id}`}>
                          <button className={styles.btn} style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
                            Edit Flow
                          </button>
                        </Link>
                        <button
                          onClick={() => handleDeleteWorkflow(flow.id)}
                          className={`${styles.btn} ${styles.btnDanger}`}
                          style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                        >
                          Delete
                        </button>
                      </div>
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
