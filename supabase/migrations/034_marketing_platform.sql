-- =============================================
-- PANTHER Ecommerce — 034 Centralized Marketing Platform Schema
-- =============================================

-- 1. Marketing Events Table (Lightweight Operational Event Log)
CREATE TABLE IF NOT EXISTS marketing_events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID        NOT NULL UNIQUE, -- Client-generated or server-generated dedup key
  schema_version   TEXT        NOT NULL DEFAULT '1.0.0',
  event_name       TEXT        NOT NULL,
  ts_client        TIMESTAMPTZ NOT NULL DEFAULT now(),
  ts_server        TIMESTAMPTZ NOT NULL DEFAULT now(),
  anonymous_id     TEXT        NOT NULL,
  user_id          UUID,       -- Matches auth.users if logged in
  session_id       TEXT        NOT NULL,
  context          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  properties       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  source           TEXT        NOT NULL DEFAULT 'client' CHECK (source IN ('client', 'server')),
  duration         INTEGER,    -- Time spent dispatching (in milliseconds)
  provider_status  JSONB       NOT NULL DEFAULT '{}'::jsonb, -- Map of provider_id -> 'sent' | 'failed' | 'ignored'
  provider_errors  JSONB       NOT NULL DEFAULT '{}'::jsonb  -- Map of provider_id -> error string
);

