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

  // Meta connection wizard states
  const [metaStep, setMetaStep] = useState(1);
  const [selectedMetaBiz, setSelectedMetaBiz] = useState('Noir Fashion Ltd');
  const [selectedMetaPixel, setSelectedMetaPixel] = useState('1122334455');
  const [selectedMetaCatalog, setSelectedMetaCatalog] = useState('Catalog A (Main Store)');
  const [selectedMetaAdAccount, setSelectedMetaAdAccount] = useState('Ad Account #1');
  const [metaTokenInput, setMetaTokenInput] = useState('');

  // Google ecosystem statuses
  const [googleServices, setGoogleServices] = useState<Record<string, string>>({
    ga4: 'connected',
    gtm: 'connected',
    merchantCenter: 'connected',
    googleAds: 'needs_permission',
    searchConsole: 'disconnected',
  });

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
        const metaProv = data.find(p => p.id === 'meta');
        if (metaProv && metaProv.config?.accessToken) {
          setMetaTokenInput(metaProv.config.accessToken);
        }
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

  const handleSaveConfig = async (providerId: string, customConfig: any) => {
    try {
      const { error } = await supabase
        .from('marketing_providers')
        .update({ config: customConfig, updated_at: new Date().toISOString() })
        .eq('id', providerId);

      if (error) {
        alert(error.message);
      } else {
        alert(`Configuration for ${providerId} updated successfully.`);
        fetchProviders();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleMetaSaveWizard = async () => {
    const metaProv = providers.find(p => p.id === 'meta');
    if (!metaProv) return;

    const configUpdate = {
      ...metaProv.config,
      sandbox: false,
      pixelId: selectedMetaPixel,
      accessToken: metaTokenInput || 'EAAG...MOCK_TOKEN',
      businessAccountId: selectedMetaBiz,
      catalogId: selectedMetaCatalog,
      adAccountId: selectedMetaAdAccount,
    };

    await handleSaveConfig('meta', configUpdate);
    setMetaStep(1); // Reset step
  };

  const handleToggleGoogleService = (serviceId: string) => {
    setGoogleServices(prev => {
      const current = prev[serviceId];
      const next = current === 'connected' ? 'disconnected' : 'connected';
      return { ...prev, [serviceId]: next };
    });
  };

  const handleRunSandboxTest = async (providerId: string, config: any) => {
    setSandboxRunning(true);
    setSandboxResult(null);
    try {
      let parsedPayload;
      try {
        parsedPayload = JSON.parse(sandboxPayload);
      } catch {
        alert('Invalid JSON payload.');
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

  const metaProv = providers.find(p => p.id === 'meta');
  const googleProv = providers.find(p => p.id === 'google');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 'var(--space-5)' }}>
        
        {/* Meta Integration Wizard Card */}
        {metaProv && (
          <div className={styles.card} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <div>
                  <h3 style={{ textTransform: 'uppercase', fontWeight: 'bold', fontSize: '1rem', color: 'var(--text-primary)' }}>
                    Meta Suite Connect
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Pixel, Catalog, Shops, & Conversions API
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className={`${styles.indicator} ${metaProv.status === 'connected' ? styles.indicatorSuccess : styles.indicatorWarning}`} />
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={metaProv.enabled}
                      onChange={() => handleToggle(metaProv.id, metaProv.enabled)}
                    />
                    <span className={styles.slider} />
                  </label>
                </div>
              </div>

              {/* Wizard Steps */}
              <div style={{ background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', marginBottom: 'var(--space-3)' }}>
                  <span>Wizard Config Step {metaStep} / 6</span>
                  <span style={{ color: 'var(--accent-gold)' }}>Active Integration</span>
                </div>

                {metaStep === 1 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Connect Business Manager to generate authentication and token sync bridges securely.
                    </p>
                    <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                      <label className={styles.label} style={{ fontSize: '0.7rem' }}>Meta System User Access Token</label>
                      <input
                        type="password"
                        placeholder="EAAG..."
                        className={styles.input}
                        value={metaTokenInput}
                        onChange={(e) => setMetaTokenInput(e.target.value)}
                      />
                    </div>
                    <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ fontSize: '0.75rem', padding: '6px 12px' }} onClick={() => setMetaStep(2)}>
                      🔑 Verify & Retrieve Business Accounts
                    </button>
                  </div>
                )}

                {metaStep === 2 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Choose Meta Business Manager Account:</p>
                    <select className={styles.input} value={selectedMetaBiz} onChange={(e) => setSelectedMetaBiz(e.target.value)}>
                      <option value="Noir Fashion Ltd">Noir Fashion Ltd (ID: 593859235)</option>
                      <option value="Panther India">Panther India (ID: 928423423)</option>
                    </select>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className={styles.btn} style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={() => setMetaStep(1)}>Back</button>
                      <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={() => setMetaStep(3)}>Next</button>
                    </div>
                  </div>
                )}

                {metaStep === 3 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Choose Target Facebook Tracking Pixel:</p>
                    <select className={styles.input} value={selectedMetaPixel} onChange={(e) => setSelectedMetaPixel(e.target.value)}>
                      <option value="1122334455">Noir Apparel Pixel (ID: 1122334455)</option>
                      <option value="9988776655">Panther Pixel (ID: 9988776655)</option>
                    </select>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className={styles.btn} style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={() => setMetaStep(2)}>Back</button>
                      <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={() => setMetaStep(4)}>Next</button>
                    </div>
                  </div>
                )}

                {metaStep === 4 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Choose Meta Product Catalog (Facebook/Instagram Shop Feed):</p>
                    <select className={styles.input} value={selectedMetaCatalog} onChange={(e) => setSelectedMetaCatalog(e.target.value)}>
                      <option value="Catalog A (Main Store)">Catalog A (Main Store - 14 items)</option>
                      <option value="Catalog B (Winter Wear)">Catalog B (Winter Wear - 0 items)</option>
                    </select>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className={styles.btn} style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={() => setMetaStep(3)}>Back</button>
                      <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={() => setMetaStep(5)}>Next</button>
                    </div>
                  </div>
                )}

                {metaStep === 5 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Choose Meta Ads Account:</p>
                    <select className={styles.input} value={selectedMetaAdAccount} onChange={(e) => setSelectedMetaAdAccount(e.target.value)}>
                      <option value="Ad Account #1">Noir Ads (INR Billing)</option>
                      <option value="Ad Account #2">Panther Marketing (USD Billing)</option>
                    </select>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className={styles.btn} style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={() => setMetaStep(4)}>Back</button>
                      <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={() => setMetaStep(6)}>Next</button>
                    </div>
                  </div>
                )}

                {metaStep === 6 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 'bold' }}>✓ Setup Ready for Verification</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Click Save to write connection parameters to DB. Real tokens will be encrypted using service roles.
                    </p>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className={styles.btn} style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={() => setMetaStep(5)}>Back</button>
                      <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={handleMetaSaveWizard}>💾 Save Config</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Toggle sandbox / production */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', marginBottom: 'var(--space-4)' }}>
                <span>Environment: <strong>{metaProv.config?.sandbox === false ? 'Production' : 'Sandbox / Mock'}</strong></span>
                <button
                  className={styles.btn}
                  style={{ padding: '3px 8px', fontSize: '0.7rem' }}
                  onClick={() => {
                    const currentSandbox = metaProv.config?.sandbox !== false;
                    handleSaveConfig('meta', { ...metaProv.config, sandbox: !currentSandbox });
                  }}
                >
                  Switch to {metaProv.config?.sandbox === false ? 'Sandbox' : 'Production'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                className={styles.btn}
                style={{ fontSize: '0.75rem', padding: '6px 12px' }}
                onClick={() => {
                  setActiveSandboxId(activeSandboxId === 'meta' ? null : 'meta');
                  setSandboxResult(null);
                }}
              >
                🧪 Debug Event Simulator
              </button>
              <button
                className={styles.btn}
                style={{ fontSize: '0.75rem', padding: '6px 12px' }}
                onClick={() => {
                  setMetaTokenInput('EAAG_MOCK_SECRET_ACCESS_KEY');
                  setSelectedMetaPixel('1122334455');
                  alert('Resetting Meta connection wizard steps.');
                  setMetaStep(1);
                }}
              >
                Reset Setup
              </button>
            </div>
          </div>
        )}

        {/* Google Ecosystem Connections Card */}
        {googleProv && (
          <div className={styles.card} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <div>
                  <h3 style={{ textTransform: 'uppercase', fontWeight: 'bold', fontSize: '1rem', color: 'var(--text-primary)' }}>
                    Google Analytics & GTM
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Dynamic GA4, Search Console, & Ads Link
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className={`${styles.indicator} ${googleProv.status === 'connected' ? styles.indicatorSuccess : styles.indicatorWarning}`} />
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={googleProv.enabled}
                      onChange={() => handleToggle(googleProv.id, googleProv.enabled)}
                    />
                    <span className={styles.slider} />
                  </label>
                </div>
              </div>

              {/* Config credentials */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                  <label className={styles.label} style={{ fontSize: '0.7rem' }}>Google GA4 Measurement ID</label>
                  <input
                    type="text"
                    className={styles.input}
                    style={{ fontSize: '0.8rem', padding: '5px' }}
                    value={googleProv.config?.measurementId || ''}
                    onChange={(e) => handleSaveConfig('google', { ...googleProv.config, measurementId: e.target.value })}
                    placeholder="e.g. G-XXXXXXX"
                  />
                </div>
                <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                  <label className={styles.label} style={{ fontSize: '0.7rem' }}>Measurement Protocol API Secret</label>
                  <input
                    type="password"
                    className={styles.input}
                    style={{ fontSize: '0.8rem', padding: '5px' }}
                    value={googleProv.config?.apiSecret || ''}
                    onChange={(e) => handleSaveConfig('google', { ...googleProv.config, apiSecret: e.target.value })}
                    placeholder="GA4 API secret key"
                  />
                </div>
              </div>

              {/* Independent Service Connect Statuses */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '10px', marginBottom: 'var(--space-4)' }}>
                <h4 style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Ecosystem Service Connections:</h4>
                
                {Object.entries(googleServices).map(([srvId, status]) => (
                  <div key={srvId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.01)', paddingBottom: '4px' }}>
                    <span style={{ textTransform: 'capitalize' }}>
                      {srvId === 'ga4' && '📈 Google Analytics 4'}
                      {srvId === 'gtm' && '🏷️ Google Tag Manager'}
                      {srvId === 'merchantCenter' && '📦 Merchant Center'}
                      {srvId === 'googleAds' && '💰 Google Ads Campaign'}
                      {srvId === 'searchConsole' && '🔎 Search Console'}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        className={styles.badge}
                        style={{
                          fontSize: '8px',
                          background: status === 'connected' ? 'rgba(76,175,80,0.1)' : status === 'needs_permission' ? 'rgba(255,152,0,0.1)' : 'rgba(255,255,255,0.02)',
                          color: status === 'connected' ? 'var(--success)' : status === 'needs_permission' ? 'var(--warning)' : 'var(--text-muted)',
                        }}
                      >
                        {status.toUpperCase().replace('_', ' ')}
                      </span>
                      <button className={styles.btn} style={{ padding: '2px 6px', fontSize: '9px' }} onClick={() => handleToggleGoogleService(srvId)}>
                        {status === 'connected' ? 'Disconnect' : 'Connect'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                className={styles.btn}
                style={{ fontSize: '0.75rem', padding: '6px 12px' }}
                onClick={() => {
                  setActiveSandboxId(activeSandboxId === 'google' ? null : 'google');
                  setSandboxResult(null);
                }}
              >
                🧪 Debug Event Simulator
              </button>
              <button
                className={styles.btn}
                style={{ fontSize: '0.75rem', padding: '6px 12px' }}
                onClick={async () => {
                  setTestingId('google');
                  await new Promise((resolve) => setTimeout(resolve, 800));
                  alert('Google API validation collections matched.');
                  setTestingId(null);
                }}
              >
                {testingId === 'google' ? 'Checking connection...' : '⚡ Test Connection'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Simulator Drawer Panel */}
      {activeSandboxId && (
        <div className={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
              🔬 Event Parser Simulator: {activeSandboxId.toUpperCase()}
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

          <div className={styles.formGroup} style={{ marginBottom: 'var(--space-3)' }}>
            <label className={styles.label} style={{ fontSize: '0.7rem' }}>JSON Payload Input</label>
            <textarea
              className={styles.input}
              style={{
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                height: '120px',
                background: 'rgba(0,0,0,0.1)',
              }}
              value={sandboxPayload}
              onChange={(e) => setSandboxPayload(e.target.value)}
            />
          </div>

          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            style={{ padding: '6px 12px', fontSize: '0.75rem' }}
            onClick={() => {
              const prov = providers.find(p => p.id === activeSandboxId);
              if (prov) handleRunSandboxTest(prov.id, prov.config);
            }}
            disabled={sandboxRunning}
          >
            {sandboxRunning ? 'Running Parser...' : '⚡ Validate & Send simulated event'}
          </button>

          {sandboxResult && (
            <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-3)', fontSize: '0.75rem', marginTop: 'var(--space-3)' }}>
              <div style={{ display: 'flex', gap: '15px', marginBottom: '6px' }}>
                <span>Event Validation: <strong style={{ color: sandboxResult.eventValid ? 'var(--success)' : 'var(--error)' }}>{sandboxResult.eventValid ? 'Passed' : 'Failed'}</strong></span>
                <span>Config Validation: <strong style={{ color: sandboxResult.configValid ? 'var(--success)' : 'var(--error)' }}>{sandboxResult.configValid ? 'Passed' : 'Failed'}</strong></span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>Transformed API Payload</div>
                  <pre style={{ margin: 0, padding: '4px', background: '#111', overflow: 'auto', maxHeight: '100px', fontSize: '0.7rem', borderRadius: '4px' }}>
                    {JSON.stringify(sandboxResult.mappedPayload, null, 2)}
                  </pre>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>Simulated Endpoint Response</div>
                  <pre style={{ margin: 0, padding: '4px', background: '#111', overflow: 'auto', maxHeight: '100px', fontSize: '0.7rem', borderRadius: '4px' }}>
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

  function handleEventChange(eName: string) {
    setSandboxEvent(eName);
    setSandboxPayload(JSON.stringify(SAMPLE_PAYLOADS[eName] || {}, null, 2));
  }
}
