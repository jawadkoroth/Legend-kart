import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/log';
import { claimJobs, markSucceeded, markFailed } from '@/lib/jobs/queue';
import { getHandler } from '@/lib/jobs/handlers';

/**
 * POST/GET /api/jobs/run
 *
 * The cron-triggered drain endpoint. Vercel Cron is configured in
 * vercel.json to hit this every minute (or two). Each invocation:
 *
 *   1. Authenticates the caller. Vercel Cron sends an
 *      `Authorization: Bearer <CRON_SECRET>` header; any other
 *      request must match the same secret. No secret => no run.
 *   2. Claims up to BATCH_SIZE due jobs via the `claim_jobs` RPC,
 *      which atomically flips them to `running` under FOR UPDATE
 *      SKIP LOCKED so concurrent invocations never double-claim.
 *   3. Runs each job's handler with a hard try/catch.
 *      • success → `markSucceeded`
 *      • throw   → `markFailed` with exponential backoff, or
 *                  promoted to `dead` once `attempts >= max_attempts`.
 *   4. Returns a small JSON summary so the cron log is readable.
 *
 * Reliability invariants:
 *   * Stale leases (runner crashed mid-execution) are reclaimed by
 *     `claim_jobs` itself — no separate sweeper required.
 *   * The endpoint NEVER throws to the cron caller. Top-level
 *     errors land in `app_events` with severity=error.
 *   * Same body for GET and POST so this works behind whichever
 *     verb a given scheduler defaults to.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BATCH_SIZE = 10;
const LEASE_SECONDS = 120;
// Soft per-invocation timeout. Vercel Hobby caps at 10s, Pro at 60s
// for serverless functions. We stop claiming new jobs once we're
// inside this window; in-flight handlers still finish.
const SOFT_DEADLINE_MS = 25_000;

function isAuthorised(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  const auth = req.headers.get('authorization') || '';
  if (auth === `Bearer ${expected}`) return true;

  // Manual triggers / external schedulers can also send `?secret=`.
  const fromQuery = req.nextUrl.searchParams.get('secret');
  if (fromQuery && fromQuery === expected) return true;

  return false;
}

async function handle(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const supabase = createAdminClient();
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    while (Date.now() - startedAt < SOFT_DEADLINE_MS) {
      const jobs = await claimJobs(BATCH_SIZE, LEASE_SECONDS, supabase);
      if (jobs.length === 0) break;

      for (const job of jobs) {
        processed += 1;
        const handler = getHandler(job.kind);
        if (!handler) {
          // Unknown handler — promote straight to dead so it surfaces
          // on diagnostics instead of looping forever. Wrong code,
          // not a transient failure.
          await markFailed(
            job.id,
            {
              error: `no handler registered for kind=${job.kind}`,
              attempts: job.max_attempts,
              maxAttempts: job.max_attempts,
            },
            supabase,
          );
          failed += 1;
          logEvent(
            'job.unknown_kind',
            { job_id: job.id, kind: job.kind },
            { source: 'cron', severity: 'error' },
          );
          continue;
        }

        try {
          await handler(job.payload, supabase);
          await markSucceeded(job.id, supabase);
          succeeded += 1;
          logEvent(
            'job.succeeded',
            { job_id: job.id, kind: job.kind, attempts: job.attempts },
            { source: 'cron', entityType: 'job', entityId: job.id },
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await markFailed(
            job.id,
            {
              error: msg,
              attempts: job.attempts,
              maxAttempts: job.max_attempts,
            },
            supabase,
          );
          failed += 1;
          logEvent(
            'job.failed',
            {
              job_id: job.id,
              kind: job.kind,
              attempts: job.attempts,
              max_attempts: job.max_attempts,
              error: msg,
            },
            { source: 'cron', severity: 'warn', entityType: 'job', entityId: job.id },
          );
        }
      }

      // If we got fewer than BATCH_SIZE, the queue is drained for
      // this tick; no point hammering claim_jobs again immediately.
      if (jobs.length < BATCH_SIZE) break;
    }

    return NextResponse.json({
      success: true,
      processed,
      succeeded,
      failed,
      duration_ms: Date.now() - startedAt,
    });
  } catch (err) {
    logEvent(
      'job.runner_unhandled',
      { error: err instanceof Error ? err.message : String(err) },
      { source: 'cron', severity: 'error' },
    );
    return NextResponse.json(
      {
        success: false,
        error: 'Runner failure',
        processed,
        succeeded,
        failed,
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
