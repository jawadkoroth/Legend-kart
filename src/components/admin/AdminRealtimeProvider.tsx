'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * NOIR Admin — realtime order alerts.
 *
 * Mounted ONCE inside `AdminShell` so every protected admin page
 * gets the same singleton subscription. Responsibilities:
 *
 *   1. Subscribe to INSERT events on `public.orders` via Supabase
 *      Realtime. RLS already restricts SELECT to admins, so the
 *      stream is implicitly admin-scoped.
 *   2. On each new order:
 *        a. Render a premium toast (top-right, dark, gold accent).
 *        b. Play a short cha-ching SFX synthesised on the fly.
 *        c. Vibrate where supported (mobile).
 *        d. Surface a system Notification when permission granted.
 *        e. Dispatch a `window` CustomEvent (`admin:order-created`)
 *           so the dashboard can refetch its analytics without a
 *           full page reload.
 *
 * Cleanup: on unmount we removeChannel and abort any in-flight
 * subscription. A `mountedRef` guards against state updates after
 * unmount (common in React 19 / dev StrictMode double-mount).
 *
 * IMPORTANT: this provider does NOT render `children` — it is a
 * sibling that only owns toasts. Keeps the tree minimal and avoids
 * re-rendering the entire admin shell on toast updates.
 */

export const ADMIN_ORDER_CREATED_EVENT = 'admin:order-created';

interface OrderInsertPayload {
  id: string;
  order_number: string;
  total_paise: number;
  payment_method?: string;
  customer?: { name?: string };
}

interface ToastEntry {
  id: number;
  orderNumber: string;
  totalPaise: number;
  paymentMethod: string;
  customerName: string;
}

const TOAST_TTL_MS = 6000;

function formatPrice(paise: number): string {
  return '₹' + (paise / 100).toLocaleString('en-IN');
}

/**
 * Synthesise a brief "cha-ching" using Web Audio. No binary asset
 * required → zero bandwidth cost and respects the project's
 * minimal-asset philosophy. Two short tones with a quick decay
 * envelope — subtle, not cartoonish.
 *
 * Best-effort: any failure (no AudioContext, autoplay block) is
 * swallowed so it never disrupts the alert.
 */
function playOrderSound(): void {
  if (typeof window === 'undefined') return;
  try {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    const tone = (freq: number, start: number, duration: number, peak: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(peak, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + duration + 0.05);
    };

    // "ka-ching": high E5 then C6 with a soft decay.
    tone(659.25, 0, 0.18, 0.18);
    tone(1046.5, 0.09, 0.32, 0.16);

    // Auto-close the AudioContext after the sound finishes to free
    // hardware. Some browsers throttle long-lived contexts.
    setTimeout(() => {
      ctx.close().catch(() => { });
    }, 600);
  } catch {
    /* ignore */
  }
}

function vibrate(): void {
  if (typeof navigator === 'undefined') return;
  // Pattern: short + pause + short. Spec says "subtle".
  if (typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate([60, 40, 80]);
    } catch {
      /* ignore */
    }
  }
}

function showSystemNotification(payload: OrderInsertPayload): void {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification('💰 New order received', {
      body: `${payload.order_number} • ${formatPrice(payload.total_paise)}`,
      tag: `order-${payload.id}`,
      icon: '/icon-192.png',
      silent: false,
    });
  } catch {
    /* ignore */
  }
}

export default function AdminRealtimeProvider() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const mountedRef = useRef(true);
  const seenIds = useRef<Set<string>>(new Set());
  const toastIdRef = useRef(0);

  const handleNewOrder = useCallback((payload: OrderInsertPayload) => {
    // De-dupe: Realtime occasionally redelivers on reconnect; we
    // already saw this id, drop it.
    if (seenIds.current.has(payload.id)) return;
    seenIds.current.add(payload.id);
    // Cap memory: keep only the last 200 ids.
    if (seenIds.current.size > 200) {
      const first = seenIds.current.values().next().value;
      if (first) seenIds.current.delete(first);
    }

    if (!mountedRef.current) return;

    const entry: ToastEntry = {
      id: ++toastIdRef.current,
      orderNumber: payload.order_number,
      totalPaise: payload.total_paise,
      paymentMethod: payload.payment_method ?? 'online',
      customerName: payload.customer?.name ?? '',
    };
    setToasts((prev) => [...prev, entry]);
    setTimeout(() => {
      if (!mountedRef.current) return;
      setToasts((prev) => prev.filter((t) => t.id !== entry.id));
    }, TOAST_TTL_MS);

    playOrderSound();
    vibrate();
    showSystemNotification(payload);

    // Let the dashboard refresh its analytics widgets.
    try {
      window.dispatchEvent(
        new CustomEvent(ADMIN_ORDER_CREATED_EVENT, { detail: payload }),
      );
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const supabase = createClient();

    // Channel name is unique per tab; Supabase de-dupes server-side.
    const channel = supabase
      .channel('admin-orders-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (msg) => {
          const row = msg.new as Partial<OrderInsertPayload> | undefined;
          if (!row?.id || !row.order_number || typeof row.total_paise !== 'number') {
            return;
          }
          handleNewOrder({
            id: row.id,
            order_number: row.order_number,
            total_paise: row.total_paise,
            payment_method: row.payment_method,
            customer: row.customer,
          });
        },
      )
      .subscribe();

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(channel).catch(() => { });
    };
  }, [handleNewOrder]);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'fixed',
        top: 'calc(var(--space-4) + env(safe-area-inset-top, 0px))',
        right: 'var(--space-4)',
        left: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        zIndex: 1000,
        pointerEvents: 'none',
        maxWidth: '420px',
        marginLeft: 'auto',
      }}
    >
      {toasts.map((t) => (
        <AdminOrderToast key={t.id} toast={t} />
      ))}
    </div>
  );
}

function AdminOrderToast({ toast }: { toast: ToastEntry }) {
  // Honour reduced-motion users by skipping the slide-in transform.
  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div
      role="status"
      style={{
        pointerEvents: 'auto',
        background:
          'linear-gradient(135deg, rgba(20,20,20,0.96), rgba(28,28,28,0.96))',
        border: '1px solid rgba(212, 175, 55, 0.35)',
        borderLeft: '3px solid var(--gold, #D4AF37)',
        color: 'var(--text, #ECECEC)',
        padding: '14px 16px',
        borderRadius: '12px',
        boxShadow:
          '0 10px 30px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04) inset',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: prefersReduced ? undefined : 'noir-toast-in 220ms ease-out',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.8125rem',
          fontWeight: 600,
          letterSpacing: '0.02em',
          color: 'var(--gold, #D4AF37)',
          marginBottom: 4,
        }}
      >
        <span aria-hidden>💰</span>
        <span>NEW ORDER RECEIVED</span>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 12,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono, ui-monospace), monospace',
            fontSize: '0.95rem',
            fontWeight: 600,
          }}
        >
          {toast.orderNumber}
        </span>
        <span style={{ fontSize: '1rem', fontWeight: 700 }}>
          {formatPrice(toast.totalPaise)}
        </span>
      </div>
      {(toast.customerName || toast.paymentMethod) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: 'var(--text-muted, #9A9A9A)',
            marginTop: 4,
          }}
        >
          <span>{toast.customerName || '—'}</span>
          <span style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {toast.paymentMethod === 'cod' ? 'COD' : 'Online'}
          </span>
        </div>
      )}

      <style jsx>{`
        @keyframes noir-toast-in {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
