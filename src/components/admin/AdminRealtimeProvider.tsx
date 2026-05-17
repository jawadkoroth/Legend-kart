'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * NOIR Admin — Premium Realtime Alert System
 *
 * Luxury trading-terminal aesthetic with glassmorphism toasts,
 * cinematic animations, and professional sound design.
 *
 * Features:
 *   - Glassmorphism toasts: top-right desktop, top floating mobile
 *   - Premium sound design with mute/unmute toggle
 *   - Smart deduplication and graceful stacking
 *   - Respects reduced motion and mute preferences
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
  createdAt: number;
}

const TOAST_TTL_MS = 8000;
const MAX_TOASTS = 5;

// Audio mute state management
const MUTE_STORAGE_KEY = 'noir_admin_sound_muted';

function getMuteState(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function setMuteState(muted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, muted ? 'true' : 'false');
  } catch {
    /* ignore */
  }
}

function formatPrice(paise: number): string {
  return '₹' + (paise / 100).toLocaleString('en-IN');
}

/**
 * Premium sound synthesiser for NOIR admin alerts.
 * Uses Web Audio API for zero-dependency, bandwidth-free SFX.
 * Respects mute state and autoplay policies.
 */
type SoundType = 'order' | 'shipment' | 'delivered' | 'warning';

function playAlertSound(type: SoundType = 'order'): void {
  if (typeof window === 'undefined') return;
  if (getMuteState()) return;

  try {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.15; // Low volume - subtle and tasteful
    masterGain.connect(ctx.destination);

    const tone = (freq: number, start: number, duration: number, type: OscillatorType = 'sine') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(1, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);
      osc.connect(gain).connect(masterGain);
      osc.start(now + start);
      osc.stop(now + start + duration + 0.1);
    };

    switch (type) {
      case 'order':
        // Elegant cash register: two bell tones
        tone(880, 0, 0.25);      // A5
        tone(1108.73, 0.08, 0.3); // C#6 - sweet third
        break;
      case 'shipment':
        // Dispatch: ascending whoosh feeling
        tone(440, 0, 0.15);
        tone(659.25, 0.05, 0.2);
        tone(880, 0.12, 0.25);
        break;
      case 'delivered':
        // Success: harmonic completion
        tone(523.25, 0, 0.3);    // C5
        tone(659.25, 0.06, 0.3); // E5
        tone(783.99, 0.12, 0.35); // G5
        break;
      case 'warning':
        // Muted caution: lower, brief
        tone(293.66, 0, 0.2);    // D4
        tone(293.66, 0.15, 0.15);
        break;
    }

    setTimeout(() => {
      ctx.close().catch(() => { });
    }, 800);
  } catch {
    /* ignore - audio not critical */
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
    // No `icon`: browsers fall back to the site favicon, and a
    // missing asset at /icon-192.png made some Android Chrome
    // builds drop the notification silently.
    new Notification('💰 New order received', {
      body: `${payload.order_number} • ${formatPrice(payload.total_paise)}`,
      tag: `order-${payload.id}`,
      silent: false,
    });
  } catch {
    /* ignore */
  }
}

export default function AdminRealtimeProvider() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [showMuteIndicator, setShowMuteIndicator] = useState(false);
  const mountedRef = useRef(true);
  const seenIds = useRef<Set<string>>(new Set());
  const toastIdRef = useRef(0);

  // Initialize mute state
  useEffect(() => {
    setIsMuted(getMuteState());
  }, []);

  const handleMuteToggle = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    setMuteState(newMuted);
    setShowMuteIndicator(true);
    setTimeout(() => setShowMuteIndicator(false), 1500);
  }, [isMuted]);

  const handleNewOrder = useCallback((payload: OrderInsertPayload) => {
    // De-dupe: Realtime occasionally redelivers on reconnect
    if (seenIds.current.has(payload.id)) return;
    seenIds.current.add(payload.id);
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
      createdAt: Date.now(),
    };

    // Limit max toasts and add new one at the end (appears at top due to flex-col-reverse in CSS)
    setToasts((prev) => {
      const newToasts = [...prev, entry];
      if (newToasts.length > MAX_TOASTS) {
        return newToasts.slice(newToasts.length - MAX_TOASTS);
      }
      return newToasts;
    });

    setTimeout(() => {
      if (!mountedRef.current) return;
      setToasts((prev) => prev.filter((t) => t.id !== entry.id));
    }, TOAST_TTL_MS);

    playAlertSound('order');
    vibrate();
    showSystemNotification(payload);

    // Let the dashboard refresh its analytics widgets
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
    <>
      {/* Toast Container - Premium Glassmorphism */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="admin-toast-container"
        style={{
          position: 'fixed',
          top: 'calc(60px + env(safe-area-inset-top, 0px))',
          right: 'max(var(--space-4), env(safe-area-inset-right, 0px))',
          left: 'auto',
          display: 'flex',
          flexDirection: 'column-reverse',
          gap: '12px',
          zIndex: 1000,
          pointerEvents: 'none',
          width: 'min(420px, calc(100vw - var(--space-4) * 2))',
          paddingLeft: 'var(--space-4)',
        }}
      >
        {toasts.map((t) => (
          <AdminOrderToast key={t.id} toast={t} />
        ))}
      </div>

      {/* Mute Toggle - Compact corner pill */}
      <button
        onClick={handleMuteToggle}
        className="admin-sound-toggle"
        style={{
          position: 'fixed',
          bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
          right: 'max(var(--space-4), env(safe-area-inset-right, 0px))',
          zIndex: 999,
          background: 'rgba(20,20,20,0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(212,175,55,0.25)',
          borderRadius: '999px',
          padding: '8px 14px',
          fontSize: '0.75rem',
          fontWeight: 500,
          letterSpacing: '0.05em',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          transition: 'all 200ms ease',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}
        title={isMuted ? 'Unmute alerts' : 'Mute alerts'}
      >
        <span>{isMuted ? '🔇' : '🔔'}</span>
        <span>{isMuted ? 'MUTED' : 'SOUND ON'}</span>
      </button>

      {/* Mute Indicator Flash */}
      {showMuteIndicator && (
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(130px + env(safe-area-inset-bottom, 0px))',
            right: '50%',
            transform: 'translateX(50%)',
            zIndex: 1001,
            background: 'rgba(20,20,20,0.9)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(212,175,55,0.3)',
            borderRadius: '8px',
            padding: '10px 16px',
            fontSize: '0.8125rem',
            fontWeight: 500,
            letterSpacing: '0.05em',
            color: 'var(--gold)',
            animation: 'fade-in-out 1.5s ease',
            pointerEvents: 'none',
          }}
        >
          {isMuted ? '🔇 Alerts muted' : '🔔 Sound enabled'}
        </div>
      )}

      <style jsx>{`
        @keyframes fade-in-out {
          0% { opacity: 0; transform: translateX(50%) translateY(10px); }
          15% { opacity: 1; transform: translateX(50%) translateY(0); }
          85% { opacity: 1; transform: translateX(50%) translateY(0); }
          100% { opacity: 0; transform: translateX(50%) translateY(-10px); }
        }
        @media (max-width: 768px) {
          .admin-toast-container {
            left: var(--space-3) !important;
            right: var(--space-3) !important;
            width: auto !important;
            top: 'calc(52px + env(safe-area-inset-top, 0px))' !important;
          }
          .admin-sound-toggle {
            bottom: calc(70px + env(safe-area-inset-bottom, 0px)) !important;
          }
        }
      `}</style>
    </>
  );
}

