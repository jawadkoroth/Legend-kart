'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Admin coupon management.
 *
 * Adds segmentation controls on top of the original simple
 * code+percent CRUD:
 *   - new_users_only       restricts coupon to first-time buyers
 *   - show_on_homepage     renders a homepage banner for this code
 *   - homepage_text        free headline (defaulted server-side)
 *   - homepage_accent      premium colour slot (royal-blue / cobalt
 *                          / gold / emerald)
 *
 * RLS already restricts writes to admin_users — the protected
 * layout has verified that before this client ever mounts. We
 * therefore call Supabase directly from the browser via the
 * cookie-bound client; no extra admin-API endpoint required.
 */

const ACCENTS: { id: string; label: string; swatch: string }[] = [
  { id: 'royal-blue', label: 'Royal Blue', swatch: '#1F3A8A' },
  { id: 'cobalt', label: 'Cobalt', swatch: '#2540A8' },
  { id: 'gold', label: 'Deep Gold', swatch: '#A88532' },
  { id: 'emerald', label: 'Emerald', swatch: '#0F4F3F' },
];

interface Coupon {
  id: string;
  code: string;
  discount_percent: number;
  is_active: boolean;
  new_users_only: boolean;
  show_on_homepage: boolean;
  homepage_text: string | null;
  homepage_accent: string | null;
  created_at: string;
}

interface DraftState {
  code: string;
  percent: string;
  newUsersOnly: boolean;
  showOnHomepage: boolean;
  homepageText: string;
  homepageAccent: string;
}

