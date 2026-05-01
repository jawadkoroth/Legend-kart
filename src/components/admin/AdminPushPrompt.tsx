'use client';

import { useEffect, useState } from 'react';

/**
 * Header pill that:
 *
 *   1. Registers `/sw-admin.js` (idempotent).
 *   2. Requests Notification permission on click.
 *   3. After permission is granted, fetches the public VAPID key
 *      and calls `pushManager.subscribe()`, then POSTs the
 *      subscription to `/api/admin/push/subscribe` so the server
 *      can fan out true background notifications via web-push.
 *
 * The pill auto-hides once subscribed, denied, or unsupported.
 * If push is not configured server-side (no VAPID env vars),
 * /api/admin/push/vapid returns 404 and we fall back to the
 * Notification API alone — which still works while any admin tab
 * is open. No user-visible failure.
 */

type State =
  | 'pending'
  | 'unsupported'
  | 'default'
  | 'subscribing'
  | 'subscribed'
  | 'denied';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register('/sw-admin.js', { scope: '/admin' });
  } catch (err) {
    console.error('[PUSH_SW_REGISTER]', err);
    return null;
  }
}

async function alreadySubscribed(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/admin');
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

export default function AdminPushPrompt() {
  const [state, setState] = useState<State>('pending');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }

    // Best-effort SW register; failure is non-fatal.
    ensureServiceWorker();

    (async () => {
      const perm = Notification.permission;
      if (perm === 'denied') return setState('denied');
      if (perm === 'default') return setState('default');
      // perm === 'granted' — check whether we already have a sub.
      const sub = await alreadySubscribed();
      setState(sub ? 'subscribed' : 'default');
    })();
  }, []);

  async function subscribe() {
    setState('subscribing');
    try {
      let perm = Notification.permission;
      if (perm === 'default') {
        perm = await Notification.requestPermission();
      }
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'default');
        return;
      }

      const reg = await ensureServiceWorker();
      if (!reg) {
        // SW unavailable — Notification API still works while tab
        // is open. Treat as subscribed so we stop nagging.
        setState('subscribed');
        return;
      }

      // Fetch VAPID public key. 404 = push not configured; we
      // gracefully fall back to in-tab Notifications.
      let publicKey: string | null = null;
      try {
        const vapidRes = await fetch('/api/admin/push/vapid', { cache: 'no-store' });
        if (vapidRes.ok) {
          const json = await vapidRes.json();
          publicKey = (json as { publicKey?: string }).publicKey ?? null;
        }
      } catch (err) {
        console.error('[PUSH_VAPID_FETCH]', err);
      }

      if (!publicKey) {
        // No web-push backend → realtime + Notification path only.
        setState('subscribed');
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as any,
      });

      // Persist on the server. The browser representation has
      // `getKey()` accessors that return ArrayBuffers; we extract
      // them as base64url strings the way web-push expects.
      const json = sub.toJSON() as PushSubscriptionJSON;
      const endpoint = json.endpoint;
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (!endpoint || !p256dh || !auth) {
        setState('subscribed');
        return;
      }

      await fetch('/api/admin/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint,
          keys: { p256dh, auth },
        }),
      });

      setState('subscribed');
    } catch (err) {
      console.error('[PUSH_SUBSCRIBE_FLOW]', err);
      // Permission may have been granted but subscribe failed
      // (browser quirk, network). Notifications via the in-tab
      // path still work; treat as subscribed to stop prompting.
      setState('subscribed');
    }
  }

  if (state === 'subscribed' || state === 'unsupported' || state === 'denied' || state === 'pending') {
    return null;
  }

  const busy = state === 'subscribing';

  return (
    <button
      type="button"
      onClick={busy ? undefined : subscribe}
      disabled={busy}
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
        cursor: busy ? 'progress' : 'pointer',
        marginRight: 8,
        whiteSpace: 'nowrap',
        opacity: busy ? 0.7 : 1,
      }}
    >
      {busy ? '🔔 ENABLING…' : '🔔 ENABLE ALERTS'}
    </button>
  );
}
