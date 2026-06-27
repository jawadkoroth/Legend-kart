import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { apiSuccess, apiError } from '@/lib/api-response';
import { WORKFLOW_TEMPLATES } from '@/lib/workflow/templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function checkAdmin() {
  const serverSupabase = await createServerSupabaseClient();
  const { data: { user } } = await serverSupabase.auth.getUser();
  if (!user) return { errorStatus: 401, message: 'Unauthorized', adminClient: null };

  const adminClient = createAdminClient();
  const { data: adminUser } = await adminClient
    .from('admin_users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (!adminUser) return { errorStatus: 403, message: 'Forbidden', adminClient: null };
  return { errorStatus: null, message: null, adminClient };
}

/**
 * GET /api/admin/automation/templates
 */
export async function GET(req: NextRequest) {
  const { errorStatus, message } = await checkAdmin();
  if (errorStatus) {
    return apiError(errorStatus, message || 'Authentication failed');
  }

  try {
    const templates = Object.values(WORKFLOW_TEMPLATES);
    return apiSuccess({ templates });
  } catch (err: any) {
    return apiError(500, err.message || 'Internal server error');
  }
}
