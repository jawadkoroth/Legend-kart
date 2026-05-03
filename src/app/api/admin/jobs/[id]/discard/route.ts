import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiSuccess, apiError } from '@/lib/api-response';
import { logAdminAction } from '@/lib/audit/logAdminAction';
import { logEvent } from '@/lib/log';
import { withRequest } from '@/lib/observability/context';

/**
 * POST /api/admin/jobs/[id]/discard
 *
 * Force-terminate a job by marking it 'dead'. Useful when a failed
 * job is known-broken (bad payload, deleted recipient, etc.) and we
 * want to stop the runner from automatically retrying it.
 *
 * Allowed only from 'queued' / 'failed'. Already-running jobs are
 * left alone — discarding mid-execution would race the worker; the
 * lease will simply lapse and the runner will pick it back up, at
 * which point this endpoint can be called again.
 *
 * Admin-gated. Audit-logged.
 */
export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return withRequest(req, () => handle(req, ctx));
}

async function handle(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ssr = await createServerSupabaseClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return apiError(401, 'Unauthorized');

  const admin = createAdminClient();
  const { data: adminRow } = await admin
    .from('admin_users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  if (!adminRow) return apiError(403, 'Not admin');

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return apiError(400, 'Invalid job id');
  }

  const { data: job, error: lookupError } = await admin
    .from('job_queue')
    .select('id, kind, status, attempts')
    .eq('id', id)
    .maybeSingle();

  if (lookupError) {
    return apiError(500, 'Lookup failed: ' + lookupError.message);
  }
  if (!job) return apiError(404, 'Job not found');
  if (job.status === 'dead') {
    // Idempotent — already there.
    return apiSuccess({ id, status: 'dead', noop: true });
  }
  if (job.status === 'running') {
    return apiError(
      409,
      'Job is currently running; wait for the lease to lapse before discarding',
    );
  }
  if (job.status === 'succeeded') {
    return apiError(409, 'Cannot discard a succeeded job');
  }

  const { error: updateError } = await admin
    .from('job_queue')
    .update({
      status: 'dead',
      lease_until: null,
    })
    .eq('id', id);

  if (updateError) {
    return apiError(500, 'Update failed: ' + updateError.message);
  }

  logEvent(
    'job.manual_discard',
    { job_id: id, kind: job.kind, prior_status: job.status, attempts: job.attempts },
    {
      severity: 'warn',
      source: 'admin',
      entityType: 'job',
      entityId: id,
      actorId: user.id,
    },
  );
  void logAdminAction(admin, {
    adminId: user.id,
    action: 'job.discard',
    entityType: 'job',
    entityId: id,
    metadata: { kind: job.kind, prior_status: job.status, attempts: job.attempts },
  });

  return apiSuccess({ id, status: 'dead' });
}
