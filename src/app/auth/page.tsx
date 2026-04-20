'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './page.module.css';

type Step = 'input' | 'otp' | 'signup';

export default function AuthPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('input');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });

    if (authError) {
      setError(authError.message);
    } else {
      setMessage(`OTP sent to ${email}`);
      setStep('otp');
    }
    setLoading(false);
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!otp.trim()) return;
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: 'email',
    });

    if (verifyError) {
      setError(verifyError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      // Check if profile exists
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .single();

      if (!profile) {
        // New user — show signup step
        setStep('signup');
        setLoading(false);
        return;
      }

      router.push('/profile');
    }
    setLoading(false);
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setError('Session expired. Please try again.');
      setStep('input');
      setLoading(false);
      return;
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
      });

    if (profileError) {
      setError(profileError.message);
    } else {
      router.push('/profile');
    }
    setLoading(false);
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>
          {step === 'signup' ? 'Complete Profile' : 'Sign In'}
        </h1>
        <p className={styles.subtitle}>
          {step === 'input' && 'Enter your email to continue'}
          {step === 'otp' && message}
          {step === 'signup' && 'Tell us a bit about yourself'}
        </p>

        {error && (
          <div className={styles.errorBanner}>{error}</div>
        )}

        {step === 'input' && (
          <form onSubmit={handleSendOtp}>
            <div className="input-group" style={{ marginBottom: 'var(--space-5)' }}>
              <input
                className="input-field"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <button className={`btn btn-primary ${loading ? 'btn-loading' : ''}`} disabled={loading} type="submit">
              SEND OTP
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp}>
            <div className="input-group" style={{ marginBottom: 'var(--space-3)' }}>
              <input
                className="input-field"
                placeholder="Enter 6-digit OTP"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                maxLength={6}
                autoFocus
              />
            </div>
            <p className={styles.resend}>
              Didn&apos;t receive it?{' '}
              <button type="button" className={styles.resendBtn} onClick={handleSendOtp} disabled={loading}>
                Resend
              </button>
            </p>
            <button className={`btn btn-primary ${loading ? 'btn-loading' : ''}`} disabled={loading} type="submit">
              VERIFY OTP
            </button>
          </form>
        )}

        {step === 'signup' && (
          <form onSubmit={handleSignup}>
            <div className="input-group" style={{ marginBottom: 'var(--space-3)' }}>
              <input
                className="input-field"
                placeholder="Your Name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="input-group" style={{ marginBottom: 'var(--space-5)' }}>
              <input
                className="input-field"
                placeholder="Phone (optional)"
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                inputMode="numeric"
                maxLength={10}
              />
            </div>
            <button className={`btn btn-primary ${loading ? 'btn-loading' : ''}`} disabled={loading} type="submit">
              COMPLETE PROFILE
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
