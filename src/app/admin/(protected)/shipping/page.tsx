'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/useToast';

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

const paiseToRupees = (p: number) => (p === 0 ? '' : (p / 100).toString());
const rupeesToPaise = (r: string) => {
  const n = Number(r);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};

const PROVIDER_META: Record<string, { label: string; defaultUrl: string }> = {
  delhivery: { label: 'DELHIVERY', defaultUrl: 'https://track.delhivery.com/api' },
  shiprocket: { label: 'SHIPROCKET', defaultUrl: 'https://apiv2.shiprocket.in/v1/external' },
};

function pickupOneliner(s: SettingsState): string {
  const parts = [s.pickup_address_line1, s.pickup_city, s.pickup_state]
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length ? parts.join(', ') : 'No pickup address';
}

/* ─── Field ──────────────────────────────────────────────────────── */
function Field({
  label,
  error,
  children,
  hint,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="input-group">
      <label className="input-label">
        {label}
        {hint && (
          <span style={{ fontWeight: 400, marginLeft: 6, opacity: 0.6 }}>
            {hint}
          </span>
        )}
      </label>
      {children}
      {error && <span className="input-error-text">{error}</span>}
    </div>
  );
}

/* ─── Section divider ────────────────────────────────────────────── */
function SectionHead({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        margin: 'var(--space-6) 0 var(--space-4)',
      }}
    >
      <span
        style={{
          fontSize: '0.6875rem',
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: '1px',
          background: 'var(--border-color)',
        }}
      />
    </div>
  );
}

/* ─── Capability pill ────────────────────────────────────────────── */
function CapPill({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 10px',
        borderRadius: 99,
        fontSize: '0.6875rem',
        fontWeight: 600,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        border: `1px solid ${active ? 'var(--border-light)' : 'var(--border-color)'}`,
        color: active ? 'var(--text-secondary)' : 'var(--text-muted)',
        opacity: active ? 1 : 0.45,
      }}
    >
      {label}
    </span>
  );
}

/* ─── Provider card (collapsed header) ───────────────────────────── */
function ProviderCardHeader({
  state,
  expanded,
  onToggleExpand,
}: {
  state: SettingsState;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const meta = PROVIDER_META[state.provider_name] ?? PROVIDER_META.delhivery;
  const isActive = state.provider_enabled;
  const pickup = pickupOneliner(state);
  const hasKey = state.api_key_set;

  return (
    <button
      onClick={onToggleExpand}
      style={{
        width: '100%',
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        textAlign: 'left',
        WebkitTapHighlightColor: 'transparent',
      }}
      aria-expanded={expanded}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
        }}
      >
        {/* Active indicator */}
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            flexShrink: 0,
            background: isActive ? 'var(--success)' : 'var(--border-light)',
            boxShadow: isActive ? '0 0 0 3px rgba(76,175,80,0.15)' : 'none',
            transition: 'all 0.2s',
          }}
        />

        {/* Name + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '0.8125rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              {meta.label}
            </span>

            {isActive && (
              <span
                style={{
                  fontSize: '0.625rem',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  padding: '2px 8px',
                  borderRadius: 3,
                  background: 'rgba(76,175,80,0.12)',
                  color: 'var(--success)',
                  border: '1px solid rgba(76,175,80,0.25)',
                }}
              >
                ACTIVE
              </span>
            )}

            <span
              style={{
                fontSize: '0.625rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                padding: '2px 7px',
                borderRadius: 3,
                background: 'var(--bg-input)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border-color)',
              }}
            >
              SANDBOX
            </span>
          </div>

          <div
            style={{
              marginTop: 4,
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pickup}
            </span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span style={{ color: hasKey ? 'var(--success)' : 'var(--error)', flexShrink: 0 }}>
              {hasKey ? 'Connected' : 'Not configured'}
            </span>
          </div>
        </div>

        {/* Chevron */}
        <span
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            flexShrink: 0,
          }}
        >
          ▾
        </span>
      </div>
    </button>
  );
}

