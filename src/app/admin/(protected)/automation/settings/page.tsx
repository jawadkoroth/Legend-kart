'use client';

import React, { useState } from 'react';
import styles from '../automation.module.css';

export default function SettingsPage() {
  const [engineEnabled, setEngineEnabled] = useState(true);
  const [maxRetries, setMaxRetries] = useState(5);
  const [concurrency, setConcurrency] = useState(10);
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      alert('Global engine settings saved.');
    }, 500);
  };

  return (
    <div className={styles.container}>
      
      {/* Title */}
      <div className={styles.headerRow}>
        <div className={styles.titleSection}>
          <h2>Automation Engine Settings</h2>
          <p>Configure global execution parameters, job lease times, and webhook retries.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', alignItems: 'start' }}>
        
        {/* Left Side: General Form */}
        <div className={styles.card} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', margin: 0 }}>
            Global Runner Configurations
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
            <div>
              <strong style={{ fontSize: '0.85rem', display: 'block', color: 'var(--text-primary)' }}>Enable Workflow Engine Runtime</strong>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>If disabled, active flows will be ignored during incoming events.</span>
            </div>
            <button
              onClick={() => setEngineEnabled(!engineEnabled)}
              className={`${styles.btn} ${engineEnabled ? styles.btnGold : ''}`}
              style={{ minWidth: '100px' }}
            >
              {engineEnabled ? 'Active' : 'Disabled'}
            </button>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Maximum Job Retry Limits</label>
            <input
              type="number"
              min="1"
              max="10"
              value={maxRetries}
              onChange={(e) => setMaxRetries(Number(e.target.value))}
              className={styles.input}
            />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Maximum backoff iterations attempted before promoting a failed action node to the dead queue.
            </span>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Cron Job Concurrency Limit</label>
            <input
              type="number"
              min="1"
              max="50"
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
              className={styles.input}
            />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Maximum concurrent claim limits during each background cron execution interval.
            </span>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className={`${styles.btn} ${styles.btnPrimary}`}
            style={{ alignSelf: 'flex-start' }}
          >
            {saving ? 'Saving...' : '💾 Save Configurations'}
          </button>
        </div>

        {/* Right Side: Diagnostics Status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div className={styles.card} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', margin: 0 }}>
              Runner Diagnostics
            </h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Engine Status:</span>
                <span style={{ color: 'var(--success)' }}>ONLINE / HEALTHY</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>DB Schema Version:</span>
                <code style={{ fontSize: '0.75rem' }}>040_workflow_engine</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Background Cron Status:</span>
                <span style={{ color: 'var(--success)' }}>ACTIVE</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Job Queue Size:</span>
                <strong>0 pending</strong>
              </div>
            </div>
            
            <div style={{ border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.15)', padding: '10px', borderRadius: '6px', fontSize: '0.75rem' }}>
              <span style={{ fontWeight: 'bold', display: 'block', color: 'var(--accent-gold)', marginBottom: '4px' }}>Cron Endpoint Target</span>
              <code style={{ display: 'block', wordBreak: 'break-all', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                /api/jobs/run?secret=CRON_SECRET
              </code>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
