-- =============================================
-- PANTHER Ecommerce — 013 Web push subscriptions (admin)
--
-- Stores PushSubscription records returned by the browser's
-- ServiceWorkerRegistration.pushManager.subscribe() call. We
-- fan out new-order notifications to every active subscription
-- whose user_id is in `admin_users`.
--
-- Schema:
--   id          UUID
--   user_id     UUID FK auth.users — admin who owns the device
--   endpoint    UNIQUE — Push service URL; identifies the device.
--                The browser rotates these so a new subscription
--                creates a new row, and we lazily prune dead ones
--                when the push service returns 410 Gone.
--   p256dh      base64url public key
--   auth        base64url auth secret
--   user_agent  best-effort label so admins can recognise their
--                own subscriptions in a list
--   created_at, last_used_at
--
-- RLS: admin-only read/write. Anonymous clients can never enumerate
-- subscriptions or push to others.
-- =============================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint     TEXT        NOT NULL UNIQUE,
  p256dh       TEXT        NOT NULL,
  auth         TEXT        NOT NULL,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage push_subscriptions" ON push_subscriptions;
CREATE POLICY "Admin manage push_subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_users));
