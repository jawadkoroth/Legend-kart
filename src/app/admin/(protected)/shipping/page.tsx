'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/useToast';

interface ShippingSettings {
  id: string;
  active_provider: string;
  provider_config: {
    api_key: string;
    api_url: string;
    pickup_location: string;
  };
}

export default function AdminShipping() {
  const [settings, setSettings] = useState<ShippingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [pickupLocation, setPickupLocation] = useState('');
  const [isActive, setIsActive] = useState(true);
  const { toast, showToast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    const supabase = createClient();
    const { data } = await supabase.from('shipping_settings').select('*').single();
    if (data) {
      setSettings(data);
      setApiKey(data.provider_config?.api_key || '');
      setApiUrl(data.provider_config?.api_url || 'https://track.delhivery.com/api');
      setPickupLocation(data.provider_config?.pickup_location || '');
      setIsActive(data.active_provider === 'delhivery');
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('shipping_settings')
      .update({
        active_provider: isActive ? 'delhivery' : '',
        provider_config: {
          api_key: apiKey,
          api_url: apiUrl,
          pickup_location: pickupLocation,
        },
      })
      .eq('id', settings.id);
      
    if (!error) showToast('Settings saved successfully', 'success');
    else showToast('Failed to save settings', 'error');
    
    setSaving(false);
  }

  if (loading) return <div className="animate-pulse text-muted" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>Loading...</div>;

  return (
    <div>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 'var(--space-5)' }}>Shipping Settings</h1>

      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: isActive ? 'var(--success)' : 'var(--border-color)' }} />
          <span style={{ fontWeight: 600 }}>Delhivery</span>
          <label className="premium-toggle" style={{ marginLeft: 'auto' }} title="Toggle provider">
            <input
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
            />
            <span className="premium-toggle-slider" />
          </label>
        </div>

        <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
          <label className="input-label">API Key</label>
          <input
            className="input-field"
            type="password"
            placeholder="Enter Delhivery API key"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
          />
        </div>

        <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
          <label className="input-label">API URL</label>
          <input
            className="input-field"
            placeholder="https://track.delhivery.com/api"
            value={apiUrl}
            onChange={e => setApiUrl(e.target.value)}
          />
        </div>

        <div className="input-group" style={{ marginBottom: 'var(--space-5)' }}>
          <label className="input-label">Pickup Location Name</label>
          <input
            className="input-field"
            placeholder="Warehouse, Office, etc."
            value={pickupLocation}
            onChange={e => setPickupLocation(e.target.value)}
          />
        </div>

        <button
          className={`btn btn-primary ${saving ? 'btn-loading' : ''}`}
          onClick={handleSave}
          disabled={saving}
        >
          SAVE SETTINGS
        </button>
      </div>
    </div>
  );
}
