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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/auth');
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('name, email, phone')
        .eq('id', user.id)
        .single();

      if (data) {
        setProfile(data);
        setName(data.name);
        setPhone(data.phone || '');
      } else {
        // Profile doesn't exist yet — create with user email
        setProfile({ name: '', email: user.email || '', phone: null });
        setName('');
        setEditing(true);
      }
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleSave() {
    setSaving(true);
    setMessage('');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        name: name.trim(),
        email: profile?.email || user.email || '',
        phone: phone.trim() || null,
      });

    if (error) {
      setMessage('Failed to save');
    } else {
      setProfile(prev => prev ? { ...prev, name: name.trim(), phone: phone.trim() || null } : prev);
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

  if (loading) {
    return (
      <div className={styles.page}>
        <div className="animate-pulse text-muted" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>Loading...</div>
      </div>
    );
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
                <label className="input-label">Phone</label>
                <input
                  className="input-field"
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10-digit phone"
                  inputMode="numeric"
                  maxLength={10}
                />
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <button className={`btn btn-primary ${saving ? 'btn-loading' : ''}`} onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
                  SAVE
                </button>
                <button className="btn btn-secondary" onClick={() => { setEditing(false); setName(profile?.name || ''); setPhone(profile?.phone || ''); }} style={{ flex: 1 }}>
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