-- Indexes for performance & searching
CREATE INDEX IF NOT EXISTS idx_marketing_events_name_created 
  ON marketing_events(event_name, ts_server DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_events_session
  ON marketing_events(session_id, ts_server DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_events_anonymous
  ON marketing_events(anonymous_id, ts_server DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_events_user
  ON marketing_events(user_id, ts_server DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_events_ts_server
  ON marketing_events(ts_server DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_events_context_gin
  ON marketing_events USING GIN (context);

CREATE INDEX IF NOT EXISTS idx_marketing_events_properties_gin
  ON marketing_events USING GIN (properties);

-- 2. Marketing Providers Configuration Table
CREATE TABLE IF NOT EXISTS marketing_providers (
  id                TEXT        PRIMARY KEY, -- e.g. 'meta', 'google', 'console'
  enabled           BOOLEAN     NOT NULL DEFAULT false,
  config            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  version           TEXT        NOT NULL DEFAULT '1.0.0',
  last_event_sent   TIMESTAMPTZ,
  last_error        TEXT,
  status            TEXT        NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error')),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prepopulate with default providers
INSERT INTO marketing_providers (id, enabled, config, version, status)
VALUES 
  ('meta', false, '{"pixelId": "123456789", "accessToken": "", "testEventCode": ""}'::jsonb, '1.0.0', 'disconnected'),
  ('google', false, '{"measurementId": "G-123456", "apiSecret": ""}'::jsonb, '1.0.0', 'disconnected'),
  ('console', true, '{}'::jsonb, '1.0.0', 'connected')
ON CONFLICT (id) DO NOTHING;

-- 3. Marketing Consent History Table (Audit log for compliance)
CREATE TABLE IF NOT EXISTS marketing_consent (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id  TEXT        NOT NULL, -- anonymous_id or user_id
  analytics   BOOLEAN     NOT NULL DEFAULT false,
  marketing   BOOLEAN     NOT NULL DEFAULT false,
  functional  BOOLEAN     NOT NULL DEFAULT false,
  version     TEXT        NOT NULL DEFAULT '1.0.0',
  ts          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_consent_subject 
  ON marketing_consent(subject_id, ts DESC);

-- Enable RLS on all tables
ALTER TABLE marketing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_consent ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- Admin read/write policies
DROP POLICY IF EXISTS "Admin read marketing events" ON marketing_events;
CREATE POLICY "Admin read marketing events"
  ON marketing_events FOR SELECT
  USING (auth.uid() IN (SELECT id FROM admin_users));

DROP POLICY IF EXISTS "Admin manage marketing providers" ON marketing_providers;
CREATE POLICY "Admin manage marketing providers"
  ON marketing_providers FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_users))
  WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));

DROP POLICY IF EXISTS "Admin read marketing consent" ON marketing_consent;
CREATE POLICY "Admin read marketing consent"
  ON marketing_consent FOR SELECT
  USING (auth.uid() IN (SELECT id FROM admin_users));

-- Service role bypasses RLS on write by default, so no insert policies needed for general users.

-- 5. Enable Realtime broadcast for marketing_events to power developer Event Inspector
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname    = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'marketing_events'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.marketing_events';
  END IF;
END
$$;

-- 6. Update check_db_schema_health function to include marketing tables
CREATE OR REPLACE FUNCTION check_db_schema_health()
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_products_media_exists BOOLEAN;
  v_story_sections_exists BOOLEAN;
  v_product_coupons_exists BOOLEAN;
  v_admin_fcm_tokens_exists BOOLEAN;
  v_return_trigger_exists BOOLEAN;
  v_notes_trigger_exists BOOLEAN;
  v_shipment_trigger_exists BOOLEAN;
  v_marketing_events_exists BOOLEAN;
  v_marketing_providers_exists BOOLEAN;
  v_marketing_consent_exists BOOLEAN;
  v_current_migration TEXT;
END;
$$ LANGUAGE plpgsql;

-- Re-create function with marketing metrics
CREATE OR REPLACE FUNCTION check_db_schema_health()
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_products_media_exists BOOLEAN;
  v_story_sections_exists BOOLEAN;
  v_product_coupons_exists BOOLEAN;
  v_admin_fcm_tokens_exists BOOLEAN;
  v_return_trigger_exists BOOLEAN;
  v_notes_trigger_exists BOOLEAN;
  v_shipment_trigger_exists BOOLEAN;
  v_marketing_events_exists BOOLEAN;
  v_marketing_providers_exists BOOLEAN;
  v_marketing_consent_exists BOOLEAN;
  v_current_migration TEXT;
BEGIN
  -- 1. Check column products.media
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'media'
  ) INTO v_products_media_exists;

  -- 2. Check table product_story_sections
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'product_story_sections'
  ) INTO v_story_sections_exists;

  -- 3. Check table product_coupons
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'product_coupons'
  ) INTO v_product_coupons_exists;

  -- 4. Check table admin_fcm_tokens
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'admin_fcm_tokens'
  ) INTO v_admin_fcm_tokens_exists;

  -- 5. Check return triggers
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_return_requests_push'
  ) INTO v_return_trigger_exists;

  -- 6. Check notes trigger
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_admin_notes_push'
  ) INTO v_notes_trigger_exists;

  -- 7. Check shipment trigger
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_shipment_status_push'
  ) INTO v_shipment_trigger_exists;

  -- 8. Check marketing tables
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'marketing_events'
  ) INTO v_marketing_events_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'marketing_providers'
  ) INTO v_marketing_providers_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'marketing_consent'
  ) INTO v_marketing_consent_exists;

  -- 9. Get latest applied migration version
  BEGIN
    SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 1 INTO v_current_migration;
  EXCEPTION WHEN OTHERS THEN
    v_current_migration := 'unknown';
  END;

  v_result := json_build_object(
    'products_media_exists', v_products_media_exists,
    'product_story_sections_exists', v_story_sections_exists,
    'product_coupons_exists', v_product_coupons_exists,
    'admin_fcm_tokens_exists', v_admin_fcm_tokens_exists,
    'notification_triggers_exist', (v_return_trigger_exists AND v_notes_trigger_exists AND v_shipment_trigger_exists),
    'marketing_events_exists', v_marketing_events_exists,
    'marketing_providers_exists', v_marketing_providers_exists,
    'marketing_consent_exists', v_marketing_consent_exists,
    'current_migration_version', COALESCE(v_current_migration, 'unknown')
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
