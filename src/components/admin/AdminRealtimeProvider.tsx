'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { App } from '@capacitor/app';

/**
 * PANTHER Admin — Premium Realtime Alert System v3
 *
 * Visibility-aware notification routing:
 *   - App foreground/visible  → in-app glassmorphism toast (top-center mobile, top-right desktop)
 *   - App background/hidden   → enhanced push via SW postMessage / Native FCM
 *
 * Toast features:
 *   - Top-center on mobile (slide-down)
 *   - Top-right on desktop
 *   - Custom glassmorphic styles based on category:
 *       - order    → green luxury, cash register sound, amount + name
 *       - return   → amber luxury, descend sound
 *       - exchange → blue luxury, ping sound
 *       - delivery → emerald luxury, success sound
 *       - note     → gold/grey luxury, silent
 *   - Stacks safely, auto-dismiss 6s
 */

export const ADMIN_ORDER_CREATED_EVENT = 'admin:order-created';

type ToastCategory = 'order' | 'return' | 'exchange' | 'delivery' | 'note';

interface ToastEntry {
  id: number;
  category: ToastCategory;
  orderId: string;
  orderNumber?: string;
  title: string;
  body: string;
  createdAt: number;
  totalPaise?: number;
  paymentMethod?: string;
  customerName?: string;
}

const TOAST_TTL_MS = 6000;
const MAX_TOASTS = 5;
const MUTE_STORAGE_KEY = 'panther_admin_sound_muted';

function getMuteState(): boolean {
  if (typeof window === 'undefined') return false;
  try { return localStorage.getItem(MUTE_STORAGE_KEY) === 'true'; } catch { return false; }
}

function setMuteState(muted: boolean): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(MUTE_STORAGE_KEY, muted ? 'true' : 'false'); } catch { /* ignore */ }
}

function formatPrice(paise: number): string {
  return '₹' + (paise / 100).toLocaleString('en-IN');
}

function isAppVisible(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible';
}

/**
 * Premium synthesised SFX — zero deps, bandwidth-free.
 */
type SoundType = 'order' | 'return' | 'cancel' | 'exchange' | 'delivery';

function playAlertSound(type: SoundType = 'order'): void {
  if (typeof window === 'undefined' || getMuteState()) return;
  try {
    const Ctx =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.14;
    master.connect(ctx.destination);

    const tone = (freq: number, start: number, dur: number, shape: OscillatorType = 'sine') => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = shape;
      osc.frequency.setValueAtTime(freq, now + start);
      g.gain.setValueAtTime(0, now + start);
      g.gain.linearRampToValueAtTime(1, now + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      osc.connect(g).connect(master);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.05);
    };

    if (type === 'order') {
      tone(880, 0, 0.25);         // A5
      tone(1108.73, 0.09, 0.3);   // C#6
      tone(1318.51, 0.18, 0.25);  // E6
    } else if (type === 'return') {
      tone(659.25, 0, 0.2);       // E5
      tone(523.25, 0.12, 0.25);   // C5
    } else if (type === 'cancel') {
      tone(293.66, 0, 0.18, 'triangle');
      tone(261.63, 0.14, 0.2, 'triangle');
    } else if (type === 'exchange') {
      tone(1174.66, 0, 0.18);     // D6 ping
    } else if (type === 'delivery') {
      tone(523.25, 0, 0.15);       // C5 success ascending
      tone(659.25, 0.08, 0.15);    // E5
      tone(783.99, 0.16, 0.3);     // G5
    }

    setTimeout(() => { ctx.close().catch(() => { }); }, 900);
  } catch { /* ignore */ }
}

function vibrate(pattern: number[] = [60, 40, 80]): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
  }
}

/**
 * Route order notification to SW when app is backgrounded.
 */
function notifyViaServiceWorker(payload: any): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then((reg) => {
    reg.active?.postMessage({
      type: 'SHOW_ORDER_NOTIFICATION',
      payload: {
        title: '💰 New order — PANTHER',
        body: `${payload.customer?.name?.split(' ')[0] || 'Guest'} · ${formatPrice(payload.total_paise)}`,
        orderId: payload.id,
        orderNumber: payload.order_number,
        amount: formatPrice(payload.total_paise),
        paymentMethod: payload.payment_method ?? 'online',
        url: `/admin/orders/${payload.id}`,
      },
    });
  }).catch(() => { });
}

