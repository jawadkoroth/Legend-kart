-- =============================================
-- PANTHER Ecommerce — 014 Admin audit log
--
-- Lightweight, additive audit trail for admin actions.
--
-- Writes land via the service-role path from server routes; RLS
-- blocks direct client-side inserts. Admins can read the log to
-- answer "who changed what, when" without a third-party service.
--
-- We intentionally keep `entity_id` as TEXT (not UUID) so we can
-- log entity types whose natural id is a slug, order_number, or
-- composite key without schema churn.
-- =============================================

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action       TEXT        NOT NULL,
  entity_type  TEXT        NOT NULL,
  entity_id    TEXT,
  metadata     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Search by entity (history of a single product/coupon/order) and
-- by admin (who is doing what). Both common admin UI queries.
CREATE INDEX IF NOT EXISTS idx_admin_audit_entity
  ON admin_audit_log(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_admin
  ON admin_audit_log(admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created
  ON admin_audit_log(created_at DESC);

-- RLS: admins can read their own org's log; writes are service-role only.
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin read audit log" ON admin_audit_log;
CREATE POLICY "Admin read audit log"
  ON admin_audit_log FOR SELECT
  USING (auth.uid() IN (SELECT id FROM admin_users));

-- No INSERT / UPDATE / DELETE policy → only the service-role
-- client (createAdminClient) can write. This prevents a compromised
-- admin cookie from silently scrubbing their own history.
