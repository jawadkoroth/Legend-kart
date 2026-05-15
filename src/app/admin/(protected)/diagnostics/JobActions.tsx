'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import styles from './diagnostics.module.css';

/**
 * Minimal action cell for a row in the jobs table.
 *
 * Two operations, both POST endpoints under /api/admin/jobs/[id]/...:
 *
 *   - retry   : reset to status='queued', clear last_error, run_at=now.
 *               Allowed for 'failed' OR 'dead' rows.
 *   - discard : force terminal 'dead' for failed rows that we never
 *               want auto-retried again.
 *
 * After either succeeds we call `router.refresh()` so the server
 * component above re-renders with fresh counts and rows. No client
 * state mirroring of the table — keeps the source of truth in one
 * place (the database).
 */
export function JobActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<null | 'retry' | 'discard'>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: 'retry' | 'discard') {
    setError(null);
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/jobs/${id}/${action}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg =
          (body && typeof body.error === 'string' && body.error) ||
          `Request failed (${res.status})`;
        setError(msg);
        return;
      }
      // Re-render the server component with fresh data.
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(null);
    }
  }

  const disabled = busy !== null || pending;

  return (
    <div className={styles.actionCell}>
      <div className={styles.actionBtns}>
        <button
          onClick={() => run('retry')}
          disabled={disabled}
          className={styles.retryBtn}
          title="Re-queue for immediate execution"
        >
          {busy === 'retry' ? 'Retrying…' : 'Retry'}
        </button>
        {status !== 'dead' && (
          <button
            onClick={() => {
              if (
                window.confirm(
                  'Discard this job? It will be marked dead and not retried.',
                )
              ) {
                run('discard');
              }
            }}
            disabled={disabled}
            className={styles.discardBtn}
            title="Force terminal 'dead' status"
          >
            {busy === 'discard' ? 'Discarding…' : 'Discard'}
          </button>
        )}
      </div>
      {error && <span className={styles.actionError}>{error}</span>}
    </div>
  );
}
