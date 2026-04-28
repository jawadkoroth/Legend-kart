'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Coupon {
  id: string;
  code: string;
  discount_percent: number;
  is_active: boolean;
  created_at: string;
}

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState('');
  const [percent, setPercent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchCoupons(); }, []);

  async function fetchCoupons() {
    const supabase = createClient();
    const { data } = await supabase
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false });
    setCoupons(data || []);
    setLoading(false);
  }

  async function handleCreate() {
    if (!code.trim() || !percent) return;
    setSaving(true);
    const supabase = createClient();
    await supabase.from('coupons').insert({
      code: code.toUpperCase().trim(),
      discount_percent: parseInt(percent),
    });
    setCode('');
    setPercent('');
    setShowForm(false);
    setSaving(false);
    fetchCoupons();
  }

  async function toggleActive(id: string, isActive: boolean) {
    const supabase = createClient();
    await supabase.from('coupons').update({ is_active: !isActive }).eq('id', id);
    fetchCoupons();
  }

  if (loading) return <div className="animate-pulse text-muted" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Coupons</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
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
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              style={{ textTransform: 'uppercase' }}
            />
          </div>
          <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label className="input-label">Discount %</label>
            <input
              className="input-field"
              type="number"
              placeholder="10"
              min="1"
              max="100"
              value={percent}
              onChange={e => setPercent(e.target.value)}
            />
          </div>
          <button
            className={`btn btn-primary ${saving ? 'btn-loading' : ''}`}
            onClick={handleCreate}
            disabled={saving || !code.trim() || !percent}
          >
            CREATE COUPON
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {coupons.map(coupon => (
          <div key={coupon.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '1rem' }}>{coupon.code}</span>
              <span className="text-sm text-muted" style={{ marginLeft: 'var(--space-3)' }}>{coupon.discount_percent}% off</span>
            </div>
            <button
              className={`btn btn-sm ${coupon.is_active ? 'btn-success' : 'btn-secondary'}`}
              onClick={() => toggleActive(coupon.id, coupon.is_active)}
            >
              {coupon.is_active ? 'Active' : 'Off'}
            </button>
          </div>
        ))}

        {coupons.length === 0 && (
          <p className="text-muted" style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>No coupons yet</p>
        )}
      </div>
    </div>
  );
}
