'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from './page.module.css';

interface Profile {
  name: string;
  email: string;
  phone: string;
}

/**
 * Profile editor card body for the dashboard's Profile section.
 *
 * The avatar / name / email header and the sign-out action live in
 * the sidebar `ProfileCard` now — this component is intentionally
 * trimmed to ONLY the editable form so it can slot into the new
 * dashboard's section body without doubling up on those affordances.
 * Save / validate / phone-uniqueness logic is unchanged.
 */
export default function ProfileClient({
  initialProfile,
  userId,
}: {
  initialProfile: Profile;
  userId: string;
}) {
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialProfile.name);
  const [phone, setPhone] = useState(initialProfile.phone.replace('+91', ''));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  // Track the toast clear-timer so we can cancel it on unmount and on
  // re-scheduling, preventing the React 'state update on unmounted
  // component' warning if the user navigates away within 3s.
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage('');
    if (phone.length !== 10) {
      setMessage('Enter a valid 10-digit number');
      setSaving(false);
      return;
    }

    const supabase = createClient();
    const formattedPhone = `+91${phone}`;

    if (formattedPhone !== profile.phone) {
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
        id: userId,
        name: name.trim(),
        email: profile.email,
        phone: formattedPhone,
      });

    if (error) {
      setMessage('Failed to save');
    } else {
      setProfile(prev => ({ ...prev, name: name.trim(), phone: formattedPhone }));
      setEditing(false);
      setMessage('Profile updated');
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      toastTimerRef.current = setTimeout(() => {
        setMessage('');
        toastTimerRef.current = null;
      }, 3000);
    }
    setSaving(false);
  }

  return (
    <div>
      {message && (
        <div
          className={styles.toast}
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
      )}

      <div>
        {editing ? (
          <>
            <div className="input-group" style={{ marginBottom: 'var(--space-3)' }}>
              <label className="input-label">Name</label>
              <input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
            </div>
            <div className="input-group" style={{ marginBottom: 'var(--space-3)' }}>
              <label className="input-label">Email</label>
              <input className="input-field" value={profile.email} disabled style={{ opacity: 0.5 }} />
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
              <button
                type="button"
                className={`btn btn-primary ${saving ? 'btn-loading' : ''}`}
                onClick={handleSave}
                disabled={saving}
                style={{ flex: 1 }}
              >
                SAVE
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setEditing(false);
                  setName(profile.name);
                  setPhone(profile.phone.replace('+91', ''));
                }}
                style={{ flex: 1 }}
              >
                CANCEL
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Name</span>
              <span>{profile.name || '—'}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Email</span>
              <span>{profile.email || '—'}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Phone</span>
              <span>{profile.phone || '—'}</span>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setEditing(true)}
              style={{ marginTop: 'var(--space-4)' }}
            >
              EDIT PROFILE
            </button>
          </>
        )}
      </div>
    </div>
  );
}
