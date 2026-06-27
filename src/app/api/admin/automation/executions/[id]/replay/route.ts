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
 * POST /api/admin/automation/executions/[id]/replay
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { errorStatus, message, adminClient } = await checkAdmin();
  if (errorStatus || !adminClient) {
    return apiError(errorStatus || 500, message || 'Authentication failed');
  }

  try {
    const { data: exec, error } = await adminClient
      .from('workflow_executions')
      .select('*, workflows(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return apiError(500, `DB error loading execution: ${error.message}`);
    }
    if (!exec) {
      return apiError(404, 'Execution not found');
    }

    const def = exec.workflows?.definition;
    if (!def || !def.trigger || !def.trigger.nextNodeId) {
      return apiError(400, 'Workflow definition does not have valid start node');
    }

    // Reset status and logs, and bump retry count
    const replayLogs = [
      ...(exec.logs || []),
      {
        timestamp: new Date().toISOString(),
        nodeId: 'replay_start',
        nodeName: 'Runtime Engine',
        nodeType: 'system',
        status: 'info',
        message: `Manual replay triggered. (Rerun Attempt #${exec.retry_count + 1})`
      }
    ];

    await adminClient
      .from('workflow_executions')
      .update({
        status: 'started',
        completed_at: null,
        duration_ms: null,
        error_message: null,
        retry_count: exec.retry_count + 1,
        logs: replayLogs as any
      })
      .eq('id', id);

    // Run execution asynchronously
    const { runExecution } = await import('@/lib/workflow/engine');
    void runExecution(exec.id, def.trigger.nextNodeId, adminClient).catch(err => {
      console.error(`[WORKFLOW_ENGINE] Error during manual replay run of execution ${exec.id}:`, err);
    });

    return apiSuccess({ success: true, message: 'Workflow replay initiated.' });
  } catch (err: any) {
    return apiError(500, err.message || 'Internal server error');
  }
}
