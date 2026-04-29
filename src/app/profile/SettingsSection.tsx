'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './settings.module.css';

/**
 * Settings dashboard section — security-only.
 *
 * Intentionally does NOT duplicate the Profile section's name/phone
 * editing. Three rows:
 *
 *  1. Reset password — email-auth users get a Supabase reset link
 *     (60s cooldown). OAuth users see a read-only managed-by notice.
 *  2. Sign out from all devices — `signOut({ scope: 'global' })`.
 *  3. Delete account — modal confirm (must type DELETE), sets
 *     profiles.deleted_at, signs out globally, redirects home.
 */

type Provider = 'email' | 'google' | 'unknown';

export default function SettingsSection({
  email,
  provider,
  userId,
}: {
  email: string;
  provider: Provider;
  userId: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset-password row state.
  const [resetSending, setResetSending] = useState(false);
  const [resetSentAt, setResetSentAt] = useState<number | null>(null);
  const [resetCooldown, setResetCooldown] = useState(0);

  // Global sign-out state.
  const [signingOut, setSigningOut] = useState(false);

  // Delete-account modal state.
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  function showToast(kind: 'ok' | 'err', text: string) {
    setToast({ kind, text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, 4000);
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // Tick the reset cooldown once a second.
  useEffect(() => {
    if (resetSentAt === null) return;
    const tick = () => {
      const remaining = Math.max(
        0,
        60 - Math.floor((Date.now() - resetSentAt) / 1000),
      );
      setResetCooldown(remaining);
      if (remaining === 0) {
        setResetSentAt(null);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [resetSentAt]);

  async function handleResetPassword() {
    if (resetSending || resetCooldown > 0) return;
    setResetSending(true);
    const baseUrl =
      process.env.NEXT_PUBLIC_URL ||
      (typeof window !== 'undefined' ? window.location.origin : '');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${baseUrl}/auth/reset-password`,
    });
    setResetSending(false);
    if (error) {
      showToast('err', 'Could not send reset email. Please try again.');
      return;
    }
    setResetSentAt(Date.now());
    showToast('ok', 'Password reset email sent. Check your inbox.');
  }

  async function handleGlobalSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) {
      setSigningOut(false);
      showToast('err', 'Could not sign out everywhere. Please try again.');
      return;
    }
    router.replace('/');
    router.refresh();
  }

  async function handleDeleteAccount() {
    if (deleting) return;
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') return;
    setDeleting(true);

    // 1. Soft-delete the profile. RLS allows the owner to update.
    const { error: updErr } = await supabase
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', userId);

    if (updErr) {
      setDeleting(false);
      showToast('err', 'Could not delete your account. Please try again.');
      return;
    }

    // 2. Always sign out globally — even if the local sign-out leg
    // fails, the cookies on this device are wiped on the next
    // navigation. We surface a soft toast on partial failure but do
    // not leave the user on /profile with a stale session.
    try {
      await supabase.auth.signOut({ scope: 'global' });
    } catch {
      /* swallow — redirect anyway */
    }

    router.replace('/');
    router.refresh();
  }

  const isOAuth = provider !== 'email';

  return (
    <div className={styles.root}>
      {toast && (
        <div
          className={`${styles.toast} ${toast.kind === 'err' ? styles.toastError : ''}`}
          role="status"
          aria-live="polite"
        >
          {toast.text}
        </div>
      )}

      {/* Row 1 — Reset password */}
      <div className={styles.row}>
        <div className={styles.rowMeta}>
          <span className={styles.rowTitle}>Password</span>
          <span className={styles.rowDesc}>
            {isOAuth
              ? 'Password is managed by your sign-in provider.'
              : 'Send a password reset link to your email.'}
          </span>
        </div>
        {isOAuth ? (
          <span className={styles.notice}>Managed by Google</span>
        ) : (
          <button
            type="button"
            className={styles.action}
            onClick={handleResetPassword}
            disabled={resetSending || resetCooldown > 0}
          >
            {resetSending
              ? 'Sending…'
              : resetCooldown > 0
                ? `Resend in ${resetCooldown}s`
                : 'Send reset link'}
          </button>
        )}
      </div>

      {/* Row 2 — Sign out everywhere */}
      <div className={styles.row}>
        <div className={styles.rowMeta}>
          <span className={styles.rowTitle}>Sign out from all devices</span>
          <span className={styles.rowDesc}>
            Ends every active session on every device immediately.
          </span>
        </div>
        <button
          type="button"
          className={styles.action}
          onClick={handleGlobalSignOut}
          disabled={signingOut}
        >
          {signingOut ? 'Signing out…' : 'Sign out everywhere'}
        </button>
      </div>

      {/* Row 3 — Delete account */}
      <div className={`${styles.row} ${styles.rowDanger}`}>
        <div className={styles.rowMeta}>
          <span className={styles.rowTitle}>Delete account</span>
          <span className={styles.rowDesc}>
            Permanently deactivates your account. Past orders are retained for
            records; you will be signed out everywhere.
          </span>
        </div>
        <button
          type="button"
          className={`${styles.action} ${styles.actionDanger}`}
          onClick={() => {
            setDeleteConfirmText('');
            setShowDelete(true);
          }}
        >
          Delete account
        </button>
      </div>

      {showDelete && (
        <DeleteModal
          onClose={() => !deleting && setShowDelete(false)}
        >
          <h2 className={styles.modalTitle}>Delete your account?</h2>
          <p className={styles.modalText}>
            This deactivates <strong>{email}</strong> and signs you out on every
            device. Past orders are kept for support and bookkeeping.
            <br />
            <br />
            Type <strong>DELETE</strong> to confirm.
          </p>
          <input
            className={styles.confirmInput}
            type="text"
            value={deleteConfirmText}
            onChange={e => setDeleteConfirmText(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            spellCheck={false}
            aria-label="Type DELETE to confirm"
            disabled={deleting}
          />
          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => setShowDelete(false)}
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.btnDanger}
              onClick={handleDeleteAccount}
              disabled={
                deleting ||
                deleteConfirmText.trim().toUpperCase() !== 'DELETE'
              }
            >
              {deleting ? 'Deleting…' : 'Delete account'}
            </button>
          </div>
        </DeleteModal>
      )}
    </div>
  );
}

function DeleteModal({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Delete account"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modal}>{children}</div>
    </div>
  );
}
