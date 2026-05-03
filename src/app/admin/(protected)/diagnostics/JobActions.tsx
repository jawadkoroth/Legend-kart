'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => run('retry')}
          disabled={disabled}
          style={btnStyle('primary', disabled)}
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
            style={btnStyle('danger', disabled)}
            title="Force terminal 'dead' status"
          >
            {busy === 'discard' ? 'Discarding…' : 'Discard'}
          </button>
        )}
      </div>
      {error && (
        <span
          style={{
            color: 'var(--error, #b91c1c)',
            fontSize: '0.7rem',
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}

function btnStyle(
  variant: 'primary' | 'danger',
  disabled: boolean,
): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '4px 10px',
    fontSize: '0.75rem',
    fontWeight: 600,
    borderRadius: 'var(--radius)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
  if (variant === 'danger') {
    return {
      ...base,
      border: '1px solid var(--error, #b91c1c)',
      background: 'transparent',
      color: 'var(--error, #b91c1c)',
    };
  }
  return {
    ...base,
    border: '1px solid var(--text)',
    background: 'var(--text)',
    color: 'var(--bg)',
  };
}
