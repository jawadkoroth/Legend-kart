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
 * GET /api/admin/automation/executions
 */
export async function GET(req: NextRequest) {
  const { errorStatus, message, adminClient } = await checkAdmin();
  if (errorStatus || !adminClient) {
    return apiError(errorStatus || 500, message || 'Authentication failed');
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status') || '';
  const workflowId = url.searchParams.get('workflowId') || '';
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || '50')));
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const offset = (page - 1) * limit;

  try {
    let query = adminClient
      .from('workflow_executions')
      .select('*, workflows(name, trigger_type), customer:customer_profiles(name, email)', { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    }
    if (workflowId) {
      query = query.eq('workflow_id', workflowId);
    }

    const { data: executions, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return apiError(500, `DB error loading executions: ${error.message}`);
    }

    return apiSuccess({
      executions,
      count: count || 0,
      page,
      limit
    });
  } catch (err: any) {
    return apiError(500, err.message || 'Internal server error');
  }
}
