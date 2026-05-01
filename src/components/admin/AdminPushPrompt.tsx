'use client';

import { useEffect, useState } from 'react';

/**
 * Tiny header pill that asks for Notification permission once and
 * registers `/sw-admin.js`. The pill auto-hides when permission is
 * already `granted` or `denied` (browser will not re-prompt on
 * denied, so showing the button would be misleading).
 *
 * Service worker registration is independent of permission state:
 * we register on first mount as long as the API exists. This makes
 * future Web Push delivery possible without the user clicking
 * "Enable" again. Failures are swallowed — admin UX never blocks.
 */
export default function AdminPushPrompt() {
  const [permission, setPermission] = useState<
    NotificationPermission | 'unsupported' | 'pending'
  >('pending');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Register the SW (best-effort, idempotent).
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw-admin.js', { scope: '/admin' })
        .catch(() => { /* swallow — non-fatal */ });
    }

    if (!('Notification' in window)) {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission);
  }, []);

  if (permission !== 'default') return null;

  async function requestPermission() {
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
    } catch {
      setPermission('denied');
    }
  }

  return (
    <button
      type="button"
      onClick={requestPermission}
      title="Enable browser notifications for new orders"
      style={{
        background: 'transparent',
        border: '1px solid rgba(212, 175, 55, 0.45)',
        color: 'var(--gold, #D4AF37)',
        padding: '4px 10px',
        borderRadius: '999px',
        fontSize: '0.7rem',
        fontWeight: 600,
        letterSpacing: '0.08em',
        cursor: 'pointer',
        marginRight: 8,
        whiteSpace: 'nowrap',
      }}
    >
      🔔 ENABLE ALERTS
    </button>
  );
}
