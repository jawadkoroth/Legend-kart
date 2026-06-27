'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import styles from './settings.module.css';

interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string | null;
}

interface DlqEvent {
  event_id: string;
  event_name: string;
  ts_server: string;
  validation_errors: string[];
  provider_errors: Record<string, string>;
  properties: any;
}

interface AdminUser {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

const TABS = [
  { id: 'general', label: '⚙️ General', desc: 'Configure primary store details, timezones, and base parameters.' },
  { id: 'business', label: '👤 Business Info', desc: 'Manage official business contact coordinates and tax identifiers.' },
  { id: 'payments', label: '💳 Payments', desc: 'Toggle credit cards, UPI options, and Razorpay endpoints.' },
  { id: 'shipping', label: '🚚 Shipping', desc: 'Select logistics carriers and define pricing calculations.' },
  { id: 'notifications', label: '✉️ Notifications', desc: 'Configure SMS endpoints, transaction emails, and push targets.' },
  { id: 'users', label: '👥 Users & Roles', desc: 'Manage access controls and roles for administrative users.' },
  { id: 'marketing', label: '📈 Marketing', desc: 'Attribution cookie policies, Meta CAPI parameters, and GA4 tag tracking.' },
  { id: 'automation', label: '⚡ Automation', desc: 'Inspect automation limits, active worker processes, and Flow nodes.' },
  { id: 'integrations', label: '🔌 Integrations', desc: 'Google XML merchant connections and Firebase server credentials.' },
  { id: 'developer', label: '🛠️ Developer Tools', desc: 'Diagnostics, Experimental Features, and Failed Events logs.' }
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');

  // General & Business Info States
  const [storeName, setStoreName] = useState('NOIR Luxury Store');
  const [storeUrl, setStoreUrl] = useState('https://noir-store.in');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [gstin, setGstin] = useState('');
  const [businessEmail, setBusinessEmail] = useState('business@noir.in');
  const [businessPhone, setBusinessPhone] = useState('+91 98765 43210');
  const [businessAddress, setBusinessAddress] = useState('Taj Mahal Palace, Apollo Bandar, Colaba, Mumbai, MH, 400001');

  // Payments States
  const [paymentMode, setPaymentMode] = useState('sandbox');
  const [enableCod, setEnableCod] = useState(true);
  const [enableOnline, setEnableOnline] = useState(true);
  const [razorpayKey, setRazorpayKey] = useState('rzp_test_5hE7xN...');

  // Shipping States
  const [shippingCarrier, setShippingCarrier] = useState('delhivery');
  const [shippingConfig, setShippingConfig] = useState('{\n  "mode": "sandbox",\n  "api_key": "delh_test_key_xxxx"\n}');
  const [shippingRowId, setShippingRowId] = useState<number | null>(null);

  // Notifications States
  const [systemEmail, setSystemEmail] = useState('orders@noir.in');
  const [smsGateway, setSmsGateway] = useState('twilio');

  // Users & Roles States
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('marketing');

  // Marketing States
  const [consentVersion, setConsentVersion] = useState('1.0.0');
  const [metaPixelId, setMetaPixelId] = useState('pixel_xxxxxx');
  const [ga4Id, setGa4Id] = useState('G-XXXXXX');

  // Developer overrides & data states
  const [mockRole, setMockRole] = useState('admin');
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [dlqEvents, setDlqEvents] = useState<DlqEvent[]>([]);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [loadingDb, setLoadingDb] = useState(false);

  const supabase = createClient();

  // Handle tab URL hashes
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && TABS.some(t => t.id === hash)) {
        setActiveTab(hash);
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Fetch local configuration values
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setStoreName(localStorage.getItem('set_store_name') || 'NOIR Luxury Store');
      setStoreUrl(localStorage.getItem('set_store_url') || 'https://noir-store.in');
      setTimezone(localStorage.getItem('set_timezone') || 'Asia/Kolkata');
      setGstin(localStorage.getItem('set_gstin') || '27AAAAA1111A1Z1');
      setBusinessEmail(localStorage.getItem('set_business_email') || 'business@noir.in');
      setBusinessPhone(localStorage.getItem('set_business_phone') || '+91 98765 43210');
      setBusinessAddress(localStorage.getItem('set_business_address') || 'Taj Mahal Palace, Apollo Bandar, Colaba, Mumbai, MH, 400001');
      setPaymentMode(localStorage.getItem('set_payment_mode') || 'sandbox');
      setEnableCod(localStorage.getItem('set_enable_cod') !== 'false');
      setEnableOnline(localStorage.getItem('set_enable_online') !== 'false');
      setRazorpayKey(localStorage.getItem('set_razorpay_key') || 'rzp_test_5hE7xN...');
      setSystemEmail(localStorage.getItem('set_system_email') || 'orders@noir.in');
      setSmsGateway(localStorage.getItem('set_sms_gateway') || 'twilio');
      setConsentVersion(localStorage.getItem('set_consent_version') || '1.0.0');
      setMetaPixelId(localStorage.getItem('set_meta_pixel_id') || 'pixel_xxxxxx');
      setGa4Id(localStorage.getItem('set_ga4_id') || 'G-XXXXXX');
      
      const savedMock = localStorage.getItem('panther_mock_role') || 'admin';
      setMockRole(savedMock);
    }
  }, []);

  // Fetch live Db settings (shipping, admin_users, feature flags, DLQ)
  useEffect(() => {
    async function loadDbConfig() {
      setLoadingDb(true);
      try {
        // 1. Fetch shipping carrier
        const { data: shipData } = await supabase.from('shipping_settings').select('*').limit(1).maybeSingle();
        if (shipData) {
          setShippingRowId(shipData.id);
          setShippingCarrier(shipData.active_provider || 'delhivery');
          if (shipData.provider_config) {
            setShippingConfig(JSON.stringify(shipData.provider_config, null, 2));
          }
        }

        // 2. Fetch admin users
        const { data: usersData } = await supabase.from('admin_users').select('*').order('created_at', { ascending: false });
        if (usersData) {
          setAdminUsers(usersData);
        }

        // 3. Fetch feature flags
        const { data: flagsData } = await supabase.from('marketing_feature_flags').select('*').order('key');
        if (flagsData) {
          setFlags(flagsData);
        }

        // 4. Fetch DLQ events
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || '';
        const dlqRes = await fetch('/api/admin/marketing/dlq', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (dlqRes.ok) {
          const outcome = await dlqRes.json();
          setDlqEvents(outcome.events || []);
        }
      } catch (err) {
        console.error('[SETTINGS_LOAD_DB_ERR]', err);
      } finally {
        setLoadingDb(false);
      }
    }
    loadDbConfig();
  }, []);

  // Save handlers
  const handleSaveLocal = (key: string, value: string, alertText = 'Settings successfully saved.') => {
    localStorage.setItem(key, value);
    alert(alertText);
  };

  const handleSaveGeneral = () => {
    localStorage.setItem('set_store_name', storeName);
    localStorage.setItem('set_store_url', storeUrl);
    localStorage.setItem('set_timezone', timezone);
    alert('General settings saved to configuration store.');
  };

  const handleSaveBusiness = () => {
    localStorage.setItem('set_gstin', gstin);
    localStorage.setItem('set_business_email', businessEmail);
    localStorage.setItem('set_business_phone', businessPhone);
    localStorage.setItem('set_business_address', businessAddress);
    alert('Official business coordinates details updated.');
  };

  const handleSavePayments = () => {
    localStorage.setItem('set_payment_mode', paymentMode);
    localStorage.setItem('set_enable_cod', String(enableCod));
    localStorage.setItem('set_enable_online', String(enableOnline));
    localStorage.setItem('set_razorpay_key', razorpayKey);
    alert('Payment gateway credentials and options saved.');
  };

  const handleSaveShipping = async () => {
    try {
      const parsedConfig = JSON.parse(shippingConfig);
      const { error } = await supabase
        .from('shipping_settings')
        .update({
          active_provider: shippingCarrier,
          provider_config: parsedConfig
        })
        .eq('id', shippingRowId || 1);

      if (error) {
        alert(`Database update failed: ${error.message}`);
      } else {
        alert('Logistics credentials successfully synchronized with database.');
      }
    } catch {
      alert('Invalid JSON formatting inside Carrier Configurations.');
    }
  };

  const handleSaveNotifications = () => {
    localStorage.setItem('set_system_email', systemEmail);
    localStorage.setItem('set_sms_gateway', smsGateway);
    alert('Transactional alert channels updated.');
  };

  const handleSaveMarketing = () => {
    localStorage.setItem('set_consent_version', consentVersion);
    localStorage.setItem('set_meta_pixel_id', metaPixelId);
    localStorage.setItem('set_ga4_id', ga4Id);
    alert('Attribution pixels and tag configurations saved.');
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    const { error } = await supabase
      .from('admin_users')
      .update({ role: newRole })
      .eq('id', userId);

    if (error) {
      alert(`Role change failed: ${error.message}`);
    } else {
      setAdminUsers(adminUsers.map(u => u.id === userId ? { ...u, role: newRole } : u));
      alert('Administrative security privilege updated.');
    }
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    alert(`Mock Invite dispatched to: ${inviteEmail} with access role permissions: ${inviteRole}. Invites must complete auth confirmations via registered emails.`);
    setInviteEmail('');
  };

  const handleToggleFlag = async (key: string, currentEnabled: boolean) => {
    const { error } = await supabase
      .from('marketing_feature_flags')
      .update({ enabled: !currentEnabled, updated_at: new Date().toISOString() })
      .eq('key', key);

    if (error) {
      alert(error.message);
    } else {
      setFlags(flags.map(f => f.key === key ? { ...f, enabled: !currentEnabled } : f));
    }
  };

  const handleMockRoleOverride = (newRole: string) => {
    setMockRole(newRole);
    localStorage.setItem('panther_mock_role', newRole);
    // Dispatch standard window storage event to let sidebar react immediately
    window.dispatchEvent(new Event('storage'));
    alert(`Mock Role active: ${newRole.toUpperCase()}. The navigation sidebar will dynamically re-evaluate permissions.`);
  };

  const handleReplayEvent = async (eventId: string) => {
    setReplayingId(eventId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const res = await fetch('/api/admin/marketing/dlq', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'replay',
          eventIds: [eventId],
        }),
      });

      if (res.ok) {
        alert('Event replayed successfully.');
        setDlqEvents(dlqEvents.filter(ev => ev.event_id !== eventId));
      } else {
        alert('Replay execution failed.');
      }
    } catch (err: any) {
      alert(`Error replaying: ${err.message}`);
    } finally {
      setReplayingId(null);
    }
  };

  const handleDeleteDlqEvent = async (eventId: string) => {
    if (!confirm('Permanently dismiss this failed event?')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      const res = await fetch(`/api/admin/marketing/dlq?ids=${eventId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        setDlqEvents(dlqEvents.filter(ev => ev.event_id !== eventId));
        alert('Dismissed.');
      }
    } catch {}
  };

  return (
    <div className={styles.container}>
      
      {/* Left Navigation Menu */}
      <aside className={styles.sidebar}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              window.location.hash = tab.id;
            }}
            className={`${styles.tabBtn} ${activeTab === tab.id ? styles.activeTabBtn : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </aside>

      {/* Right Tab Content Panel */}
      <main className={styles.contentArea}>
        
        {/* TAB 1: GENERAL */}
        {activeTab === 'general' && (
          <div>
            <div className={styles.sectionHeader}>
              <h2 className={styles.title}>General settings</h2>
              <p className={styles.subtitle}>Configure core store title metadata, localization, and display settings.</p>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Store name</label>
                <input type="text" className={styles.input} value={storeName} onChange={(e) => setStoreName(e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Store URL</label>
                <input type="text" className={styles.input} value={storeUrl} onChange={(e) => setStoreUrl(e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Timezone</label>
                <select className={styles.select} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  <option value="Asia/Kolkata">India (IST) - UTC+05:30</option>
                  <option value="UTC">UTC / Coordinated Universal Time</option>
                  <option value="America/New_York">Eastern Time (EST) - UTC-05:00</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Store Currency</label>
                <input type="text" className={styles.input} value="Indian Rupee (INR - ₹)" disabled />
              </div>
            </div>
            <div className={styles.actionsRow}>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleSaveGeneral}>Save General Configs</button>
            </div>
          </div>
        )}

        {/* TAB 2: BUSINESS INFORMATION */}
        {activeTab === 'business' && (
          <div>
            <div className={styles.sectionHeader}>
              <h2 className={styles.title}>Business information</h2>
              <p className={styles.subtitle}>Specify official tax identifiers and legal business coordinates.</p>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>GSTIN / Business Registration</label>
                <input type="text" className={styles.input} placeholder="e.g. 27AAAAA1111A1Z1" value={gstin} onChange={(e) => setGstin(e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Contact Email</label>
                <input type="email" className={styles.input} value={businessEmail} onChange={(e) => setBusinessEmail(e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Contact Phone</label>
                <input type="text" className={styles.input} value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} />
              </div>
              <div className={styles.formGroupFull}>
                <label className={styles.label}>Official Business Address</label>
                <textarea className={styles.textarea} value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)} />
              </div>
            </div>
            <div className={styles.actionsRow}>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleSaveBusiness}>Save Business Info</button>
            </div>
          </div>
        )}

        {/* TAB 3: PAYMENTS */}
        {activeTab === 'payments' && (
          <div>
            <div className={styles.sectionHeader}>
              <h2 className={styles.title}>Payments gateway config</h2>
              <p className={styles.subtitle}>Configure active payment options and Razorpay API tokens.</p>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Gateway Mode</label>
                <select className={styles.select} value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                  <option value="sandbox">Sandbox Test Mode</option>
                  <option value="live">Live Transactions Mode</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Razorpay API Key ID</label>
                <input type="text" className={styles.input} value={razorpayKey} onChange={(e) => setRazorpayKey(e.target.value)} />
              </div>
              <div className={styles.formGroupFull}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={enableCod} onChange={(e) => setEnableCod(e.target.checked)} />
                    <span className={styles.checkboxLabel}>Enable Cash on Delivery (COD) Option</span>
                  </label>
                  <label className={styles.checkboxContainer}>
                    <input type="checkbox" checked={enableOnline} onChange={(e) => setEnableOnline(e.target.checked)} />
                    <span className={styles.checkboxLabel}>Enable Online Cards / UPI / Wallet Processing</span>
                  </label>
                </div>
              </div>
            </div>
            <div className={styles.actionsRow}>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleSavePayments}>Save Payments Setup</button>
            </div>
          </div>
        )}

        {/* TAB 4: SHIPPING */}
        {activeTab === 'shipping' && (
          <div>
            <div className={styles.sectionHeader}>
              <h2 className={styles.title}>Shipping & Logistics</h2>
              <p className={styles.subtitle}>Configure third-party carrier setups (Delhivery) and sync tokens.</p>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Active Logistics Provider</label>
                <select className={styles.select} value={shippingCarrier} onChange={(e) => setShippingCarrier(e.target.value)}>
                  <option value="delhivery">Delhivery Cargo Services</option>
                  <option value="mock">Local Simulated Carrier</option>
                </select>
              </div>
              <div className={styles.formGroupFull}>
                <label className={styles.label}>Carrier Configurations (JSON)</label>
                <textarea
                  className={styles.textarea}
                  style={{ fontFamily: 'monospace', fontSize: '11px', minHeight: '120px' }}
                  value={shippingConfig}
                  onChange={(e) => setShippingConfig(e.target.value)}
                />
              </div>
            </div>
            <div className={styles.actionsRow}>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleSaveShipping}>Save Logistics Settings</button>
            </div>
          </div>
        )}

        {/* TAB 5: NOTIFICATIONS */}
        {activeTab === 'notifications' && (
          <div>
            <div className={styles.sectionHeader}>
              <h2 className={styles.title}>Notifications & Alerts</h2>
              <p className={styles.subtitle}>Define communication addresses for customer notifications.</p>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>System Dispatch Email Address</label>
                <input type="email" className={styles.input} value={systemEmail} onChange={(e) => setSystemEmail(e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Transactional SMS Gateway</label>
                <select className={styles.select} value={smsGateway} onChange={(e) => setSmsGateway(e.target.value)}>
                  <option value="twilio">Twilio SMS Engine</option>
                  <option value="plivo">Plivo SMS Engine</option>
                  <option value="mock">Disabled / Logs-only Sim</option>
                </select>
              </div>
            </div>
            <div className={styles.actionsRow}>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleSaveNotifications}>Save Alerts Setup</button>
            </div>
          </div>
        )}

        {/* TAB 6: USERS & ROLES */}
        {activeTab === 'users' && (
          <div>
            <div className={styles.sectionHeader}>
              <h2 className={styles.title}>Users & Access Roles</h2>
              <p className={styles.subtitle}>Add administrative operators and set access control permissions.</p>
            </div>

            {/* Invite Form */}
            <form onSubmit={handleInviteUser} className={styles.card} style={{ marginBottom: '24px' }}>
              <strong className={styles.cardTitle}>Invite New Administrator</strong>
              <div className={styles.formGrid} style={{ marginTop: '12px', marginBottom: '12px' }}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Email Address</label>
                  <input
                    type="email"
                    className={styles.input}
                    placeholder="e.g. support@noir-store.in"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Security Role</label>
                  <select className={styles.select} value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                    <option value="admin">Administrator (Full Access)</option>
                    <option value="marketing">Marketing Specialist (CDP & Flows)</option>
                    <option value="support">Customer Support (Returns & Profiles)</option>
                    <option value="warehouse">Warehouse Operator (Shipping & Inventory)</option>
                    <option value="developer">Developer (Diagnostics & Diagnostics Status)</option>
                  </select>
                </div>
              </div>
              <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} style={{ padding: '6px 14px' }}>Send Invite Link</button>
            </form>

            {/* List */}
            <div className={styles.card}>
              <strong className={styles.cardTitle}>Active Administrators Directory ({adminUsers.length})</strong>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Operator Email</th>
                    <th>Created Date</th>
                    <th>Access Privilege</th>
                  </tr>
                </thead>
                <tbody>
                  {adminUsers.map((item) => (
                    <tr key={item.id}>
                      <td>{item.email}</td>
                      <td>{new Date(item.created_at).toLocaleDateString()}</td>
                      <td>
                        <select
                          className={styles.select}
                          style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          value={item.role || 'admin'}
                          onChange={(e) => handleUpdateRole(item.id, e.target.value)}
                        >
                          <option value="owner">Owner (Full Privileges)</option>
                          <option value="admin">Admin</option>
                          <option value="marketing">Marketing</option>
                          <option value="support">Support</option>
                          <option value="warehouse">Warehouse</option>
                          <option value="developer">Developer</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 7: MARKETING */}
        {activeTab === 'marketing' && (
          <div>
            <div className={styles.sectionHeader}>
              <h2 className={styles.title}>Marketing & Attribution</h2>
              <p className={styles.subtitle}>Configure user-tracking tags, cookie policies, and destination IDs.</p>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Cookie Consent Policies Version</label>
                <input type="text" className={styles.input} value={consentVersion} onChange={(e) => setConsentVersion(e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Google Analytics 4 Measurement ID</label>
                <input type="text" className={styles.input} value={ga4Id} onChange={(e) => setGa4Id(e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Meta pixel ID</label>
                <input type="text" className={styles.input} value={metaPixelId} onChange={(e) => setMetaPixelId(e.target.value)} />
              </div>
            </div>
            <div className={styles.actionsRow}>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleSaveMarketing}>Save Tracking Configurations</button>
            </div>
          </div>
        )}

        {/* TAB 8: AUTOMATION */}
        {activeTab === 'automation' && (
          <div>
            <div className={styles.sectionHeader}>
              <h2 className={styles.title}>Panther Flow Automation</h2>
              <p className={styles.subtitle}>Define background processing limits and workflow engine configs.</p>
            </div>
            <div className={styles.card} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <strong className={styles.cardTitle}>Engine Capacity Rates</strong>
                <p className={styles.cardDesc}>Maximise executions queues counts to prevent delays.</p>
                <div style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <div>Active Threads: <strong>4 workers</strong></div>
                  <div>Max Queue Depth: <strong>10,000 tasks</strong></div>
                  <div>Max Workflow Retries: <strong>3 attempts</strong></div>
                </div>
              </div>
              <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '20px' }}>
                <strong className={styles.cardTitle}>Workflow Health Status</strong>
                <p className={styles.cardDesc}>Engine is operating normally inside NextJS background queue.</p>
                <div style={{ marginTop: '12px' }}>
                  <span className={`${styles.badge} ${styles.badgeSuccess}`}>Operational</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 9: INTEGRATIONS */}
        {activeTab === 'integrations' && (
          <div>
            <div className={styles.sectionHeader}>
              <h2 className={styles.title}>Integrations</h2>
              <p className={styles.subtitle}>Audit third-party catalog feeds and system sync coordinates.</p>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formGroupFull}>
                <div className={styles.card}>
                  <strong className={styles.cardTitle}>Meta Catalogue XML Feed</strong>
                  <p className={styles.cardDesc}>Public XML file location used by Meta Ads Manager to sync catalog listings.</p>
                  <input
                    type="text"
                    className={styles.input}
                    style={{ width: '100%', marginTop: '10px', fontSize: '11px', background: 'rgba(0,0,0,0.2)' }}
                    value={`${storeUrl}/feeds/meta.xml`}
                    disabled
                  />
                </div>
                <div className={styles.card}>
                  <strong className={styles.cardTitle}>Google Merchant XML Feed</strong>
                  <p className={styles.cardDesc}>Product catalog location for Google Merchant Center.</p>
                  <input
                    type="text"
                    className={styles.input}
                    style={{ width: '100%', marginTop: '10px', fontSize: '11px', background: 'rgba(0,0,0,0.2)' }}
                    value={`${storeUrl}/feeds/google-merchant.xml`}
                    disabled
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 10: DEVELOPER TOOLS PORTAL */}
        {activeTab === 'developer' && (
          <div>
            <div className={styles.sectionHeader}>
              <h2 className={styles.title}>Developer Operations Center</h2>
              <p className={styles.subtitle}>Manage experimental configurations, review logs, and examine schema status indicators.</p>
            </div>

            {/* Interactive Mock Access overrides */}
            <div className={styles.card} style={{ marginBottom: '24px', border: '1px solid var(--accent-gold)' }}>
              <strong className={styles.cardTitle} style={{ color: 'var(--accent-gold)' }}>🧪 Experimental Override: Mock Access Permission Role</strong>
              <p className={styles.cardDesc}>
                Instantly mock your administrative role to test navigation permission filters and UI access levels.
              </p>
              <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Selected Role Override:</span>
                <select
                  className={styles.select}
                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                  value={mockRole}
                  onChange={(e) => handleMockRoleOverride(e.target.value)}
                >
                  <option value="owner">Owner / Admin (All access)</option>
                  <option value="marketing">Marketing (No Orders/Shipping/Settings)</option>
                  <option value="support">Support Specialist (Orders and Profiles only)</option>
                  <option value="warehouse">Warehouse Operator (Shipping and Products only)</option>
                  <option value="developer">Developer (Diagnostics and Settings only)</option>
                </select>
                <button 
                  className={styles.btn} 
                  style={{ padding: '6px 12px', fontSize: '0.75rem' }} 
                  onClick={() => handleMockRoleOverride('admin')}
                >
                  Reset to DB role
                </button>
              </div>
            </div>

            {/* Main Navigation Sub-sections grid */}
            <h3 style={{ textTransform: 'uppercase', fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: '12px' }}>
              Platform Services Status & Audits
            </h3>
            <div className={styles.devGrid} style={{ marginBottom: '24px' }}>
              <Link href="/admin/settings/developer/database-health?tab=database" className={styles.devCard}>
                <strong>System Status</strong>
                <p>Verify tables schemas, active trigger hooks, storage pings, and migrations validation metrics.</p>
              </Link>
              <Link href="/admin/settings/developer/database-health?tab=jobs" className={styles.devCard}>
                <strong>Job Queue Engine</strong>
                <p>Inspect active background tasks, schedules running states, and executions timeouts histories.</p>
              </Link>
              <Link href="/admin/settings/developer/database-health?tab=diagnostics" className={styles.devCard}>
                <strong>System Audit logs</strong>
                <p>Review telemetry warnings, schema check assertions logs, and database errors traces.</p>
              </Link>
              <Link href="/admin/settings/developer/database-health?tab=environment" className={styles.devCard}>
                <strong>Environment variables</strong>
                <p>Examine sandbox environment configurations and verify active provider endpoint bindings.</p>
              </Link>
            </div>

            {/* Feature Flags Toggles */}
            <div className={styles.card} style={{ marginBottom: '24px' }}>
              <strong className={styles.cardTitle}>🚩 Experimental Features & Flags</strong>
              <p className={styles.cardDesc} style={{ marginBottom: '12px' }}>Enable or disable platform features immediately.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {flags.map((flag) => (
                  <div key={flag.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                    <div>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{flag.key}</strong>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>{flag.description}</p>
                    </div>
                    <label className={styles.switch}>
                      <input type="checkbox" checked={flag.enabled} onChange={() => handleToggleFlag(flag.key, flag.enabled)} />
                      <span className={styles.slider} />
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Failed Events Retry Queue (DLQ Manager) */}
            <div className={styles.card}>
              <strong className={styles.cardTitle} style={{ color: dlqEvents.length > 0 ? 'var(--error)' : 'inherit' }}>
                📭 Failed Events (Retry Queue) ({dlqEvents.length})
              </strong>
              <p className={styles.cardDesc} style={{ marginBottom: '12px' }}>Review and replay marketing events that failed schema validation or encountered destination issues.</p>
              
              {dlqEvents.length === 0 ? (
                <div style={{ color: 'var(--success)', fontSize: '0.8rem', padding: '10px', background: 'rgba(76,175,80,0.04)', borderRadius: '4px', border: '1px solid rgba(76,175,80,0.1)' }}>
                  ✓ Retry Queue is clear. No events are currently stuck.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '350px', overflowY: 'auto' }}>
                  {dlqEvents.map((ev) => {
                    const errText = ev.validation_errors?.length > 0
                      ? `Schema verification failure: ${ev.validation_errors.join(', ')}`
                      : `Dispatch failures: ${Object.entries(ev.provider_errors || {}).map(([p, e]) => `${p}: ${e}`).join(', ')}`;

                    return (
                      <div key={ev.event_id} style={{ border: '1px solid var(--border-color)', padding: '10px', borderRadius: '4px', background: 'rgba(229,57,53,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <strong style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>{ev.event_name}</strong>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(ev.ts_server).toLocaleTimeString()}</span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--error)', margin: '4px 0', fontFamily: 'monospace' }}>
                          {errText}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                          <button
                            className={styles.btn}
                            style={{ padding: '2px 8px', fontSize: '0.65rem' }}
                            onClick={() => handleReplayEvent(ev.event_id)}
                            disabled={replayingId === ev.event_id}
                          >
                            {replayingId === ev.event_id ? 'Replaying...' : '🔄 Retry Event'}
                          </button>
                          <button
                            className={styles.btn}
                            style={{ padding: '2px 8px', fontSize: '0.65rem', color: 'var(--error)', borderColor: 'rgba(229,57,53,0.2)' }}
                            onClick={() => handleDeleteDlqEvent(ev.event_id)}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

      </main>
    </div>
  );
}