export default function AdminRealtimeProvider() {
  const router = useRouter();
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [showMuteIndicator, setShowMuteIndicator] = useState(false);
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);
  const mountedRef = useRef(true);
  const seenIds = useRef<Set<string>>(new Set());
  const toastIdRef = useRef(0);

  useEffect(() => { setIsMuted(getMuteState()); }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleMuteToggle = useCallback(() => {
    const next = !isMuted;
    setIsMuted(next);
    setMuteState(next);
    setShowMuteIndicator(true);
    setTimeout(() => setShowMuteIndicator(false), 1600);
  }, [isMuted]);

  // Common wrapper to append toasts
  const addToast = useCallback((entry: Omit<ToastEntry, 'id' | 'createdAt'>) => {
    if (seenIds.current.has(entry.orderId + '_' + entry.category)) return;
    seenIds.current.add(entry.orderId + '_' + entry.category);
    if (seenIds.current.size > 200) {
      const first = seenIds.current.values().next().value;
      if (first) seenIds.current.delete(first);
    }
    if (!mountedRef.current) return;

    const fullEntry: ToastEntry = {
      ...entry,
      id: ++toastIdRef.current,
      createdAt: Date.now(),
    };

    setToasts((prev) => {
      const next = [...prev, fullEntry];
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
    });

    setTimeout(() => {
      if (mountedRef.current) setToasts((prev) => prev.filter((t) => t.id !== fullEntry.id));
    }, TOAST_TTL_MS);
  }, []);

  // 1. Order Toast
  const handleNewOrder = useCallback((payload: any) => {
    if (isAppVisible()) {
      addToast({
        category: 'order',
        orderId: payload.id,
        orderNumber: payload.order_number,
        title: 'New Order',
        body: payload.customer?.name || 'Guest',
        totalPaise: payload.total_paise,
        paymentMethod: payload.payment_method,
        customerName: payload.customer?.name,
      });
      playAlertSound('order');
      vibrate();
    } else {
      notifyViaServiceWorker(payload);
    }

    try {
      window.dispatchEvent(new CustomEvent(ADMIN_ORDER_CREATED_EVENT, { detail: payload }));
    } catch { /* ignore */ }
  }, [addToast]);

  // 2. Return/Exchange Toast
  const handleReturnExchange = useCallback((payload: any) => {
    addToast({
      category: payload.type === 'exchange' ? 'exchange' : 'return',
      orderId: payload.orderId,
      orderNumber: payload.orderNumber,
      title: payload.type === 'exchange' ? 'Exchange Request' : 'Return Request',
      body: `${payload.customerName} requested a ${payload.type}. Reason: ${payload.reason}`,
      customerName: payload.customerName,
    });
    playAlertSound(payload.type === 'exchange' ? 'exchange' : 'return');
    vibrate([40, 40, 40]);
  }, [addToast]);

  // 3. Delivery Toast
  const handleShipmentDelivered = useCallback((payload: any) => {
    addToast({
      category: 'delivery',
      orderId: payload.orderId,
      orderNumber: payload.orderNumber,
      title: 'Shipment Delivered',
      body: `Order #${payload.orderNumber?.slice(-6) || ''} delivered to ${payload.customerName}`,
      customerName: payload.customerName,
    });
    playAlertSound('delivery');
    vibrate([80, 40, 80]);
  }, [addToast]);

  // 4. Admin Note Toast
  const handleAdminNote = useCallback((payload: any) => {
    addToast({
      category: 'note',
      orderId: payload.orderId,
      orderNumber: payload.orderNumber,
      title: 'Admin Note',
      body: `${payload.adminEmail}: ${payload.content}`,
    });
    // Silent notification - no sound played
    vibrate([20]);
  }, [addToast]);

  // Supabase Realtime Setup
  useEffect(() => {
    mountedRef.current = true;
    const supabase = createClient();

    const channel = supabase
      .channel('admin-realtime-broadcast')
      // A. Listen for new orders
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (msg) => {
          const row = msg.new as any;
          if (!row?.id || !row.order_number || typeof row.total_paise !== 'number') return;
          handleNewOrder({
            id: row.id,
            order_number: row.order_number,
            total_paise: row.total_paise,
            payment_method: row.payment_method,
            customer: row.customer,
          });
        },
      )
      // B. Listen for return/exchange requests
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'return_requests' },
        async (msg) => {
          const row = msg.new as any;
          if (!row?.id || !row.order_id || !row.type) return;

          try {
            const { data: order } = await supabase
              .from('orders')
              .select('order_number, customer')
              .eq('id', row.order_id)
              .single();

            handleReturnExchange({
              id: row.id,
              orderId: row.order_id,
              orderNumber: order?.order_number || '',
              customerName: order?.customer?.name || 'Guest',
              type: row.type,
              reason: row.reason,
            });
          } catch (e) {
            console.error('Failed to process realtime return request:', e);
          }
        },
      )
      // C. Listen for shipment status updates
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shipment_status_history' },
        async (msg) => {
          const row = msg.new as any;
          if (!row?.id || !row.shipment_id || row.next_status !== 'delivered') return;

          try {
            const { data: shipment } = await supabase
              .from('shipments')
              .select('order_id, orders(order_number, customer)')
              .eq('id', row.shipment_id)
              .single();

            if (shipment && shipment.order_id) {
              const ordersData = shipment.orders as any;
              handleShipmentDelivered({
                id: row.id,
                orderId: shipment.order_id,
                orderNumber: ordersData?.order_number || '',
                customerName: ordersData?.customer?.name || 'Guest',
              });
            }
          } catch (e) {
            console.error('Failed to process realtime shipment update:', e);
          }
        },
      )
      // D. Listen for new admin notes
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_notes' },
        async (msg) => {
          const row = msg.new as any;
          if (!row?.id || !row.order_id || !row.content) return;

          try {
            const { data: order } = await supabase
              .from('orders')
              .select('order_number')
              .eq('id', row.order_id)
              .single();

            handleAdminNote({
              id: row.id,
              orderId: row.order_id,
              orderNumber: order?.order_number || '',
              adminEmail: row.admin_email || 'System',
              content: row.content,
            });
          } catch (e) {
            console.error('Failed to process realtime admin note:', e);
          }
        },
      )
      .subscribe();

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(channel).catch(() => { });
    };
  }, [handleNewOrder, handleReturnExchange, handleShipmentDelivered, handleAdminNote]);

  // Capacitor Native Integrations (Push Notifications & Deep Linking)
  useEffect(() => {
    if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return;

    const setupCapacitor = async () => {
      try {
        // 1. Configure Notification Channels
        await PushNotifications.createChannel({
          id: 'new_orders',
          name: 'New Orders',
          description: 'Notifications for new orders with cash register sound',
          sound: 'cash_register',
          importance: 5,
          visibility: 1,
          vibration: true,
        });

        await PushNotifications.createChannel({
          id: 'return_requests',
          name: 'Return Requests',
          description: 'Notifications for return requests with amber alerts',
          importance: 4,
          visibility: 1,
          vibration: true,
        });

        await PushNotifications.createChannel({
          id: 'exchange_requests',
          name: 'Exchange Requests',
          description: 'Notifications for exchange requests with blue alerts',
          importance: 4,
          visibility: 1,
          vibration: true,
        });

        await PushNotifications.createChannel({
          id: 'shipments',
          name: 'Shipments',
          description: 'Success notifications for delivered shipments',
          importance: 4,
          visibility: 1,
          vibration: true,
        });

        await PushNotifications.createChannel({
          id: 'admin_notes',
          name: 'Admin Notes',
          description: 'Silent push notifications for internal admin notes',
          importance: 2,
          visibility: 1,
          vibration: false,
        });

        // 2. Request permission and register
        const checkResult = await PushNotifications.checkPermissions();
        console.log(`[PUSH_PERMISSION_CHECK] Current state: ${checkResult.receive}`);
        
        if (checkResult.receive === 'granted') {
          console.log('[PUSH_PERMISSION_GRANTED] Push permissions already granted.');
          await PushNotifications.register();
          setShowPermissionBanner(false);
        } else {
          const promptShown = localStorage.getItem('notification_prompt_shown');
          if (!promptShown) {
            console.log('[PUSH_PERMISSION_PROMPT] Prompting user for push permission...');
            const permResult = await PushNotifications.requestPermissions();
            localStorage.setItem('notification_prompt_shown', 'true');
            if (permResult.receive === 'granted') {
              console.log('[PUSH_PERMISSION_GRANTED] Push permissions granted by user.');
              await PushNotifications.register();
              setShowPermissionBanner(false);
            } else {
              console.log('[PUSH_PERMISSION_DENIED] Push permissions denied by user.');
              setShowPermissionBanner(true);
            }
          } else {
            console.log('[PUSH_PERMISSION_DENIED] Push permissions previously denied.');
            setShowPermissionBanner(true);
          }
        }

        // 3. Register native FCM token to admin profile
        PushNotifications.addListener('registration', async (token) => {
          const fcmToken = token.value;
          console.log(`[FCM_TOKEN_REGISTERED] Generated FCM token: ${fcmToken}`);
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            console.log(`[FCM_TOKEN_REGISTERED] Registering FCM token to Supabase for admin ${user.email}`);
            await supabase.from('admin_fcm_tokens').upsert({
              user_id: user.id,
              token: fcmToken,
              device_name: 'Android App Client',
              last_used_at: new Date().toISOString(),
            }, { onConflict: 'token' });
          }
        });

        PushNotifications.addListener('registrationError', (error) => {
          console.error(`[FCM_TOKEN_FAILED] FCM registration failed:`, error);
        });

        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('[ANDROID_PUSH_RECEIVED] Foreground push received:', notification);
        });

        // 4. Handle clicks on background notifications for deep-linking
        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          console.log('[ANDROID_NOTIFICATION_CLICK] Tapped background push notification:', action);
          const data = action.notification.data;
          if (data?.orderId) {
            router.push(`/admin/orders/${data.orderId}`);
          }
        });

        // 5. App Url Open Deep Linking
        App.addListener('appUrlOpen', (event) => {
          try {
            const parsedUrl = new URL(event.url);
            const path = parsedUrl.pathname + parsedUrl.search;
            router.push(path);
          } catch (e) {
            // Fallback: parse path manually
            const path = event.url.split('://')[1] || '';
            if (path) {
              router.push('/' + path);
            }
          }
        });
      } catch (err) {
        console.error('Capacitor setup failed:', err);
      }
    };

    setupCapacitor();
  }, [router]);

  return (
    <>
      {showPermissionBanner && (
        <div style={{
          position: 'fixed',
          top: 'env(safe-area-inset-top, 0px)',
          left: 0,
          right: 0,
          zIndex: 10000,
          padding: '16px 20px',
          background: 'rgba(20, 20, 20, 0.95)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          color: '#FFF',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          boxShadow: '0 4px 30px rgba(0,0,0,0.5)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.5rem' }}>🔔</span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Enable Push Notifications</span>
              <span style={{ fontSize: '0.75rem', color: '#AAA' }}>Enable notifications to receive new orders.</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowPermissionBanner(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#AAA',
                fontSize: '0.75rem',
                padding: '6px 12px',
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
            <button
              onClick={async () => {
                if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return;
                try {
                  const { NativeSettings, AndroidSettings } = await import('capacitor-native-settings');
                  await NativeSettings.open({
                    optionAndroid: AndroidSettings.ApplicationDetails,
                    optionIOS: 'App',
                  });
                } catch (err) {
                  console.error('Failed to open app settings details:', err);
                }
              }}
              style={{
                background: 'var(--primary, #C9A86A)',
                border: 'none',
                color: '#000',
                fontWeight: 600,
                fontSize: '0.75rem',
                borderRadius: '6px',
                padding: '6px 14px',
                cursor: 'pointer',
              }}
            >
              Open Android Settings
            </button>
          </div>
        </div>
      )}

      {/* ── Toast Container ── */}
      <div
        aria-live="polite"
        aria-atomic="false"
        style={{
          position: 'fixed',
          top: 'calc(60px + env(safe-area-inset-top, 0px) + 8px)',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          zIndex: 9999,
          pointerEvents: 'none',
          width: 'min(400px, calc(100vw - 32px))',
        }}
        className="panther-toast-container"
      >
        {[...toasts].reverse().map((t) => (
          <AdminNotificationToast key={t.id} toast={t} onDismiss={dismissToast} />
        ))}
      </div>

      {/* ── Mute toggle pill ── */}
      <button
        onClick={handleMuteToggle}
        style={{
          position: 'fixed',
          bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
          right: 'max(16px, env(safe-area-inset-right, 0px))',
          zIndex: 999,
          background: 'rgba(18,18,18,0.88)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          border: '1px solid rgba(212,175,55,0.22)',
          borderRadius: '999px',
          padding: '7px 14px',
          fontSize: '0.7rem',
          fontWeight: 600,
          letterSpacing: '0.07em',
          color: isMuted ? 'var(--text-muted, #8A8A8A)' : 'rgba(212,175,55,0.8)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          transition: 'all 200ms ease',
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
        }}
        title={isMuted ? 'Unmute alerts' : 'Mute alerts'}
      >
        <span style={{ fontSize: '0.85rem' }}>{isMuted ? '🔇' : '🔔'}</span>
        <span>{isMuted ? 'MUTED' : 'SOUND ON'}</span>
      </button>

      {/* ── Mute flash indicator ── */}
      {showMuteIndicator && (
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(136px + env(safe-area-inset-bottom, 0px))',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10000,
            background: 'rgba(18,18,18,0.92)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(212,175,55,0.25)',
            borderRadius: '8px',
            padding: '9px 16px',
            fontSize: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.06em',
            color: 'var(--gold, #D4AF37)',
            pointerEvents: 'none',
            animation: 'panther-fade-inout 1.6s ease forwards',
            whiteSpace: 'nowrap',
          }}
        >
          {isMuted ? '🔇  Alerts muted' : '🔔  Sound enabled'}
        </div>
      )}

      <style jsx global>{`
        @keyframes panther-fade-inout {
          0%   { opacity: 0; transform: translateX(-50%) translateY(6px); }
          12%  { opacity: 1; transform: translateX(-50%) translateY(0); }
          80%  { opacity: 1; transform: translateX(-50%) translateY(0); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-6px); }
        }
        @keyframes panther-toast-slide-down {
          0%   { opacity: 0; transform: translateY(-18px) scale(0.97); }
          45%  { opacity: 1; transform: translateY(3px) scale(1.005); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes panther-toast-glow {
          0%   { box-shadow: 0 20px 50px rgba(0,0,0,0.55), 0 0 30px rgba(255,255,255,0.01); }
          100% { box-shadow: 0 20px 50px rgba(0,0,0,0.55), 0 0 50px rgba(255,255,255,0.04); }
        }
        @media (min-width: 640px) {
          .panther-toast-container {
            left: auto !important;
            right: 20px !important;
            transform: none !important;
          }
        }
      `}</style>
    </>
  );
}

