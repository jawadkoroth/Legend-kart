import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { apiSuccess, apiError } from '@/lib/api-response';

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
 * GET /api/admin/automation/executions/[id]
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { errorStatus, message, adminClient } = await checkAdmin();
  if (errorStatus || !adminClient) {
    return apiError(errorStatus || 500, message || 'Authentication failed');
  }

  try {
    const { data: execution, error } = await adminClient
      .from('workflow_executions')
      .select('*, workflows(*), customer:customer_profiles(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return apiError(500, `DB error loading execution: ${error.message}`);
    }
    if (!execution) {
      return apiError(404, 'Execution not found');
    }

    return apiSuccess({ execution });
  } catch (err: any) {
    return apiError(500, err.message || 'Internal server error');
  }
}
