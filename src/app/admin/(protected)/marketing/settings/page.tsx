'use client';

import React, { useState, useEffect } from 'react';
import styles from '../marketing-admin.module.css';

export default function MarketingSettingsPage() {
  const [consentVersion, setConsentVersion] = useState('1.0.0');
  const [metaPixelId, setMetaPixelId] = useState('pixel_xxxxxx');
  const [ga4Id, setGa4Id] = useState('G-XXXXXX');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setConsentVersion(localStorage.getItem('set_consent_version') || '1.0.0');
      setMetaPixelId(localStorage.getItem('set_meta_pixel_id') || 'pixel_xxxxxx');
      setGa4Id(localStorage.getItem('set_ga4_id') || 'G-XXXXXX');
    }
  }, []);

  const handleSaveMarketingSettings = () => {
    localStorage.setItem('set_consent_version', consentVersion);
    localStorage.setItem('set_meta_pixel_id', metaPixelId);
    localStorage.setItem('set_ga4_id', ga4Id);
    alert('Marketing consent and tracking parameters updated.');
  };

  return (
    <div style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      
      {/* Policy Consent Version */}
      <div className={styles.card}>
        <h3 style={{ textTransform: 'uppercase', fontSize: '0.8rem', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 'var(--space-4)' }}>
          ⚖️ Customer Privacy & Consent Policies
        </h3>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
          Specify the active version of your privacy agreement. When updated, users will be reprompted to accept tracking cookies.
        </p>
        <div className={styles.formGroup} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Active Policy Version</label>
          <input
            type="text"
            className={styles.input}
            style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px' }}
            value={consentVersion}
            onChange={(e) => setConsentVersion(e.target.value)}
          />
        </div>
      </div>

      {/* Target Pixel Tracking Destinations */}
      <div className={styles.card}>
        <h3 style={{ textTransform: 'uppercase', fontSize: '0.8rem', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 'var(--space-4)' }}>
          🔌 Tracking Pixel Destinations
        </h3>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
          First-party user interactions are captured dynamically and pushed to Google Analytics and Meta server-side Conversions API (CAPI).
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className={styles.formGroup} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Meta Pixel ID</label>
            <input
              type="text"
              className={styles.input}
              style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px' }}
              value={metaPixelId}
              onChange={(e) => setMetaPixelId(e.target.value)}
            />
          </div>
          <div className={styles.formGroup} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Google Analytics 4 Measurement ID</label>
            <input
              type="text"
              className={styles.input}
              style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px' }}
              value={ga4Id}
              onChange={(e) => setGa4Id(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          style={{
            padding: '10px 20px',
            background: 'var(--accent-gold)',
            color: '#000',
            border: 'none',
            borderRadius: '4px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
          onClick={handleSaveMarketingSettings}
        >
          Save Marketing Parameters
        </button>
      </div>

    </div>
  );
}
