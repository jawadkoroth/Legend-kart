'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Suspense } from 'react';

function ProfileCompleteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/profile';
  
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function checkAuth() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!mounted) return;

      if (!user) {
        router.replace('/auth');
        return;
      }
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone, name')
        .eq('id', user.id)
        .single();
        
      if (profile?.phone) {
        // Already completed
        router.replace(next);
        return;
      }
      
      if (profile?.name) setName(profile.name);
      
      setLoading(false);
    }
    checkAuth();
  }, [router, next]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (phone.length !== 10) {
      setError('Please enter a valid 10-digit number');
      return;
    }
    setSaving(true);
    setError('');

    const supabase = createClient();
    const formattedPhone = `+91${phone}`;

    // App-level dedup check
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone', formattedPhone)
      .maybeSingle();

    if (existing) {
      setError('This mobile number is already registered to another account.');
      setSaving(false);
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert({
        id: session.user.id,
        name: name.trim() || 'User',
        email: session.user.email || '',
        phone: formattedPhone
      });

    if (upsertError) {
      setError(upsertError.message);
      setSaving(false);
    } else {
      router.replace(next);
    }
  }

  if (loading) {
    return <div style={{ height: '100dvh', width: '100%', backgroundColor: '#0B0B0B' }} />;
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-5)' }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: 'var(--space-2)' }}>Complete Profile</h1>
        <p className="text-muted text-sm" style={{ marginBottom: 'var(--space-6)' }}>
          Please add your mobile number to continue. This serves as your primary identity.
        </p>
        
        {error && <div className="warning-banner" style={{ marginBottom: 'var(--space-4)' }}>⚠ {error}</div>}
        
        <form onSubmit={handleSave}>
          <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label className="input-label">Name</label>
            <input 
              className="input-field" 
              placeholder="Your Name" 
              value={name} 
              onChange={e => setName(e.target.value)} 
            />
          </div>
          <div className="input-group" style={{ marginBottom: 'var(--space-6)' }}>
            <label className="input-label">Mobile Number *</label>
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ padding: '0 var(--space-3)', color: 'var(--text-muted)', borderRight: '1px solid var(--border-color)' }}>+91</span>
              <input 
                className="input-field" 
                style={{ border: 'none' }}
                placeholder="9876543210" 
                value={phone} 
                onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} 
                inputMode="numeric" 
                maxLength={10}
                required
              />
            </div>
          </div>
          
          <button className={`btn btn-primary ${saving ? 'btn-loading' : ''}`} type="submit" disabled={saving || phone.length !== 10}>
            CONTINUE
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ProfileCompletePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="animate-pulse text-muted">Loading...</div>
      </div>
    }>
      <ProfileCompleteContent />
    </Suspense>
  );
}
