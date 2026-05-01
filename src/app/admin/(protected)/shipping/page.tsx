'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/useToast';

/**
 * Admin shipping settings.
 *
 * All reads/writes go through `/api/admin/shipping`, which:
 *   - Verifies the admin session on the server.
 *   - Returns `api_key_set: boolean` instead of the raw key, so the
 *     secret never reaches the browser.
 *   - Accepts a partial PATCH; an empty `api_key` field leaves the
 *     stored key untouched ("leave blank to keep existing").
 */
interface SettingsState {
  provider_enabled: boolean;
  provider_name: string;
  api_url: string;
  api_key_set: boolean;
  pickup_name: string;
  pickup_phone: string;
  pickup_address_line1: string;
  pickup_address_line2: string;
  pickup_city: string;
  pickup_state: string;
  pickup_pincode: string;
  free_shipping_threshold_paise: number;
  default_shipping_charge_paise: number;
  cod_enabled: boolean;
  cod_fee_paise: number;
}

const EMPTY: SettingsState = {
  provider_enabled: false,
  provider_name: 'delhivery',
  api_url: '',
  api_key_set: false,
  pickup_name: '',
  pickup_phone: '',
  pickup_address_line1: '',
  pickup_address_line2: '',
  pickup_city: '',
  pickup_state: '',
  pickup_pincode: '',
  free_shipping_threshold_paise: 0,
  default_shipping_charge_paise: 0,
  cod_enabled: true,
  cod_fee_paise: 0,
};

const paiseToRupees = (paise: number) =>
  paise === 0 ? '' : (paise / 100).toString();
const rupeesToPaise = (rupees: string) => {
  const n = Number(rupees);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};

