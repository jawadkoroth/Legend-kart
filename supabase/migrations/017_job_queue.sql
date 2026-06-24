-- =============================================
-- PANTHER Ecommerce — 017 Job queue (async reliability)
--
-- Pragmatic Postgres-backed job queue. No Redis, no external broker.
-- The existing Supabase instance is the source of truth; Vercel Cron
-- (every 1–2 minutes) hits /api/jobs/run which calls `claim_jobs` to
-- pick the next batch under FOR UPDATE SKIP LOCKED.
--
-- Why Postgres:
--   * One less moving part. Moderate scale (O(1–10) jobs/min) is
--     comfortably handled by SKIP LOCKED on an indexed status
--     partial index.
--   * Durability comes free with the DB — if the process crashes
--     mid-execution, the lease timeout recovers the job.
--   * Idempotency is enforced with a UNIQUE idempotency_key so
--     duplicate enqueues collapse to one row.
--
-- Lifecycle:
--   queued   — freshly enqueued, waiting for a runner.
--   running  — claimed by a runner; lease_until bounds staleness.
--   succeeded— handler returned cleanly.
--   failed   — handler threw but attempts < max_attempts; will retry
--              (run_at bumped with exponential backoff).
--   dead     — attempts reached max_attempts; surfaced on /admin/diagnostics.
-- =============================================

CREATE TABLE IF NOT EXISTS job_queue (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             TEXT        NOT NULL,
  payload          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  status           TEXT        NOT NULL DEFAULT 'queued'
                     CHECK (status IN ('queued','running','succeeded','failed','dead')),
  attempts         INT         NOT NULL DEFAULT 0,
  max_attempts     INT         NOT NULL DEFAULT 5,
  run_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at        TIMESTAMPTZ,
  lease_until      TIMESTAMPTZ,
  last_error       TEXT,
  idempotency_key  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique per idempotency_key when provided; NULL keys never collide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_queue_idem
  ON job_queue(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- The hot path: runner scans for queued jobs that are due.
CREATE INDEX IF NOT EXISTS idx_job_queue_due
  ON job_queue(run_at)
  WHERE status = 'queued';

-- Admin diagnostics: "show me the dead letters and recent failures".
CREATE INDEX IF NOT EXISTS idx_job_queue_dead
  ON job_queue(updated_at DESC)
  WHERE status IN ('dead','failed');

CREATE INDEX IF NOT EXISTS idx_job_queue_kind_status
  ON job_queue(kind, status, updated_at DESC);

ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin read jobs" ON job_queue;
CREATE POLICY "Admin read jobs"
  ON job_queue FOR SELECT
  USING (auth.uid() IN (SELECT id FROM admin_users));

-- No insert/update/delete policy → only service-role writes.

-- =============================================
-- claim_jobs: atomic "fetch next batch" primitive.
--
-- Semantics:
--   * Also reclaims stale leases: any row in `running` whose
--     lease_until has passed is treated as queued again and picked
--     up by this batch. This closes the "runner crashed mid-job"
--     loop without a separate sweeper cron.
--   * FOR UPDATE SKIP LOCKED so concurrent runners never double-claim.
--   * Claimed rows are flipped to `running` in the same statement.
--   * Returns the full row so the caller has everything it needs.
-- =============================================

CREATE OR REPLACE FUNCTION claim_jobs(
  p_limit          INT DEFAULT 5,
  p_lease_seconds  INT DEFAULT 120
)
RETURNS SETOF job_queue
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT id
      FROM job_queue
     WHERE
       (status = 'queued' AND run_at <= v_now)
       OR (status = 'running' AND lease_until IS NOT NULL AND lease_until < v_now)
     ORDER BY run_at ASC
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  )
  UPDATE job_queue j
     SET status      = 'running',
         attempts    = j.attempts + 1,
         locked_at   = v_now,
         lease_until = v_now + make_interval(secs => p_lease_seconds),
         updated_at  = v_now
    FROM candidates c
   WHERE j.id = c.id
   RETURNING j.*;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_jobs(INT, INT) TO service_role;

-- Auto-maintain updated_at for any direct UPDATE that forgets it.
CREATE OR REPLACE FUNCTION _job_queue_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_queue_updated_at ON job_queue;
CREATE TRIGGER trg_job_queue_updated_at
  BEFORE UPDATE ON job_queue
  FOR EACH ROW EXECUTE FUNCTION _job_queue_touch_updated_at();
