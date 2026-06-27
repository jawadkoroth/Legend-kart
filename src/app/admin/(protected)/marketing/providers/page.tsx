'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from '../marketing-admin.module.css';

interface Provider {
  id: string;
  enabled: boolean;
  config: Record<string, any>;
  version: string;
  status: string;
  last_error: string | null;
}

const SAMPLE_PAYLOADS: Record<string, any> = {
  page_viewed: {
    eventName: 'page_viewed',
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    timestamp: new Date().toISOString(),
    sessionId: 'sess_abc123',
    anonymousId: 'anon_xyz789',
    userId: null,
    properties: {
      url: 'https://panther-store.com/products/jacket',
      path: '/products/jacket',
      title: 'PANTHER Minimalist Leather Jacket',
    },
    context: {
      page: {
        url: 'https://panther-store.com/products/jacket',
        path: '/products/jacket',
        referrer: '',
        title: 'PANTHER Minimalist Leather Jacket',
      },
      device: { type: 'desktop', browser: 'Chrome', os: 'Windows' },
      consent: { functional: true, analytics: true, marketing: true, version: '1.0.0' },
    },
  },
  product_viewed: {
    eventName: 'product_viewed',
    eventId: '550e8400-e29b-41d4-a716-446655440001',
    timestamp: new Date().toISOString(),
    sessionId: 'sess_abc123',
    anonymousId: 'anon_xyz789',
    userId: null,
    properties: {
      productId: 'prod_jacket_99',
      name: 'PANTHER Minimalist Leather Jacket',
      price: 4999,
      currency: 'INR',
    },
    context: {
      page: {
        url: 'https://panther-store.com/products/jacket',
        path: '/products/jacket',
        referrer: '',
        title: 'PANTHER Minimalist Leather Jacket',
      },
      device: { type: 'desktop' },
      consent: { functional: true, analytics: true, marketing: true, version: '1.0.0' },
    },
  },
  payment_success: {
    eventName: 'payment_success',
    eventId: '550e8400-e29b-41d4-a716-446655440002',
    timestamp: new Date().toISOString(),
    sessionId: 'sess_abc123',
    anonymousId: 'anon_xyz789',
    userId: 'usr_customer_88',
    properties: {
      orderId: 'ord_987654321',
      value: 4999,
      currency: 'INR',
      paymentId: 'pay_razorpay_999',
    },
    context: {
      page: {
        url: 'https://panther-store.com/checkout/success',
        path: '/checkout/success',
        referrer: '',
        title: 'Payment Confirmed',
      },
      device: { type: 'mobile' },
      consent: { functional: true, analytics: true, marketing: true, version: '1.0.0' },
    },
  },
};

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  
  // Sandbox states
  const [activeSandboxId, setActiveSandboxId] = useState<string | null>(null);
  const [sandboxEvent, setSandboxEvent] = useState<string>('page_viewed');
  const [sandboxPayload, setSandboxPayload] = useState<string>(
    JSON.stringify(SAMPLE_PAYLOADS.page_viewed, null, 2)
  );
  const [sandboxRunning, setSandboxRunning] = useState(false);
  const [sandboxResult, setSandboxResult] = useState<any>(null);

  const supabase = createClient();

  useEffect(() => {
    fetchProviders();
  }, []);

  async function fetchProviders() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('marketing_providers')
        .select('*')
        .order('id');
      if (!error && data) {
        setProviders(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleToggle = async (id: string, currentEnabled: boolean) => {
    try {
      const { error } = await supabase
        .from('marketing_providers')
        .update({ enabled: !currentEnabled, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        alert(error.message);
      } else {
        setProviders(
          providers.map((p) => (p.id === id ? { ...p, enabled: !currentEnabled } : p))
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleConfigChange = (id: string, key: string, value: string) => {
    setProviders(
      providers.map((p) => {
        if (p.id === id) {
          return {
            ...p,
            config: { ...p.config, [key]: value },
          };
        }
        return p;
      })
    );
  };

  const handleSaveConfig = async (provider: Provider) => {
    try {
      const { error } = await supabase
        .from('marketing_providers')
        .update({ config: provider.config, updated_at: new Date().toISOString() })
        .eq('id', provider.id);

      if (error) {
        alert(error.message);
      } else {
        alert(`Configuration for ${provider.id} updated successfully.`);
        fetchProviders();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTestConnection = async (provider: Provider) => {
    setTestingId(provider.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const res = await fetch('/api/admin/marketing/providers/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          providerId: provider.id,
          config: provider.config,
        }),
      });

      const outcome = await res.json();
      if (res.ok && outcome.success && outcome.connected) {
        alert(`Connection to ${provider.id} validated successfully.`);
      } else {
        alert(`Connection validation failed: ${outcome.error || 'Unknown error'}`);
      }
      fetchProviders();
    } catch (err: any) {
      alert(`Network error: ${err.message}`);
    } finally {
      setTestingId(null);
    }
  };

  const handleEventChange = (eName: string) => {
    setSandboxEvent(eName);
    setSandboxPayload(JSON.stringify(SAMPLE_PAYLOADS[eName] || {}, null, 2));
  };

  const handleRunSandboxTest = async (providerId: string, config: any) => {
    setSandboxRunning(true);
    setSandboxResult(null);
    try {
      let parsedPayload;
      try {
        parsedPayload = JSON.parse(sandboxPayload);
      } catch {
        alert('Invalid JSON in simulated event payload.');
        setSandboxRunning(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const res = await fetch('/api/admin/marketing/providers/sandbox', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          providerId,
          config,
          eventPayload: parsedPayload,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSandboxResult(data.data || data);
      } else {
        const errObj = await res.json();
        alert(`Sandbox run failed: ${errObj.message || 'Error'}`);
      }
    } catch (err: any) {
      alert(`Sandbox execution error: ${err.message}`);
    } finally {
      setSandboxRunning(false);
    }
  };

  if (loading) {
    return <div style={{ color: 'var(--text-secondary)' }}>Loading integrations config...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div className={styles.grid}>
        {providers.map((prov) => {
          const configKeys = Object.keys(prov.config || {});
          const isSandboxOpen = activeSandboxId === prov.id;

          return (
            <div key={prov.id} className={styles.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <div>
                  <h3 style={{ textTransform: 'uppercase', fontWeight: 'bold', fontSize: '1rem', color: 'var(--text-primary)' }}>
                    {prov.id === 'meta' ? 'Meta Conversions & Pixel' : prov.id === 'google' ? 'Google GA4 & Tag Manager' : 'Developer Console Logger'}
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Adapter Module v{prov.version}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className={`${styles.indicator} ${prov.status === 'connected' ? styles.indicatorSuccess : prov.status === 'error' ? styles.indicatorError : styles.indicatorWarning}`} />
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={prov.enabled}
                      onChange={() => handleToggle(prov.id, prov.enabled)}
                    />
                    <span className={styles.slider} />
                  </label>
                </div>
              </div>

              {/* Configurations Fields */}
              {configKeys.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                  {configKeys.map((key) => (
                    <div key={key} className={styles.formGroup} style={{ marginBottom: 0 }}>
                      <label className={styles.label} style={{ fontSize: '0.75rem' }}>{key}</label>
                      <input
                        type="text"
                        className={styles.input}
                        style={{ padding: '6px 10px', fontSize: '0.8125rem' }}
                        value={prov.config[key] || ''}
                        onChange={(e) => handleConfigChange(prov.id, key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>
                  This provider functions out of the box and requires no credentials.
                </p>
              )}

              {prov.last_error && (
                <div style={{ background: 'rgba(229, 57, 53, 0.05)', color: 'var(--error)', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', marginBottom: 'var(--space-4)', fontFamily: 'monospace' }}>
                  Connection Error: {prov.last_error}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <button
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                  onClick={() => handleSaveConfig(prov)}
                  disabled={configKeys.length === 0}
                >
                  Save Credentials
                </button>
                <button
                  className={styles.btn}
                  style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                  onClick={() => handleTestConnection(prov)}
                  disabled={testingId !== null || configKeys.length === 0}
                >
                  {testingId === prov.id ? 'Verifying...' : '⚡ Test Link'}
                </button>
                <button
                  className={styles.btn}
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.75rem',
                    background: isSandboxOpen ? 'var(--bg-secondary)' : 'transparent',
                    border: '1px solid var(--border-color)',
                  }}
                  onClick={() => {
                    setActiveSandboxId(isSandboxOpen ? null : prov.id);
                    setSandboxResult(null);
                  }}
                >
                  🧪 Sandbox Testing
                </button>
              </div>

              {/* Sandbox Drawer Panel */}
              {isSandboxOpen && (
                <div
                  style={{
                    marginTop: 'var(--space-4)',
                    paddingTop: 'var(--space-4)',
                    borderTop: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-3)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ fontSize: '0.8125rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                      🔬 Platform Sandbox Simulator
                    </h4>
                    <select
                      className={styles.input}
                      style={{ width: 'auto', padding: '2px 8px', fontSize: '0.75rem' }}
                      value={sandboxEvent}
                      onChange={(e) => handleEventChange(e.target.value)}
                    >
                      <option value="page_viewed">Page View</option>
                      <option value="product_viewed">Product View</option>
                      <option value="payment_success">Payment Success</option>
                    </select>
                  </div>

                  <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                    <label className={styles.label} style={{ fontSize: '0.7rem' }}>Event Payload JSON</label>
                    <textarea
                      className={styles.input}
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        height: '140px',
                        resize: 'vertical',
                        background: 'rgba(0,0,0,0.1)',
                      }}
                      value={sandboxPayload}
                      onChange={(e) => setSandboxPayload(e.target.value)}
                    />
                  </div>

                  <button
                    className={`${styles.btn} ${styles.btnPrimary}`}
                    style={{ padding: '6px 12px', fontSize: '0.75rem', alignSelf: 'flex-start' }}
                    onClick={() => handleRunSandboxTest(prov.id, prov.config)}
                    disabled={sandboxRunning}
                  >
                    {sandboxRunning ? 'Running sandbox test...' : '🚀 Send Sandbox Test Event'}
                  </button>

                  {/* Sandbox Run Outcome */}
                  {sandboxResult && (
                    <div
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)',
                        padding: 'var(--space-3)',
                        fontSize: '0.75rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-2)',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <span>Event Validation: <strong style={{ color: sandboxResult.eventValid ? 'var(--success)' : 'var(--error)' }}>{sandboxResult.eventValid ? 'Passed' : 'Failed'}</strong></span>
                        <span>Config Validation: <strong style={{ color: sandboxResult.configValid ? 'var(--success)' : 'var(--error)' }}>{sandboxResult.configValid ? 'Passed' : 'Failed'}</strong></span>
                      </div>

                      {sandboxResult.eventErrors?.length > 0 && (
                        <div style={{ color: 'var(--error)' }}>
                          <strong>Errors:</strong> {sandboxResult.eventErrors.join(', ')}
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: 'var(--space-2)' }}>
                        <div>
                          <div style={{ color: 'var(--text-muted)', marginBottom: '2px', fontWeight: '500' }}>Mapped Payload (Sent to Pixel)</div>
                          <pre style={{ margin: 0, padding: '6px', background: 'rgba(0,0,0,0.2)', overflowX: 'auto', maxHeight: '120px', borderRadius: '4px', fontSize: '0.7rem' }}>
                            {JSON.stringify(sandboxResult.mappedPayload, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-muted)', marginBottom: '2px', fontWeight: '500' }}>Simulated Provider Response</div>
                          <pre style={{ margin: 0, padding: '6px', background: 'rgba(0,0,0,0.2)', overflowX: 'auto', maxHeight: '120px', borderRadius: '4px', fontSize: '0.7rem' }}>
                            {JSON.stringify(sandboxResult.mockResponse, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
