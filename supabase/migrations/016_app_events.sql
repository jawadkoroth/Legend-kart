-- =============================================
-- NOIR Ecommerce — 016 App events (observability spine)
--
-- Single append-only table that every server-side `logEvent` call
-- lands in. Replaces the "logs are in stdout only, good luck
-- grepping Vercel" pattern with a queryable store the admin
-- diagnostics page can read directly.
--
-- Design notes:
--   * Append-only: we NEVER update or delete rows from application
--     code. Retention is handled by the admin (manual TRUNCATE or a
--     scheduled pg_cron prune). This keeps event writes cheap and
--     concurrency-safe.
--   * TEXT severity (not enum) so new levels can be added without a
--     migration — the admin surface clamps to the known 5.
--   * `metadata JSONB` keeps shape flexible; indexed via GIN for
--     future ad-hoc admin queries.
--   * RLS: admin-only SELECT. Writes happen via the service-role
--     client (createAdminClient), which bypasses RLS by design.
-- =============================================

CREATE TABLE IF NOT EXISTS app_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity     TEXT        NOT NULL DEFAULT 'info'
                 CHECK (severity IN ('debug','info','warn','error','fatal')),
  source       TEXT        NOT NULL DEFAULT 'api'
                 CHECK (source IN ('api','job','webhook','admin','system','cron')),
  event        TEXT        NOT NULL,
  request_id   TEXT,
  actor_id     UUID,
  entity_type  TEXT,
  entity_id    TEXT,
  metadata     JSONB       NOT NULL DEFAULT '{}'::jsonb
);

-- Most common admin-surface queries:
--   * "latest errors" / "latest warnings" — severity + created_at
--   * "everything for this order" — entity_type + entity_id + created_at
--   * "everything from this request" — request_id + created_at
--   * "timeline for this event family" — event prefix + created_at
CREATE INDEX IF NOT EXISTS idx_app_events_severity_created
  ON app_events(severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_events_entity
  ON app_events(entity_type, entity_id, created_at DESC)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_app_events_request
  ON app_events(request_id, created_at DESC)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_app_events_event_created
  ON app_events(event, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_events_created
  ON app_events(created_at DESC);

-- GIN on metadata for future ad-hoc JSONB containment queries
-- (e.g. metadata @> '{"order_id":"..."}').
CREATE INDEX IF NOT EXISTS idx_app_events_metadata_gin
  ON app_events USING GIN (metadata);

ALTER TABLE app_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin read app events" ON app_events;
CREATE POLICY "Admin read app events"
  ON app_events FOR SELECT
  USING (auth.uid() IN (SELECT id FROM admin_users));

-- No INSERT/UPDATE/DELETE policy → only service-role writes.