function AdminNotificationToast({
  toast,
  onDismiss,
}: {
  toast: ToastEntry;
  onDismiss: (id: number) => void;
}) {
  const router = useRouter();
  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const firstName = toast.customerName?.split(' ')[0] || 'Guest';
  const shortId = toast.orderNumber?.slice(-6) || '------';

  let cardStyles: React.CSSProperties = {
    pointerEvents: 'auto',
    color: '#ECECEC',
    borderRadius: '16px',
    position: 'relative',
    overflow: 'hidden',
  };

  let headerColor = 'rgba(212,175,55,0.9)';
  let headerText = 'Notification';
  let emoji = '🔔';
  let bodyContent = toast.body;

  if (toast.category === 'order') {
    cardStyles = {
      ...cardStyles,
      background: 'rgba(10,25,14,0.85)',
      border: '1px solid rgba(76,175,80,0.25)',
      borderTop: '2px solid rgba(76,175,80,0.75)',
      boxShadow: '0 20px 50px rgba(0,0,0,0.55), 0 0 30px rgba(76,175,80,0.06)',
    };
    headerColor = 'rgba(76,175,80,0.95)';
    headerText = 'New Order';
    emoji = '💰';
  } else if (toast.category === 'return') {
    cardStyles = {
      ...cardStyles,
      background: 'rgba(25,20,10,0.85)',
      border: '1px solid rgba(255,152,0,0.25)',
      borderTop: '2px solid rgba(255,152,0,0.75)',
      boxShadow: '0 20px 50px rgba(0,0,0,0.55), 0 0 30px rgba(255,152,0,0.06)',
    };
    headerColor = 'rgba(255,152,0,0.95)';
    headerText = 'Return Request';
    emoji = '🔄';
  } else if (toast.category === 'exchange') {
    cardStyles = {
      ...cardStyles,
      background: 'rgba(10,18,28,0.85)',
      border: '1px solid rgba(33,150,243,0.25)',
      borderTop: '2px solid rgba(33,150,243,0.75)',
      boxShadow: '0 20px 50px rgba(0,0,0,0.55), 0 0 30px rgba(33,150,243,0.06)',
    };
    headerColor = 'rgba(33,150,243,0.95)';
    headerText = 'Exchange Request';
    emoji = '🔀';
  } else if (toast.category === 'delivery') {
    cardStyles = {
      ...cardStyles,
      background: 'rgba(10,25,14,0.85)',
      border: '1px solid rgba(76,175,80,0.25)',
      borderTop: '2px solid rgba(76,175,80,0.75)',
      boxShadow: '0 20px 50px rgba(0,0,0,0.55), 0 0 30px rgba(76,175,80,0.06)',
    };
    headerColor = 'rgba(76,175,80,0.95)';
    headerText = 'Delivered';
    emoji = '📦';
  } else if (toast.category === 'note') {
    cardStyles = {
      ...cardStyles,
      background: 'rgba(18,18,18,0.9)',
      border: '1px solid rgba(212,175,55,0.2)',
      borderTop: '2px solid rgba(212,175,55,0.6)',
      boxShadow: '0 20px 50px rgba(0,0,0,0.55), 0 0 30px rgba(212,175,55,0.04)',
    };
    headerColor = 'rgba(212,175,55,0.9)';
    headerText = 'Admin Note';
    emoji = '📝';
  }

  const isCod = toast.paymentMethod === 'cod';

  return (
    <div
      role="status"
      style={{
        ...cardStyles,
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        animation: prefersReduced
          ? undefined
          : 'panther-toast-slide-down 420ms cubic-bezier(0.16,1,0.3,1), panther-toast-glow 2s ease-in-out infinite alternate',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute', inset: 0, borderRadius: 'inherit',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.025) 0%, transparent 55%, rgba(0,0,0,0.08) 100%)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, padding: '14px 16px' }}>
        {/* Row 1: Header (emoji, label, order ID, dismiss) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: '1.3rem', lineHeight: 1, filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.2))' }}>
            {emoji}
          </span>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.16em', color: headerColor, textTransform: 'uppercase' }}>
            {headerText}
          </span>
          {toast.orderNumber && (
            <span style={{ fontSize: '0.6rem', color: '#888', fontFamily: 'ui-monospace, monospace', letterSpacing: '0.04em', marginLeft: 2 }}>
              #{shortId}
            </span>
          )}
          <button
            onClick={() => onDismiss(toast.id)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#777', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '0 2px' }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>

        {/* Row 2: Customer / Title / Body */}
        {toast.category === 'order' ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: '1.05rem', fontWeight: 600, letterSpacing: '-0.01em', color: '#F0F0F0' }}>
                {firstName}
              </span>
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  padding: '2px 7px', borderRadius: '999px',
                  background: isCod ? 'rgba(255,152,0,0.12)' : 'rgba(76,175,80,0.12)',
                  border: `1px solid ${isCod ? 'rgba(255,152,0,0.3)' : 'rgba(76,175,80,0.3)'}`,
                  color: isCod ? '#FF9800' : '#4CAF50',
                }}
              >
                {isCod ? '💵 COD' : '💳 Paid'}
              </span>
            </div>
            {toast.totalPaise !== undefined && (
              <span style={{
                fontSize: '1.45rem', fontWeight: 700,
                fontFamily: 'ui-monospace, monospace',
                letterSpacing: '-0.03em',
                color: 'rgba(76,175,80,0.95)',
                textShadow: '0 0 24px rgba(76,175,80,0.3)',
                lineHeight: 1,
              }}>
                {formatPrice(toast.totalPaise)}
              </span>
            )}
          </div>
        ) : (
          <div style={{ marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#ECECEC', lineHeight: 1.4 }}>
              {bodyContent}
            </p>
          </div>
        )}

        {/* Row 3: Action Button */}
        <button
          onClick={() => router.push(`/admin/orders/${toast.orderId}`)}
          style={{
            width: '100%',
            padding: '8px 0',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: '#F0F0F0',
            fontSize: '0.7rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            transition: 'background 150ms ease, border-color 150ms ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)';
          }}
        >
          VIEW ORDER →
        </button>
      </div>
    </div>
  );
}
