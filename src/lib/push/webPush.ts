import webpush, { WebPushError } from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

/**
 * PANTHER — Web Push & FCM helper.
 *
 * Wraps web-push and firebase-admin with:
 *
 *   - Lazy VAPID and Firebase configurations.
 *   - `notifyAdmins()` fans out to both standard browser Web Push and FCM.
 *   - Prunes dead endpoints/tokens dynamically.
 */

let vapidConfigured = false;

export function isPushConfigured(): boolean {
  return !!(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  );
}

export function getPublicVapidKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  if (!isPushConfigured()) return false;
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    vapidConfigured = true;
    return true;
  } catch (err) {
    console.error('[PUSH_VAPID_INIT]', err);
    return false;
  }
}

function getFirebaseMessaging() {
  if (typeof process.env.FIREBASE_SERVICE_ACCOUNT_JSON !== 'string') {
    return null;
  }
  try {
    if (getApps().length === 0) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      initializeApp({
        credential: cert(serviceAccount),
      });
    }
    return getMessaging();
  } catch (err) {
    console.error('[FCM_INIT_ERROR]', err);
    return null;
  }
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface AdminPushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  orderId?: string;
  type?: string;
}

/**
 * Send `payload` to native Android devices using FCM.
 */
export async function notifyFCMAdmins(
  supabase: SupabaseClient,
  payload: AdminPushPayload,
): Promise<{ sent: number; pruned: number; errored: number }> {
  const messaging = getFirebaseMessaging();
  if (!messaging) {
    return { sent: 0, pruned: 0, errored: 0 };
  }

  const { data: tokens, error } = await supabase
    .from('admin_fcm_tokens')
    .select('id, token');

  if (error || !tokens || tokens.length === 0) {
    console.log('[FCM_TOKEN_MISSING] No FCM tokens found in admin_fcm_tokens table.');
    return { sent: 0, pruned: 0, errored: 0 };
  }

  console.log(`[FCM_TOKEN_FOUND] Found ${tokens.length} FCM token(s) for push dispatch.`);

  const fcmTokens = tokens.map((t) => t.token);
  const tokenIds = tokens.map((t) => t.id);

  let channelId = 'new_orders';
  let isSilent = false;
  const pType = payload.type || 'new_order';

  if (pType === 'return') {
    channelId = 'return_requests';
  } else if (pType === 'exchange') {
    channelId = 'exchange_requests';
  } else if (pType === 'delivery') {
    channelId = 'shipments';
  } else if (pType === 'note') {
    channelId = 'admin_notes';
    isSilent = true;
  }

  try {
    const message = {
      notification: {
        title: payload.title,
        body: payload.body,
      },
      android: {
        notification: {
          channelId: channelId,
          sound: isSilent ? undefined : (channelId === 'new_orders' ? 'cash_register' : 'default'),
        },
      },
      data: {
        orderId: payload.orderId || '',
        type: pType,
      },
      tokens: fcmTokens,
    };

    const response = await messaging.sendEachForMulticast(message);

    const deadTokens: string[] = [];
    response.responses.forEach((res, index) => {
      if (!res.success) {
        const error = res.error;
        if (error && (
          error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered'
        )) {
          deadTokens.push(tokenIds[index]);
        }
        console.error('[FCM_SEND_TOKEN_ERROR]', error);
      }
    });

    if (deadTokens.length > 0) {
      await supabase.from('admin_fcm_tokens').delete().in('id', deadTokens);
    }

    const sentCount = response.successCount;
    const prunedCount = deadTokens.length;
    const erroredCount = response.failureCount - prunedCount;

    if (sentCount > 0) {
      console.log(`[FCM_SEND_SUCCESS] Successfully sent ${sentCount} notifications via FCM.`);
    }
    if (response.failureCount > 0) {
      console.log(`[FCM_SEND_FAILURE] Failed to send ${response.failureCount} notifications via FCM.`);
    }

    return { sent: sentCount, pruned: prunedCount, errored: erroredCount };
  } catch (err) {
    console.error('[FCM_SEND_MULTICAST_ERROR]', err);
    console.log('[FCM_SEND_FAILURE] FCM send multicast threw an error.');
    return { sent: 0, pruned: 0, errored: tokens.length };
  }
}

/**
 * Send `payload` to every admin Web Push & FCM subscription.
 */
export async function notifyAdmins(
  supabase: SupabaseClient,
  payload: AdminPushPayload,
): Promise<{ sent: number; pruned: number; errored: number }> {
  // 1. Send via FCM
  const fcmResult = await notifyFCMAdmins(supabase, payload);

  // 2. Send via Web Push (fallback/browser)
  if (!ensureVapid()) {
    return fcmResult;
  }

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth');

  if (error || !subs || subs.length === 0) {
    return fcmResult;
  }

  const message = JSON.stringify(payload);
  const deadIds: string[] = [];
  const okIds: string[] = [];
  let webPushErrored = 0;

  await Promise.all(
    (subs as SubscriptionRow[]).map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          message,
          { TTL: 60 },
        );
        okIds.push(s.id);
      } catch (err) {
        const status = (err as WebPushError)?.statusCode;
        if (status === 404 || status === 410) {
          deadIds.push(s.id);
        } else {
          webPushErrored += 1;
          console.error('[PUSH_SEND_ERROR]', status, (err as Error)?.message);
        }
      }
    }),
  );

  if (deadIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', deadIds);
  }

  if (okIds.length > 0) {
    await supabase
      .from('push_subscriptions')
      .update({ last_used_at: new Date().toISOString() })
      .in('id', okIds);
  }

  return {
    sent: fcmResult.sent + okIds.length,
    pruned: fcmResult.pruned + deadIds.length,
    errored: fcmResult.errored + webPushErrored,
  };
}

/**
 * Fire-and-forget admin push fan-out for *real-time* code paths.
 */
export async function notifyAdminsBestEffort(
  supabase: SupabaseClient,
  payload: AdminPushPayload,
  timeoutMs = 3000,
): Promise<void> {
  const { logEvent } = await import('@/lib/log');

  const fanout = (async () => {
    try {
      const result = await notifyAdmins(supabase, payload);
      logEvent(
        'push.admin_fanout',
        {
          tag: payload.tag ?? null,
          sent: result.sent,
          pruned: result.pruned,
          errored: result.errored,
        },
        { source: 'system' },
      );
    } catch (err) {
      logEvent(
        'push.admin_fanout_failed',
        { error: err instanceof Error ? err.message : String(err) },
        { source: 'system', severity: 'error' },
      );
    }
  })();

  const timeout = new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, timeoutMs);
  });

  await Promise.race([fanout, timeout]);
}
