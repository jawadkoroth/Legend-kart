'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './page.module.css';

interface Profile {
  name: string;
  email: string;
  phone: string | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();

    const init = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (!mounted) return;

      if (!authUser) {
        router.replace('/auth');
        return;
      }

      setUser(authUser);

      const { data } = await supabase
        .from('profiles')
        .select('name, email, phone')
        .eq('id', authUser.id)
        .single();

      if (!data || !data.phone) {
        router.replace('/profile/complete');
        return;
      }

      setProfile(data);
      setName(data.name);
      setPhone(data.phone.replace('+91', ''));
      setLoading(false);
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (mounted && event === 'SIGNED_OUT') {
        router.replace('/auth');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  async function handleSave() {
    setSaving(true);
    setMessage('');
    if (phone.length !== 10) {
      setMessage('Enter a valid 10-digit number');
      setSaving(false);
      return;
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const formattedPhone = `+91${phone}`;

    // App-level dedup check
    if (formattedPhone !== profile?.phone) {
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', formattedPhone)
        .maybeSingle();

      if (existing) {
        setMessage('Mobile number is already registered.');
        setSaving(false);
        return;
      }
    }

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        name: name.trim(),
        email: profile?.email || user.email || '',
        phone: formattedPhone,
      });

    if (error) {
      setMessage('Failed to save');
    } else {
      setProfile(prev => prev ? { ...prev, name: name.trim(), phone: formattedPhone } : prev);
      setEditing(false);
      setMessage('Profile updated');
      setTimeout(() => setMessage(''), 3000);
    }
    setSaving(false);
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/');
  }

  // 🚨 CRITICAL: block render until auth resolved
  if (loading) {
    return <div style={{ height: '100dvh', width: '100%', backgroundColor: '#0B0B0B' }} />;
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <div className={styles.avatar}>
          {(profile?.name || 'U').charAt(0).toUpperCase()}
        </div>

        <h1 className={styles.title}>{profile?.name || 'Your Profile'}</h1>
        <p className={styles.email}>{profile?.email}</p>

        {message && (
          <div className={styles.toast}>{message}</div>
        )}

        <div className={styles.card}>
          {editing ? (
            <>
              <div className="input-group" style={{ marginBottom: 'var(--space-3)' }}>
                <label className="input-label">Name</label>
                <input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
              </div>
              <div className="input-group" style={{ marginBottom: 'var(--space-3)' }}>
                <label className="input-label">Email</label>
                <input className="input-field" value={profile?.email || ''} disabled style={{ opacity: 0.5 }} />
              </div>
              <div className="input-group" style={{ marginBottom: 'var(--space-5)' }}>
                <label className="input-label">Mobile Number *</label>
                <p className="text-xs text-muted" style={{ marginBottom: 'var(--space-2)' }}>⚠ This is your primary account identity.</p>
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                  <span style={{ padding: '0 var(--space-3)', color: 'var(--text-muted)', borderRight: '1px solid var(--border-color)' }}>+91</span>
                  <input
                    className="input-field"
                    style={{ border: 'none' }}
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="10-digit phone"
                    inputMode="numeric"
                    maxLength={10}
                    required
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <button className={`btn btn-primary ${saving ? 'btn-loading' : ''}`} onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
                  SAVE
                </button>
                <button className="btn btn-secondary" onClick={() => { setEditing(false); setName(profile?.name || ''); setPhone(profile?.phone?.replace('+91', '') || ''); }} style={{ flex: 1 }}>
                  CANCEL
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Name</span>
                <span>{profile?.name || '—'}</span>
              </div>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Email</span>
                <span>{profile?.email || '—'}</span>
              </div>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Phone</span>
                <span>{profile?.phone || '—'}</span>
              </div>
              <button className="btn btn-secondary" onClick={() => setEditing(true)} style={{ marginTop: 'var(--space-4)' }}>
                EDIT PROFILE
              </button>
            </>
          )}
        </div>

        <button className={styles.logoutBtn} onClick={handleLogout}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
