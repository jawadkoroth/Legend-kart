'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from '../marketing-admin.module.css';

interface Audience {
  id: string;
  name: string;
  description: string | null;
  rules: any;
  created_at: string;
}

export default function AudienceBuilder({ initialAudiences }: { initialAudiences: Audience[] }) {
  const [audiences, setAudiences] = useState<Audience[]>(initialAudiences);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('abandoned_cart');
  const [customRuleKey, setCustomRuleKey] = useState('utm_source');
  const [customRuleVal, setCustomRuleVal] = useState('instagram');
  const [submitting, setSubmitting] = useState(false);

  const supabase = createClient();

  const handleCreateAudience = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      let rulesPayload = {};

      if (selectedTemplate === 'abandoned_cart') {
        rulesPayload = { days: 14, events: ['product_added_to_cart'], exclude: ['checkout_started'] };
      } else if (selectedTemplate === 'browse_abandon') {
        rulesPayload = { days: 30, events: ['product_viewed'], exclude: ['payment_success'] };
      } else if (selectedTemplate === 'vip_spend') {
        rulesPayload = { spent_min: 1000000 }; // 10,000 INR in paise
      } else {
        // custom UTM parameters
        rulesPayload = { [customRuleKey]: customRuleVal };
      }

      const { data, error } = await supabase
        .from('marketing_audiences')
        .insert({
          name: name.trim(),
          description: desc.trim() || null,
          rules: rulesPayload,
        })
        .select()
        .single();

      if (error) {
        alert(error.message);
      } else if (data) {
        setAudiences([data, ...audiences]);
        setName('');
        setDesc('');
        setShowCreate(false);
        alert('Audience group created and initialized successfully.');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAudience = async (id: string) => {
    if (!confirm('Are you sure you want to remove this audience segment?')) return;

    try {
      const { error } = await supabase
        .from('marketing_audiences')
        .delete()
        .eq('id', id);

      if (error) {
        alert(error.message);
      } else {
        setAudiences(audiences.filter(a => a.id !== id));
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 'var(--space-5)', alignItems: 'start' }}>
      
      {/* Cohorts lists */}
      <div className={styles.card} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <h3 style={{ textTransform: 'uppercase', fontSize: '0.85rem', color: 'var(--text-muted)', letterSpacing: '0.05em', margin: 0 }}>
          👥 Active Target Cohorts ({audiences.length})
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {audiences.map((aud) => (
            <div
              key={aud.id}
              style={{
                background: 'rgba(255, 255, 255, 0.01)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{aud.name}</strong>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '4px 0 8px 0' }}>{aud.description || 'No description provided'}</p>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Rules engine definition:</span>
                  <code style={{ fontSize: '0.7rem', color: 'var(--accent-gold)', background: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: '3px', fontFamily: 'monospace' }}>
                    {JSON.stringify(aud.rules)}
                  </code>
                </div>
              </div>
              
              <button
                className={styles.btn}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  borderColor: 'var(--error)',
                  color: 'var(--error)',
                }}
                onClick={() => handleDeleteAudience(aud.id)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Control Actions / Create panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {!showCreate ? (
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            style={{ width: '100%' }}
            onClick={() => setShowCreate(true)}
          >
            ➕ Build New Audience Segment
          </button>
        ) : (
          <form className={styles.card} onSubmit={handleCreateAudience} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <h3 style={{ textTransform: 'uppercase', fontSize: '0.8rem', color: 'var(--text-primary)', margin: 0 }}>
              Build New Cohort
            </h3>
            
            <div className={styles.formGroup} style={{ marginBottom: 0 }}>
              <label className={styles.label}>Audience Name</label>
              <input
                type="text"
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Added to Cart (No Checkout)"
                required
              />
            </div>

            <div className={styles.formGroup} style={{ marginBottom: 0 }}>
              <label className={styles.label}>Description</label>
              <textarea
                className={styles.input}
                style={{ height: '60px' }}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Targeting notes..."
              />
            </div>

            <div className={styles.formGroup} style={{ marginBottom: 0 }}>
              <label className={styles.label}>Cohort Rules Ruleset Template</label>
              <select
                className={styles.input}
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
              >
                <option value="abandoned_cart">🛒 Cart Abandoners (Added but no Checkout)</option>
                <option value="browse_abandon">👁️ Product Browse Abandoners (Viewed but no Purchase)</option>
                <option value="vip_spend">💎 VIP Customers (Spends &gt; 10,000 INR)</option>
                <option value="custom_utm">🎯 UTM Attribution Channels Filtering</option>
              </select>
            </div>

            {selectedTemplate === 'custom_utm' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', border: '1px solid var(--border-color)', padding: '8px', borderRadius: '4px', background: 'rgba(0,0,0,0.1)' }}>
                <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                  <label className={styles.label} style={{ fontSize: '10px' }}>UTM Tag Key</label>
                  <select className={styles.input} style={{ fontSize: '11px', padding: '4px' }} value={customRuleKey} onChange={(e) => setCustomRuleKey(e.target.value)}>
                    <option value="utm_source">utm_source</option>
                    <option value="utm_medium">utm_medium</option>
                    <option value="utm_campaign">utm_campaign</option>
                  </select>
                </div>
                <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                  <label className={styles.label} style={{ fontSize: '10px' }}>Target Value</label>
                  <input
                    type="text"
                    className={styles.input}
                    style={{ fontSize: '11px', padding: '4px' }}
                    value={customRuleVal}
                    onChange={(e) => setCustomRuleVal(e.target.value)}
                    placeholder="e.g. instagram"
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className={styles.btn}
                style={{ flex: 1 }}
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`${styles.btn} ${styles.btnPrimary}`}
                style={{ flex: 1 }}
                disabled={submitting}
              >
                {submitting ? 'Creating...' : '💾 Create'}
              </button>
            </div>
          </form>
        )}
      </div>

    </div>
  );
}
