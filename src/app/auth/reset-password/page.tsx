'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './page.module.css';

/**
 * In-app password reset landing.
 *
 * Flow:
 *  1. User clicks the link in the reset email → lands here with
 *     `?code=…` (PKCE) or via the legacy hash flow.
 *  2. We exchange the code for a recovery session (or rely on an
 *     already-active PASSWORD_RECOVERY auth event).
 *  3. User enters + confirms a new password → updateUser({ password }).
 *  4. Success → redirect to /profile.
 *
 * Edge cases:
 *  - No / expired code → "Invalid or expired link" with a link back
 *    to /auth.
 *  - Update failure → inline error, retry stays available.
 */

type Phase = 'verifying' | 'ready' | 'invalid' | 'success';

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [phase, setPhase] = useState<Phase>('verifying');
  const [serverError, setServerError] = useState<string | null>(null);

  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ pwd?: string; confirm?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  // Guard so we don't double-redirect.
  const redirectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const code = searchParams.get('code');
      const errorDescription =
        searchParams.get('error_description') || searchParams.get('error');

      if (errorDescription) {
        if (!cancelled) setPhase('invalid');
        return;
      }

      // PKCE-style link: ?code=… needs to be exchanged once.
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (error) {
          setPhase('invalid');
          return;
        }
        setPhase('ready');
        return;
      }

      // Legacy / hash flow: Supabase fires PASSWORD_RECOVERY once it
      // detects the URL fragment. Wait briefly; if no event arrives
      // and there is no active session, treat as invalid.
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) {
        setPhase('ready');
        return;
      }

      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
          if (!cancelled) setPhase('ready');
        }
      });

      // Bail out after a short window if nothing happens.
      const t = setTimeout(() => {
        if (!cancelled) setPhase((p) => (p === 'verifying' ? 'invalid' : p));
      }, 1500);

      return () => {
        sub.subscription.unsubscribe();
        clearTimeout(t);
      };
    }

    const cleanupPromise = init();
    return () => {
      cancelled = true;
      Promise.resolve(cleanupPromise).then((fn) => {
        if (typeof fn === 'function') fn();
      });
    };
    // searchParams is stable across renders within the same URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function validate(): boolean {
    const e: { pwd?: string; confirm?: string } = {};
    if (pwd.length < 8) e.pwd = 'Use at least 8 characters.';
    else if (!/[A-Za-z]/.test(pwd) || !/\d/.test(pwd))
      e.pwd = 'Include both letters and numbers.';
    if (confirm !== pwd) e.confirm = 'Passwords do not match.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (submitting) return;
    setServerError(null);
    if (!validate()) return;

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setSubmitting(false);
    if (error) {
      setServerError(error.message || 'Could not update password.');
      return;
    }
    setPhase('success');
    if (!redirectedRef.current) {
      redirectedRef.current = true;
      setTimeout(() => {
        router.replace('/profile');
        router.refresh();
      }, 900);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {phase === 'verifying' && (
          <>
            <h1 className={styles.title}>Reset password</h1>
            <p className={styles.subtitle}>Verifying your link…</p>
            <div className={styles.spinner} aria-live="polite">
              Please wait
            </div>
          </>
        )}

        {phase === 'invalid' && (
          <>
            <h1 className={styles.title}>Link expired</h1>
            <p className={styles.subtitle}>
              This reset link is invalid or has expired. Request a new one
              from your account settings.
            </p>
            <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
              The reset link could not be verified.
            </div>
            <p className={styles.linkRow}>
              <Link href="/auth" className={styles.link}>
                Back to sign in
              </Link>
            </p>
          </>
        )}

        {phase === 'ready' && (
          <>
            <h1 className={styles.title}>Set a new password</h1>
            <p className={styles.subtitle}>
              Choose a strong password. You&apos;ll be signed in automatically.
            </p>

            {serverError && (
              <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
                {serverError}
              </div>
            )}

            <form className={styles.form} onSubmit={handleSubmit} noValidate>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="reset-pwd">
                  New password
                </label>
                <input
                  id="reset-pwd"
                  type="password"
                  className={`${styles.input} ${errors.pwd ? styles.inputError : ''}`}
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  autoComplete="new-password"
                  aria-invalid={errors.pwd ? 'true' : undefined}
                  required
                />
                {errors.pwd ? (
                  <span className={styles.fieldError}>{errors.pwd}</span>
                ) : (
                  <span className={styles.hint}>At least 8 chars, with letters and numbers.</span>
                )}
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="reset-confirm">
                  Confirm new password
                </label>
                <input
                  id="reset-confirm"
                  type="password"
                  className={`${styles.input} ${errors.confirm ? styles.inputError : ''}`}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  aria-invalid={errors.confirm ? 'true' : undefined}
                  required
                />
                {errors.confirm && (
                  <span className={styles.fieldError}>{errors.confirm}</span>
                )}
              </div>

              <button
                type="submit"
                className={styles.submit}
                disabled={submitting}
              >
                {submitting ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </>
        )}

        {phase === 'success' && (
          <>
            <h1 className={styles.title}>Password updated</h1>
            <p className={styles.subtitle}>
              You&apos;re all set. Redirecting to your account…
            </p>
            <div className={`${styles.banner} ${styles.bannerSuccess}`} role="status">
              Your password has been updated successfully.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className={styles.page} />}>
      <ResetPasswordInner />
    </Suspense>
  );
}