const EMPTY_DRAFT: DraftState = {
  code: '',
  percent: '',
  newUsersOnly: false,
  showOnHomepage: false,
  homepageText: '',
  homepageAccent: 'gold',
};

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCoupons();
  }, []);

  async function fetchCoupons() {
    const supabase = createClient();
    const { data } = await supabase
      .from('coupons')
      .select(
        'id, code, discount_percent, is_active, new_users_only, show_on_homepage, homepage_text, homepage_accent, created_at',
      )
      .order('created_at', { ascending: false });
    setCoupons((data as Coupon[]) ?? []);
    setLoading(false);
  }

  function resetDraft() {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setError('');
  }

  function startEdit(c: Coupon) {
    setEditingId(c.id);
    setDraft({
      code: c.code,
      percent: String(c.discount_percent),
      newUsersOnly: c.new_users_only,
      showOnHomepage: c.show_on_homepage,
      homepageText: c.homepage_text ?? '',
      homepageAccent: c.homepage_accent ?? 'gold',
    });
    setShowForm(true);
    setError('');
  }

  async function handleSave() {
    const code = draft.code.toUpperCase().trim();
    const percent = parseInt(draft.percent, 10);
    if (!code) return setError('Coupon code is required');
    if (Number.isNaN(percent) || percent < 1 || percent > 100) {
      return setError('Discount must be between 1 and 100');
    }

    setSaving(true);
    setError('');
    const supabase = createClient();
    const payload = {
      code,
      discount_percent: percent,
      new_users_only: draft.newUsersOnly,
      show_on_homepage: draft.showOnHomepage,
      homepage_text: draft.homepageText.trim() || null,
      homepage_accent: draft.showOnHomepage ? draft.homepageAccent : null,
    };

    const result = editingId
      ? await supabase.from('coupons').update(payload).eq('id', editingId)
      : await supabase.from('coupons').insert(payload);

    if (result.error) {
      setError(result.error.message || 'Failed to save coupon');
      setSaving(false);
      return;
    }

    setShowForm(false);
    resetDraft();
    setSaving(false);
    fetchCoupons();
  }

  async function toggleActive(id: string, isActive: boolean) {
    const supabase = createClient();
    await supabase.from('coupons').update({ is_active: !isActive }).eq('id', id);
    fetchCoupons();
  }

  if (loading) {
    return (
      <div className="animate-pulse text-muted" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
        Loading...
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Coupons</h1>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            if (showForm) {
              setShowForm(false);
              resetDraft();
            } else {
              resetDraft();
              setShowForm(true);
            }
          }}
        >
          {showForm ? 'Cancel' : '+ New'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
          <div className="input-group" style={{ marginBottom: 'var(--space-3)' }}>
            <label className="input-label">Code</label>
            <input
              className="input-field"
              placeholder="e.g. WELCOME10"
              value={draft.code}
              onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
              style={{ textTransform: 'uppercase' }}
              disabled={!!editingId}
            />
          </div>

          <div className="input-group" style={{ marginBottom: 'var(--space-3)' }}>
            <label className="input-label">Discount %</label>
            <input
              className="input-field"
              type="number"
              placeholder="10"
              min="1"
              max="100"
              value={draft.percent}
              onChange={(e) => setDraft({ ...draft, percent: e.target.value })}
            />
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: 'var(--space-3) 0',
              borderTop: '1px solid var(--border-color)',
              marginTop: 'var(--space-2)',
            }}
          >
            <input
              type="checkbox"
              checked={draft.newUsersOnly}
              onChange={(e) => setDraft({ ...draft, newUsersOnly: e.target.checked })}
            />
            <div>
              <div style={{ fontWeight: 500 }}>First order only</div>
              <div className="text-xs text-muted">Reject this code if the user already has any non-cancelled order.</div>
            </div>
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: 'var(--space-3) 0',
              borderTop: '1px solid var(--border-color)',
            }}
          >
            <input
              type="checkbox"
              checked={draft.showOnHomepage}
              onChange={(e) => setDraft({ ...draft, showOnHomepage: e.target.checked })}
            />
            <div>
              <div style={{ fontWeight: 500 }}>Show banner on homepage</div>
              <div className="text-xs text-muted">Renders a single strip below the navbar. The most recently updated active row wins.</div>
            </div>
          </label>

          {draft.showOnHomepage && (
            <>
              <div className="input-group" style={{ marginBottom: 'var(--space-3)' }}>
                <label className="input-label">Banner Text (optional)</label>
                <input
                  className="input-field"
                  placeholder="e.g. Use code WELCOME10 for 10% off your first order"
                  value={draft.homepageText}
                  onChange={(e) => setDraft({ ...draft, homepageText: e.target.value })}
                  maxLength={120}
                />
              </div>

              <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                <label className="input-label">Accent</label>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {ACCENTS.map((a) => {
                    const active = draft.homepageAccent === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setDraft({ ...draft, homepageAccent: a.id })}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 10px',
                          border: '1px solid',
                          borderColor: active ? 'var(--text-primary)' : 'var(--border-color)',
                          background: active ? 'var(--bg-tertiary)' : 'transparent',
                          color: 'var(--text-primary)',
                          borderRadius: 999,
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: a.swatch,
                          }}
                        />
                        {a.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {error && (
            <p className="input-error-text" style={{ marginBottom: 'var(--space-3)' }}>
              {error}
            </p>
          )}

          <button
            className={`btn btn-primary ${saving ? 'btn-loading' : ''}`}
            onClick={handleSave}
            disabled={saving || !draft.code.trim() || !draft.percent}
          >
            {editingId ? 'SAVE CHANGES' : 'CREATE COUPON'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {coupons.map((coupon) => (
          <div
            key={coupon.id}
            className="card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '1rem' }}>{coupon.code}</span>
                <span className="text-sm text-muted" style={{ marginLeft: 'var(--space-3)' }}>
                  {coupon.discount_percent}% off
                </span>
              </div>
              <button
                className={`btn btn-sm ${coupon.is_active ? 'btn-success' : 'btn-secondary'}`}
                onClick={() => toggleActive(coupon.id, coupon.is_active)}
              >
                {coupon.is_active ? 'Active' : 'Off'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {coupon.new_users_only && (
                <span className="badge badge-confirmed">First-order only</span>
              )}
              {coupon.show_on_homepage && (
                <span className="badge badge-paid">On homepage</span>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => startEdit(coupon)}
                className="btn btn-ghost btn-sm"
                style={{ width: 'auto' }}
              >
                Edit
              </button>
            </div>
          </div>
        ))}

        {coupons.length === 0 && (
          <p className="text-muted" style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
            No coupons yet
          </p>
        )}
      </div>
    </div>
  );
}