function AdminOrderToast({ toast }: { toast: ToastEntry }) {
  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Extract first name only for cleaner display
  const firstName = toast.customerName?.split(' ')[0] || 'Guest';
  // Short order ID: last 6 characters
  const shortOrderId = toast.orderNumber.slice(-6);

  return (
    <div
      role="status"
      className="admin-toast"
      style={{
        pointerEvents: 'auto',
        background: 'rgba(16,16,16,0.78)',
        border: '1px solid rgba(212, 175, 55, 0.22)',
        borderLeft: '2px solid var(--gold, #D4AF37)',
        color: 'var(--text, #ECECEC)',
        padding: '16px 18px',
        borderRadius: '14px',
        boxShadow: `
          0 20px 60px rgba(0,0,0,0.55),
          0 0 0 1px rgba(255,255,255,0.03) inset,
          0 0 40px rgba(212,175,55,0.06)
        `,
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        animation: prefersReduced ? undefined : 'toast-slide-in 400ms cubic-bezier(0.16, 1, 0.3, 1), toast-glow-pulse 2s ease-in-out infinite alternate',
        transformOrigin: 'top right',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle gradient overlay for depth */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 50%, rgba(0,0,0,0.1) 100%)',
          pointerEvents: 'none',
          borderRadius: 'inherit',
        }}
      />

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Header: Icon + Label */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 10,
          }}
        >
          <span
            style={{
              fontSize: '1rem',
              filter: 'drop-shadow(0 0 8px rgba(212,175,55,0.4))',
            }}
          >
            💸
          </span>
          <span
            style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              letterSpacing: '0.14em',
              color: 'var(--gold, #D4AF37)',
              textTransform: 'uppercase',
            }}
          >
            New Order
          </span>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: '0.625rem',
              color: 'var(--text-muted, #9A9A9A)',
              fontFamily: 'var(--font-mono, ui-monospace), monospace',
              letterSpacing: '0.05em',
            }}
          >
            #{shortOrderId}
          </span>
        </div>

        {/* Main content: Customer + Amount */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <span
              style={{
                fontSize: '1rem',
                fontWeight: 500,
                color: 'var(--text, #ECECEC)',
                letterSpacing: '-0.01em',
              }}
            >
              {firstName}
            </span>
            <span
              style={{
                fontSize: '0.6875rem',
                color: 'var(--text-muted, #9A9A9A)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {toast.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online Payment'}
            </span>
          </div>

          <span
            style={{
              fontSize: '1.25rem',
              fontWeight: 600,
              color: 'var(--gold, #D4AF37)',
              fontFamily: 'var(--font-mono, ui-monospace), monospace',
              letterSpacing: '-0.02em',
              textShadow: '0 0 20px rgba(212,175,55,0.25)',
            }}
          >
            {formatPrice(toast.totalPaise)}
          </span>
        </div>
      </div>

      {/* Premium animation keyframes */}
      <style jsx>{`
        @keyframes toast-slide-in {
          0% {
            opacity: 0;
            transform: translateY(-20px) scale(0.96);
          }
          40% {
            opacity: 1;
            transform: translateY(4px) scale(1.01);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes toast-glow-pulse {
          0% {
            box-shadow: 
              0 20px 60px rgba(0,0,0,0.55),
              0 0 0 1px rgba(255,255,255,0.03) inset,
              0 0 40px rgba(212,175,55,0.04);
          }
          100% {
            box-shadow: 
              0 20px 60px rgba(0,0,0,0.55),
              0 0 0 1px rgba(255,255,255,0.03) inset,
              0 0 60px rgba(212,175,55,0.08);
          }
        }
      `}</style>
    </div>
  );
}