export default function AdminShipping() {
  const [state, setState] = useState<SettingsState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Input-bound rupee strings (kept separate so the admin can clear
  // the field without the view snapping back to "0").
  const [freeThresholdRs, setFreeThresholdRs] = useState('');
  const [shippingChargeRs, setShippingChargeRs] = useState('');
  const [codFeeRs, setCodFeeRs] = useState('');

  // New api_key typed by the admin this session. Empty = unchanged.
  const [newApiKey, setNewApiKey] = useState('');

  const { toast, showToast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const res = await fetch('/api/admin/shipping');
      const data = await res.json();
      if (!data.success) {
        showToast('Failed to load shipping settings', 'error');
        return;
      }
      const s = { ...EMPTY, ...(data.settings || {}) } as SettingsState;
      setState(s);
      setFreeThresholdRs(paiseToRupees(s.free_shipping_threshold_paise));
      setShippingChargeRs(paiseToRupees(s.default_shipping_charge_paise));
      setCodFeeRs(paiseToRupees(s.cod_fee_paise));
    } catch (err) {
      console.error('[SHIPPING_LOAD_FAILED]', err);
      showToast('Failed to load shipping settings', 'error');
    } finally {
      setLoading(false);
    }
  }

  function validate(): boolean {
    const e: Record<string, string> = {};

    // Provider config only strictly required when the provider
    // toggle is ON. This matches the existing admin expectation
    // (you can save partial settings while drafting).
    if (state.provider_enabled) {
      if (!state.api_url.trim()) e.api_url = 'API URL is required';
      if (!state.api_key_set && !newApiKey.trim())
        e.api_key = 'API key is required';
      if (!state.pickup_name.trim()) e.pickup_name = 'Pickup name is required';
      if (!state.pickup_address_line1.trim())
        e.pickup_address_line1 = 'Pickup address is required';
      if (!state.pickup_city.trim()) e.pickup_city = 'City is required';
      if (!state.pickup_state.trim()) e.pickup_state = 'State is required';
      if (!/^\d{6}$/.test(state.pickup_pincode))
        e.pickup_pincode = 'Enter a valid 6-digit pincode';
      if (state.pickup_phone && !/^[6-9]\d{9}$/.test(state.pickup_phone))
        e.pickup_phone = 'Enter a valid 10-digit phone';
    }

    // Pricing rules: non-negative integers.
    if (Number(freeThresholdRs) < 0)
      e.free_shipping_threshold_paise = 'Cannot be negative';
    if (Number(shippingChargeRs) < 0)
      e.default_shipping_charge_paise = 'Cannot be negative';
    if (state.cod_enabled && Number(codFeeRs) < 0)
      e.cod_fee_paise = 'Cannot be negative';

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (saving) return;
    if (!validate()) return;
    setSaving(true);

    const payload: Record<string, unknown> = {
      provider_enabled: state.provider_enabled,
      provider_name: state.provider_name || 'delhivery',
      api_url: state.api_url,
      pickup_name: state.pickup_name,
      pickup_phone: state.pickup_phone,
      pickup_address_line1: state.pickup_address_line1,
      pickup_address_line2: state.pickup_address_line2,
      pickup_city: state.pickup_city,
      pickup_state: state.pickup_state,
      pickup_pincode: state.pickup_pincode,
      free_shipping_threshold_paise: rupeesToPaise(freeThresholdRs),
      default_shipping_charge_paise: rupeesToPaise(shippingChargeRs),
      cod_enabled: state.cod_enabled,
      cod_fee_paise: rupeesToPaise(codFeeRs),
    };
    // Only send api_key when the admin typed a new one; empty = keep.
    if (newApiKey.trim().length > 0) payload.api_key = newApiKey.trim();

    try {
      const res = await fetch('/api/admin/shipping', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        showToast(data.error || 'Failed to save settings', 'error');
        return;
      }
      showToast('Settings saved successfully', 'success');
      // Clear the new-key field on success and mark key as set.
      if (newApiKey.trim().length > 0) {
        setNewApiKey('');
        setState((s) => ({ ...s, api_key_set: true }));
      }
    } catch (err) {
      console.error('[SHIPPING_SAVE_FAILED]', err);
      showToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div
        className="animate-pulse text-muted"
        style={{ textAlign: 'center', padding: 'var(--space-8)' }}
      >
        Loading...
      </div>
    );

  return (
    <div>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      <h1
        style={{
          fontSize: '1.25rem',
          fontWeight: 600,
          marginBottom: 'var(--space-5)',
        }}
      >
        Shipping Settings
      </h1>

      {/* ─── Provider ────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-5)',
          }}
        >
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: state.provider_enabled
                ? 'var(--success)'
                : 'var(--border-color)',
            }}
          />
          <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>
            {state.provider_name || 'Delhivery'}
          </span>
          <label
            className="premium-toggle"
            style={{ marginLeft: 'auto' }}
            title="Enable shipping provider"
          >
            <input
              type="checkbox"
              checked={state.provider_enabled}
              onChange={(e) =>
                setState((s) => ({ ...s, provider_enabled: e.target.checked }))
              }
            />
            <span className="premium-toggle-slider" />
          </label>
        </div>

        <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
          <label className="input-label">API URL</label>
          <input
            className={`input-field ${errors.api_url ? 'input-error' : ''}`}
            placeholder="https://track.delhivery.com/api"
            value={state.api_url}
            onChange={(e) => setState((s) => ({ ...s, api_url: e.target.value }))}
          />
          {errors.api_url && (
            <span className="input-error-text">{errors.api_url}</span>
          )}
        </div>

        <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
          <label className="input-label">
            API Key{' '}
            {state.api_key_set && (
              <span
                className="text-xs text-muted"
                style={{ fontWeight: 400, marginLeft: 6 }}
              >
                (leave blank to keep existing)
              </span>
            )}
          </label>
          <input
            className={`input-field ${errors.api_key ? 'input-error' : ''}`}
            type="password"
            placeholder={
              state.api_key_set ? '••••••••' : 'Enter provider API key'
            }
            value={newApiKey}
            onChange={(e) => setNewApiKey(e.target.value)}
            autoComplete="new-password"
          />
          {errors.api_key && (
            <span className="input-error-text">{errors.api_key}</span>
          )}
        </div>
      </div>

      {/* ─── Pickup address ───────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <p
          className="input-label"
          style={{ marginBottom: 'var(--space-4)', fontWeight: 600 }}
        >
          Pickup address
        </p>

        <div className="input-group" style={{ marginBottom: 'var(--space-3)' }}>
          <label className="input-label">Contact name</label>
          <input
            className={`input-field ${errors.pickup_name ? 'input-error' : ''}`}
            placeholder="Warehouse manager"
            value={state.pickup_name}
            onChange={(e) =>
              setState((s) => ({ ...s, pickup_name: e.target.value }))
            }
          />
          {errors.pickup_name && (
            <span className="input-error-text">{errors.pickup_name}</span>
          )}
        </div>

        <div className="input-group" style={{ marginBottom: 'var(--space-3)' }}>
          <label className="input-label">Contact phone</label>
          <input
            className={`input-field ${errors.pickup_phone ? 'input-error' : ''}`}
            placeholder="10-digit phone"
            value={state.pickup_phone}
            onChange={(e) =>
              setState((s) => ({ ...s, pickup_phone: e.target.value }))
            }
          />
          {errors.pickup_phone && (
            <span className="input-error-text">{errors.pickup_phone}</span>
          )}
        </div>

        <div className="input-group" style={{ marginBottom: 'var(--space-3)' }}>
          <label className="input-label">Address line 1</label>
          <input
            className={`input-field ${errors.pickup_address_line1 ? 'input-error' : ''}`}
            placeholder="Street, building, unit"
            value={state.pickup_address_line1}
            onChange={(e) =>
              setState((s) => ({ ...s, pickup_address_line1: e.target.value }))
            }
          />
          {errors.pickup_address_line1 && (
            <span className="input-error-text">{errors.pickup_address_line1}</span>
          )}
        </div>

        <div className="input-group" style={{ marginBottom: 'var(--space-3)' }}>
          <label className="input-label">Address line 2 (optional)</label>
          <input
            className="input-field"
            placeholder="Landmark, area"
            value={state.pickup_address_line2}
            onChange={(e) =>
              setState((s) => ({ ...s, pickup_address_line2: e.target.value }))
            }
          />
        </div>

        <div className="input-row" style={{ marginBottom: 'var(--space-3)' }}>
          <div className="input-group">
            <label className="input-label">City</label>
            <input
              className={`input-field ${errors.pickup_city ? 'input-error' : ''}`}
              value={state.pickup_city}
              onChange={(e) =>
                setState((s) => ({ ...s, pickup_city: e.target.value }))
              }
            />
            {errors.pickup_city && (
              <span className="input-error-text">{errors.pickup_city}</span>
            )}
          </div>
          <div className="input-group">
            <label className="input-label">State</label>
            <input
              className={`input-field ${errors.pickup_state ? 'input-error' : ''}`}
              value={state.pickup_state}
              onChange={(e) =>
                setState((s) => ({ ...s, pickup_state: e.target.value }))
              }
            />
            {errors.pickup_state && (
              <span className="input-error-text">{errors.pickup_state}</span>
            )}
          </div>
        </div>

        <div className="input-group">
          <label className="input-label">Pincode</label>
          <input
            className={`input-field ${errors.pickup_pincode ? 'input-error' : ''}`}
            placeholder="6-digit pincode"
            value={state.pickup_pincode}
            onChange={(e) =>
              setState((s) => ({ ...s, pickup_pincode: e.target.value }))
            }
          />
          {errors.pickup_pincode && (
            <span className="input-error-text">{errors.pickup_pincode}</span>
          )}
        </div>
      </div>

      {/* ─── Pricing rules ───────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <p
          className="input-label"
          style={{ marginBottom: 'var(--space-4)', fontWeight: 600 }}
        >
          Pricing rules
        </p>

        <div className="input-group" style={{ marginBottom: 'var(--space-3)' }}>
          <label className="input-label">
            Free shipping threshold (₹){' '}
            <span
              className="text-xs text-muted"
              style={{ fontWeight: 400, marginLeft: 6 }}
            >
              0 disables
            </span>
          </label>
          <input
            className={`input-field ${errors.free_shipping_threshold_paise ? 'input-error' : ''}`}
            type="number"
            min={0}
            step={1}
            placeholder="0"
            value={freeThresholdRs}
            onChange={(e) => setFreeThresholdRs(e.target.value)}
          />
          {errors.free_shipping_threshold_paise && (
            <span className="input-error-text">
              {errors.free_shipping_threshold_paise}
            </span>
          )}
        </div>

        <div className="input-group">
          <label className="input-label">Default shipping charge (₹)</label>
          <input
            className={`input-field ${errors.default_shipping_charge_paise ? 'input-error' : ''}`}
            type="number"
            min={0}
            step={1}
            placeholder="0"
            value={shippingChargeRs}
            onChange={(e) => setShippingChargeRs(e.target.value)}
          />
          {errors.default_shipping_charge_paise && (
            <span className="input-error-text">
              {errors.default_shipping_charge_paise}
            </span>
          )}
        </div>
      </div>

      {/* ─── COD ──────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-4)',
          }}
        >
          <span style={{ fontWeight: 600 }}>Cash on Delivery</span>
          <label
            className="premium-toggle"
            style={{ marginLeft: 'auto' }}
            title="Enable COD"
          >
            <input
              type="checkbox"
              checked={state.cod_enabled}
              onChange={(e) =>
                setState((s) => ({ ...s, cod_enabled: e.target.checked }))
              }
            />
            <span className="premium-toggle-slider" />
          </label>
        </div>

        <div className="input-group">
          <label className="input-label">COD fee (₹)</label>
          <input
            className={`input-field ${errors.cod_fee_paise ? 'input-error' : ''}`}
            type="number"
            min={0}
            step={1}
            placeholder="0"
            value={codFeeRs}
            onChange={(e) => setCodFeeRs(e.target.value)}
            disabled={!state.cod_enabled}
          />
          {errors.cod_fee_paise && (
            <span className="input-error-text">{errors.cod_fee_paise}</span>
          )}
        </div>
      </div>

      <button
        className={`btn btn-primary ${saving ? 'btn-loading' : ''}`}
        onClick={handleSave}
        disabled={saving}
      >
        SAVE SETTINGS
      </button>
    </div>
  );
}
