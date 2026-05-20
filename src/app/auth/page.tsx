'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './page.module.css';

/**
 * NOIR Auth — Passwordless sign-in
 *
 * Flow:
 *   1. User chooses Google or Email.
 *   2. Email path: sends a magic link via Supabase (signInWithOtp + emailRedirectTo).
 *      UI switches to a clean "check your inbox" confirmation screen.
 *      No OTP input — the email contains a clickable link only.
 *   3. Clicking the email link hits /auth/callback which exchanges the
 *      code for a session server-side, then redirects to ?next or /profile.
 *
 * No OTP entry screen. No fake 6-digit code UI.
 */

type Step = 'enter' | 'sent';

function AuthInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');
  const rawNext = searchParams.get('next') || '/profile';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/profile';

  const [step, setStep] = useState<Step>('enter');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(errorParam ?? '');

  async function handleSendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');

    const supabase = createClient();
    // Build the callback URL so the link lands on our handler, not Supabase's default.
    const callbackUrl = new URL('/auth/callback', window.location.origin);
    callbackUrl.searchParams.set('next', next);

    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: callbackUrl.toString(),
      },
    });

    if (authError) {
      setError(authError.message);
    } else {
      setStep('sent');
    }
    setLoading(false);
  }

  async function handleGoogleLogin() {
    setLoading(true);
    setError('');
    const supabase = createClient();
    const callbackUrl = new URL('/auth/callback', window.location.origin);
    callbackUrl.searchParams.set('next', next);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl.toString() },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      {/* Ambient gradient glow */}
      <div className={styles.glow} aria-hidden />

      <div className={styles.card}>
        {/* Brand mark */}
        <div className={styles.brand}>
          <span className={styles.brandName}>NOIR</span>
          <span className={styles.brandDot} />
        </div>

        {step === 'enter' && (
          <>
            <h1 className={styles.title}>Welcome back.</h1>
            <p className={styles.subtitle}>
              Sign in or create your account — no password required.
            </p>

            {error && (
              <div className={styles.errorBanner} role="alert">
                {error}
              </div>
            )}

            <div className={styles.stack}>
              {/* Google */}
              <button
                className={styles.googleBtn}
                onClick={handleGoogleLogin}
                disabled={loading}
                type="button"
              >
                <GoogleIcon />
                <span>Continue with Google</span>
              </button>

              {/* Divider */}
              <div className={styles.divider}>
                <div className={styles.dividerLine} />
                <span className={styles.dividerText}>or continue with email</span>
                <div className={styles.dividerLine} />
              </div>

              {/* Email */}
              <form onSubmit={handleSendMagicLink} className={styles.emailForm}>
                <div className={styles.inputWrap}>
                  <input
                    className={styles.emailInput}
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    disabled={loading}
                  />
                </div>
                <button
                  className={styles.primaryBtn}
                  disabled={loading || !email.trim()}
                  type="submit"
                >
                  {loading ? (
                    <span className={styles.spinner} />
                  ) : (
                    'Send Secure Link'
                  )}
                </button>
              </form>
            </div>

            <p className={styles.legalNote}>
              By continuing, you agree to our{' '}
              <a href="/legal/terms" className={styles.legalLink}>Terms</a>
              {' '}and{' '}
              <a href="/legal/privacy" className={styles.legalLink}>Privacy Policy</a>.
            </p>
          </>
        )}

        {step === 'sent' && (
          <div className={styles.sentScreen}>
            <div className={styles.sentIcon}>✉️</div>
            <h2 className={styles.sentTitle}>Check your inbox</h2>
            <p className={styles.sentBody}>
              We sent a secure sign-in link to
              <br />
              <strong className={styles.sentEmail}>{email}</strong>
            </p>
            <p className={styles.sentHint}>
              Click the link in the email to sign in instantly.
              The link expires in 60 minutes.
            </p>
            <button
              className={styles.resendBtn}
              onClick={() => setStep('enter')}
              type="button"
            >
              ← Use a different email
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.15v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.15C1.43 8.55 1 10.22 1 12s.43 3.45 1.15 4.93l3.69-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.15 7.07l3.69 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100dvh', background: '#0B0B0B' }} />}>
      <AuthInner />
    </Suspense>
  );
}