/* ─── Main page ──────────────────────────────────────────────────── */
export default function AdminShipping() {
  const [state, setState] = useState<SettingsState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [freeThresholdRs, setFreeThresholdRs] = useState('');
  const [shippingChargeRs, setShippingChargeRs] = useState('');
  const [codFeeRs, setCodFeeRs] = useState('');
  const [newApiKey, setNewApiKey] = useState('');

  const { toast, showToast } = useToast();

  useEffect(() => { fetchSettings(); }, []);

  async function fetchSettings() {
    try {
      const res = await fetch('/api/admin/shipping');
      const data = await res.json();
      if (!data.success) { showToast('Failed to load shipping settings', 'error'); return; }
      const raw = data.settings || {};
      const s: SettingsState = {
        ...EMPTY,
        ...raw,
        provider_name: raw.provider_name ?? EMPTY.provider_name,
        api_url: raw.api_url ?? '',
        pickup_name: raw.pickup_name ?? '',
        pickup_phone: raw.pickup_phone ?? '',
        pickup_address_line1: raw.pickup_address_line1 ?? '',
        pickup_address_line2: raw.pickup_address_line2 ?? '',
        pickup_city: raw.pickup_city ?? '',
        pickup_state: raw.pickup_state ?? '',
        pickup_pincode: raw.pickup_pincode ?? '',
      };
      setState(s);
      setFreeThresholdRs(paiseToRupees(s.free_shipping_threshold_paise));
      setShippingChargeRs(paiseToRupees(s.default_shipping_charge_paise));
      setCodFeeRs(paiseToRupees(s.cod_fee_paise));
    } catch {
      showToast('Failed to load shipping settings', 'error');
    } finally {
      setLoading(false);
    }
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (state.provider_enabled) {
      if (!state.api_url.trim()) e.api_url = 'API URL is required';
      if (!state.api_key_set && !newApiKey.trim()) e.api_key = 'API key is required';
      if (!state.pickup_name.trim()) e.pickup_name = 'Contact name is required';
      if (!state.pickup_address_line1.trim()) e.pickup_address_line1 = 'Address is required';
      if (!state.pickup_city.trim()) e.pickup_city = 'City is required';
      if (!state.pickup_state.trim()) e.pickup_state = 'State is required';
      if (!/^\d{6}$/.test(state.pickup_pincode)) e.pickup_pincode = 'Enter a valid 6-digit pincode';
      if (state.pickup_phone && !/^[6-9]\d{9}$/.test(state.pickup_phone)) e.pickup_phone = 'Enter a valid 10-digit phone';
    }
    if (Number(freeThresholdRs) < 0) e.free_shipping_threshold_paise = 'Cannot be negative';
    if (Number(shippingChargeRs) < 0) e.default_shipping_charge_paise = 'Cannot be negative';
    if (state.cod_enabled && Number(codFeeRs) < 0) e.cod_fee_paise = 'Cannot be negative';
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
    if (newApiKey.trim().length > 0) payload.api_key = newApiKey.trim();
    try {
      const res = await fetch('/api/admin/shipping', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) { showToast(data.error || 'Failed to save settings', 'error'); return; }
      showToast('Settings saved', 'success');
      if (newApiKey.trim().length > 0) {
        setNewApiKey('');
        setState((s) => ({ ...s, api_key_set: true }));
      }
    } catch {
      showToast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-10)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem', letterSpacing: '0.08em' }}>
        LOADING
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      {/* ─── Page header ─────────────────────────────────────── */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <p style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 'var(--space-1)' }}>
          Shipping Console
        </p>
        <h1 style={{ fontSize: '1.125rem', fontWeight: 600, letterSpacing: '0.02em', color: 'var(--text-primary)', margin: 0 }}>
          Courier Providers
        </h1>
      </div>

      {/* ─── Provider card ───────────────────────────────────── */}
      <div
        className="card"
        style={{
          marginBottom: 'var(--space-4)',
          padding: 0,
          overflow: 'hidden',
          borderColor: state.provider_enabled ? 'var(--border-light)' : 'var(--border-color)',
          transition: 'border-color 0.2s',
        }}
      >
        {/* Collapsed header — always visible */}
        <div style={{ padding: 'var(--space-5) var(--space-6)' }}>
          <ProviderCardHeader
            state={state}
            expanded={expanded}
            onToggleExpand={() => setExpanded((v) => !v)}
          />
        </div>

        {/* Expanded body */}
        {expanded && (
          <>
            <div style={{ height: '1px', background: 'var(--border-color)' }} />

            <div style={{ padding: 'var(--space-5) var(--space-6) var(--space-6)' }}>

              {/* Enable toggle */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 'var(--space-4)',
                  background: 'var(--bg-input)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  marginBottom: 'var(--space-5)',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Provider active
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {state.provider_enabled ? 'Shipments routed through this courier' : 'Provider disabled — no shipments created'}
                  </div>
                </div>
                <label className="premium-toggle" title="Enable provider">
                  <input
                    type="checkbox"
                    checked={state.provider_enabled}
                    onChange={(e) => setState((s) => ({ ...s, provider_enabled: e.target.checked }))}
                  />
                  <span className="premium-toggle-slider" />
                </label>
              </div>

              {/* Capabilities */}
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-5)' }}>
                <CapPill label="COD" active={state.cod_enabled} />
                <CapPill label="Prepaid" active />
                <CapPill label="Reverse" active={false} />
                <CapPill label="Insurance" active={false} />
              </div>

              {/* ─ Credentials ─ */}
              <SectionHead label="Credentials" />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <Field label="API URL" error={errors.api_url}>
                  <input
                    className={`input-field${errors.api_url ? ' input-error' : ''}`}
                    placeholder={(PROVIDER_META[state.provider_name] ?? PROVIDER_META.delhivery).defaultUrl}
                    value={state.api_url}
                    onChange={(e) => setState((s) => ({ ...s, api_url: e.target.value }))}
                  />
                </Field>

                <Field
                  label="API Key"
                  error={errors.api_key}
                  hint={state.api_key_set ? '(leave blank to keep existing)' : undefined}
                >
                  <div style={{ position: 'relative' }}>
                    <input
                      className={`input-field${errors.api_key ? ' input-error' : ''}`}
                      type="password"
                      placeholder={state.api_key_set ? '••••••••' : 'Enter provider API key'}
                      value={newApiKey}
                      onChange={(e) => setNewApiKey(e.target.value)}
                      autoComplete="new-password"
                      style={{ paddingRight: state.api_key_set ? 80 : undefined }}
                    />
                    {state.api_key_set && (
                      <span
                        style={{
                          position: 'absolute',
                          right: 'var(--space-4)',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          fontSize: '0.625rem',
                          fontWeight: 700,
                          letterSpacing: '0.1em',
                          color: 'var(--success)',
                          pointerEvents: 'none',
                        }}
                      >
                        SET ✓
                      </span>
                    )}
                  </div>
                </Field>
              </div>

              {/* ─ Pickup address ─ */}
              <SectionHead label="Pickup Address" />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div className="input-row">
                  <Field label="Contact name" error={errors.pickup_name}>
                    <input
                      className={`input-field${errors.pickup_name ? ' input-error' : ''}`}
                      placeholder="Warehouse manager"
                      value={state.pickup_name}
                      onChange={(e) => setState((s) => ({ ...s, pickup_name: e.target.value }))}
                    />
                  </Field>
                  <Field label="Contact phone" error={errors.pickup_phone}>
                    <input
                      className={`input-field${errors.pickup_phone ? ' input-error' : ''}`}
                      placeholder="10-digit mobile"
                      value={state.pickup_phone}
                      onChange={(e) => setState((s) => ({ ...s, pickup_phone: e.target.value }))}
                    />
                  </Field>
                </div>

                <Field label="Address line 1" error={errors.pickup_address_line1}>
                  <input
                    className={`input-field${errors.pickup_address_line1 ? ' input-error' : ''}`}
                    placeholder="Street, building, unit"
                    value={state.pickup_address_line1}
                    onChange={(e) => setState((s) => ({ ...s, pickup_address_line1: e.target.value }))}
                  />
                </Field>

                <Field label="Address line 2">
                  <input
                    className="input-field"
                    placeholder="Landmark, area (optional)"
                    value={state.pickup_address_line2}
                    onChange={(e) => setState((s) => ({ ...s, pickup_address_line2: e.target.value }))}
                  />
                </Field>

                <div className="input-row">
                  <Field label="City" error={errors.pickup_city}>
                    <input
                      className={`input-field${errors.pickup_city ? ' input-error' : ''}`}
                      value={state.pickup_city}
                      onChange={(e) => setState((s) => ({ ...s, pickup_city: e.target.value }))}
                    />
                  </Field>
                  <Field label="State" error={errors.pickup_state}>
                    <input
                      className={`input-field${errors.pickup_state ? ' input-error' : ''}`}
                      value={state.pickup_state}
                      onChange={(e) => setState((s) => ({ ...s, pickup_state: e.target.value }))}
                    />
                  </Field>
                </div>

                <Field label="Pincode" error={errors.pickup_pincode}>
                  <input
                    className={`input-field${errors.pickup_pincode ? ' input-error' : ''}`}
                    placeholder="6-digit pincode"
                    value={state.pickup_pincode}
                    onChange={(e) => setState((s) => ({ ...s, pickup_pincode: e.target.value }))}
                  />
                </Field>
              </div>

              {/* ─ COD ─ */}
              <SectionHead label="Cash on Delivery" />

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 'var(--space-4)',
                  background: 'var(--bg-input)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  marginBottom: state.cod_enabled ? 'var(--space-4)' : 0,
                }}
              >
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Enable COD
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {state.cod_enabled ? `Fee ₹${rupeesToPaise(codFeeRs) / 100 || 0} per order` : 'Cash on delivery disabled'}
                  </div>
                </div>
                <label className="premium-toggle" title="Enable COD">
                  <input
                    type="checkbox"
                    checked={state.cod_enabled}
                    onChange={(e) => setState((s) => ({ ...s, cod_enabled: e.target.checked }))}
                  />
                  <span className="premium-toggle-slider" />
                </label>
              </div>

              {state.cod_enabled && (
                <Field label="COD fee (₹)" error={errors.cod_fee_paise}>
                  <input
                    className={`input-field${errors.cod_fee_paise ? ' input-error' : ''}`}
                    type="number"
                    min={0}
                    step={1}
                    placeholder="0"
                    value={codFeeRs}
                    onChange={(e) => setCodFeeRs(e.target.value)}
                  />
                </Field>
              )}

              {/* ─ Save ─ */}
              <div style={{ marginTop: 'var(--space-6)', paddingTop: 'var(--space-5)', borderTop: '1px solid var(--border-color)' }}>
                <button
                  className={`btn btn-primary btn-sm${saving ? ' btn-loading' : ''}`}
                  onClick={handleSave}
                  disabled={saving}
                  style={{ width: 'auto', minWidth: 140 }}
                >
                  SAVE PROVIDER
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ─── Pricing rules ───────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-5) var(--space-6)' }}>
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <p style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
            Pricing Rules
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Field label="Free shipping threshold (₹)" error={errors.free_shipping_threshold_paise} hint="0 disables">
            <input
              className={`input-field${errors.free_shipping_threshold_paise ? ' input-error' : ''}`}
              type="number"
              min={0}
              step={1}
              placeholder="0"
              value={freeThresholdRs}
              onChange={(e) => setFreeThresholdRs(e.target.value)}
            />
          </Field>

          <Field label="Default shipping charge (₹)" error={errors.default_shipping_charge_paise}>
            <input
              className={`input-field${errors.default_shipping_charge_paise ? ' input-error' : ''}`}
              type="number"
              min={0}
              step={1}
              placeholder="0"
              value={shippingChargeRs}
              onChange={(e) => setShippingChargeRs(e.target.value)}
            />
          </Field>
        </div>

        <div style={{ marginTop: 'var(--space-5)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-color)' }}>
          <button
            className={`btn btn-primary btn-sm${saving ? ' btn-loading' : ''}`}
            onClick={handleSave}
            disabled={saving}
            style={{ width: 'auto', minWidth: 140 }}
          >
            SAVE RULES
          </button>
        </div>
      </div>
    </div>
  );
}
