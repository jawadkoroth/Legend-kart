import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiSuccess, apiError } from '@/lib/api-response';
import { logAdminAction } from '@/lib/audit/logAdminAction';
import { logEvent } from '@/lib/log';
import { withRequest } from '@/lib/observability/context';

/**
 * POST /api/admin/jobs/[id]/retry
 *
 * Manual retry of a failed-or-dead job from the diagnostics surface.
 *
 *   - status flips back to 'queued'
 *   - run_at = now (so the next /api/jobs/run cron tick picks it up)
 *   - last_error is cleared (the row already retains attempt count;
 *     we deliberately do NOT zero attempts so the operator can see
 *     "this one needed a manual nudge after N tries")
 *   - lease_until / locked_at are cleared so claim_jobs treats it as
 *     fresh queue, not a stale lease.
 *
 * Admin-gated. Audit-logged. Service-role write because the job_queue
 * RLS policy does not grant UPDATE to admins (read-only by design).
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

  // 1. Admin gate (cookie-bound).
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

  // 2. Validate id shape (UUID). We never trust path segments.
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return apiError(400, 'Invalid job id');
  }

  // 3. Look up the job. Only failed / dead are eligible — re-queueing
  //    a running or already-queued job would race the worker.
  const { data: job, error: lookupError } = await admin
    .from('job_queue')
    .select('id, kind, status, attempts')
    .eq('id', id)
    .maybeSingle();

  if (lookupError) {
    return apiError(500, 'Lookup failed: ' + lookupError.message);
  }
  if (!job) return apiError(404, 'Job not found');
  if (job.status !== 'failed' && job.status !== 'dead') {
    return apiError(409, `Job is ${job.status}; only failed/dead can be retried`);
  }

  // 4. Reset to queued. We deliberately keep `attempts` as-is so the
  //    history of automatic attempts is preserved on the row.
  const { error: updateError } = await admin
    .from('job_queue')
    .update({
      status: 'queued',
      run_at: new Date().toISOString(),
      locked_at: null,
      lease_until: null,
      last_error: null,
    })
    .eq('id', id);

  if (updateError) {
    return apiError(500, 'Update failed: ' + updateError.message);
  }

  logEvent(
    'job.manual_retry',
    { job_id: id, kind: job.kind, prior_status: job.status, attempts: job.attempts },
    {
      severity: 'info',
      source: 'admin',
      entityType: 'job',
      entityId: id,
      actorId: user.id,
    },
  );
  void logAdminAction(admin, {
    adminId: user.id,
    action: 'job.retry',
    entityType: 'job',
    entityId: id,
    metadata: { kind: job.kind, prior_status: job.status, attempts: job.attempts },
  });

  return apiSuccess({ id, status: 'queued' });
}
