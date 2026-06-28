-- ===============================================================
-- PANTHER Ecommerce — 041 Unified Admin Notifications Table
--
-- Stores all alerts and actions destined for the Admin Panel:
-- orders, return requests, exchanges, low stock warnings, dead jobs, etc.
-- Allows tracking read/unread status on a per-notification level.
-- ===============================================================

CREATE TABLE IF NOT EXISTS admin_notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  type        TEXT        NOT NULL, -- 'order', 'return', 'exchange', 'workflow_failure', 'marketing_failure', 'shipping_issue', 'system_alert', 'feedback', 'low_stock', 'note'
  is_read     BOOLEAN     NOT NULL DEFAULT false,
  priority    TEXT        NOT NULL DEFAULT 'info' CHECK (priority IN ('critical', 'warning', 'info', 'low')),
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Optimize search, filtering by type/read status, and chronological sorting
CREATE INDEX IF NOT EXISTS idx_admin_notifications_is_read
  ON admin_notifications(is_read);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_type
  ON admin_notifications(type);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at
  ON admin_notifications(created_at DESC);

-- Enable RLS so only authenticated admin users can read/modify notifications
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

-- Admins can view all notifications
DROP POLICY IF EXISTS "Admins can view notifications" ON admin_notifications;
CREATE POLICY "Admins can view notifications"
  ON admin_notifications FOR SELECT
  USING (auth.uid() IN (SELECT id FROM admin_users));

-- Admins can update notifications (e.g. mark as read)
DROP POLICY IF EXISTS "Admins can update notifications" ON admin_notifications;
CREATE POLICY "Admins can update notifications"
  ON admin_notifications FOR UPDATE
  USING (auth.uid() IN (SELECT id FROM admin_users))
  WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));

-- Publish to realtime so admin clients receive INSERT / UPDATE events automatically
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname    = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'admin_notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications';
  END IF;
END
$$;
