import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPublicVapidKey, isPushConfigured } from '@/lib/push/webPush';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/push/vapid
 *
 * Returns the public VAPID key so AdminPushPrompt can call
 * `pushManager.subscribe({ applicationServerKey })`.
 *
 * Admin-gated even though the public key is, by design, public:
 * exposing the endpoint only to admins keeps a clear audit trail
 * and prevents the front door from advertising "this site has
 * web push configured" to anonymous scrapers.
 *
 * If push is unconfigured (no env vars), returns 404 so the
 * client cleanly disables the subscribe button without errors.
 */
export async function GET(_req: NextRequest) {
  const ssr = await createServerSupabaseClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return apiError(401, 'Unauthorized');

  const admin = createAdminClient();
  const { data: row } = await admin
    .from('admin_users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  if (!row) return apiError(403, 'Not admin');

  if (!isPushConfigured()) {
    return apiError(404, 'Web push is not configured on this server');
  }

  return apiSuccess({ publicKey: getPublicVapidKey() });
}
