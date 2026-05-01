import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/push/subscribe
 *
 * Persists a PushSubscription returned by the browser's
 * `pushManager.subscribe()` call. Admin-only.
 *
 * Body:
 *   {
 *     endpoint: string,                  // unique push service URL
 *     keys: { p256dh: string, auth: string }
 *   }
 *
 * Idempotent: re-subscribing with the same endpoint replaces the
 * keys (browsers can rotate them) and refreshes last_used_at.
 *
 * DELETE /api/admin/push/subscribe
 *   Body: { endpoint: string } — removes the row.
 */

interface IncomingSub {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
}

async function gateAdmin() {
  const ssr = await createServerSupabaseClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return { ok: false as const, status: 401, message: 'Unauthorized' };
  const admin = createAdminClient();
  const { data: row } = await admin
    .from('admin_users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  if (!row) return { ok: false as const, status: 403, message: 'Not admin' };
  return { ok: true as const, admin, userId: user.id };
}

export async function POST(req: NextRequest) {
  const gate = await gateAdmin();
  if (!gate.ok) return apiError(gate.status, gate.message);

  const body = (await req.json().catch(() => ({}))) as IncomingSub;
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : '';
  const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : '';
  const auth = typeof body.keys?.auth === 'string' ? body.keys.auth : '';

  if (!endpoint || !p256dh || !auth) {
    return apiError(400, 'endpoint, keys.p256dh and keys.auth are required');
  }
  if (!/^https:\/\//i.test(endpoint)) {
    // Push endpoints are always https URLs from the browser; an
    // http endpoint indicates tampering or a stale tab.
    return apiError(400, 'endpoint must be an https URL');
  }

  const userAgent = req.headers.get('user-agent')?.slice(0, 200) ?? null;
  const now = new Date().toISOString();

  const { error } = await gate.admin
    .from('push_subscriptions')
    .upsert(
      {
        user_id: gate.userId,
        endpoint,
        p256dh,
        auth,
        user_agent: userAgent,
        last_used_at: now,
      },
      { onConflict: 'endpoint' },
    );

  if (error) {
    console.error('[PUSH_SUBSCRIBE_ERROR]', error);
    return apiError(500, 'Failed to save subscription');
  }

  return apiSuccess({ subscribed: true });
}

export async function DELETE(req: NextRequest) {
  const gate = await gateAdmin();
  if (!gate.ok) return apiError(gate.status, gate.message);

  const body = (await req.json().catch(() => ({}))) as { endpoint?: string };
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : '';
  if (!endpoint) return apiError(400, 'endpoint required');

  const { error } = await gate.admin
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', gate.userId);

  if (error) {
    console.error('[PUSH_UNSUBSCRIBE_ERROR]', error);
    return apiError(500, 'Failed to unsubscribe');
  }

  return apiSuccess({ unsubscribed: true });
}
