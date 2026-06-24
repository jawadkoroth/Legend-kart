-- =============================================
-- PANTHER Ecommerce — 028 FCM tokens (admin)
--
-- Stores native FCM registration tokens returned by the native
-- Capacitor PushNotifications plugin. We send order notifications,
-- returns/exchanges alerts, and shipping alerts to these tokens.
--
-- Schema:
--   id           UUID PRIMARY KEY
--   user_id      UUID FK auth.users — admin who owns the token
--   token        TEXT        NOT NULL UNIQUE,
--   device_name  TEXT,
--   created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
--   last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
--
-- RLS: admin-only read/write.
-- =============================================

CREATE TABLE IF NOT EXISTS admin_fcm_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token        TEXT        NOT NULL UNIQUE,
  device_name  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_fcm_tokens_user
  ON admin_fcm_tokens(user_id);

ALTER TABLE admin_fcm_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage admin_fcm_tokens" ON admin_fcm_tokens;
CREATE POLICY "Admin manage admin_fcm_tokens"
  ON admin_fcm_tokens FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_users))
  WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));
