-- =============================================
-- PANTHER Ecommerce — 035 Marketing Platform Refinement
-- =============================================

-- 1. Add refinement columns to marketing_events table
ALTER TABLE marketing_events 
  ADD COLUMN IF NOT EXISTS correlation_id             UUID,
  ADD COLUMN IF NOT EXISTS event_version               TEXT DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS provider_mapping_version    TEXT DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS in_dlq                      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS validation_errors           JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_marketing_events_correlation
  ON marketing_events(correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_events_dlq
  ON marketing_events(in_dlq)
  WHERE in_dlq = true;

-- 2. Create Marketing Feature Flags table
CREATE TABLE IF NOT EXISTS marketing_feature_flags (
  key         TEXT        PRIMARY KEY,
  enabled     BOOLEAN     NOT NULL DEFAULT true,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed feature flags
INSERT INTO marketing_feature_flags (key, enabled, description)
VALUES 
  ('marketing.meta', true, 'Enable Meta Conversions API and Pixel dispatching'),
  ('marketing.google', true, 'Enable Google Analytics 4 and Tag Manager dispatching'),
  ('marketing.replay', true, 'Enable Event Replay Engine capability'),
  ('marketing.timeline', true, 'Enable Customer Journey Timeline rendering'),
  ('marketing.crm', true, 'Enable internal CRM profile stitching capabilities'),
  ('marketing.whatsapp', true, 'Enable WhatsApp notifications pipeline features'),
  ('marketing.ai', false, 'Enable AI segment auto-generation (Experimental)'),
  ('marketing.merchant_center', false, 'Enable Google Merchant Center feeds (Experimental)')
ON CONFLICT (key) DO NOTHING;

-- Enable RLS
ALTER TABLE marketing_feature_flags ENABLE ROW LEVEL SECURITY;

-- Admin policies
DROP POLICY IF EXISTS "Admin manage marketing feature flags" ON marketing_feature_flags;
CREATE POLICY "Admin manage marketing feature flags"
  ON marketing_feature_flags FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_users))
  WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));

-- 3. Update check_db_schema_health function to check for refinement table & columns
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
  v_marketing_feature_flags_exists BOOLEAN;
  v_events_correlation_exists BOOLEAN;
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

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'marketing_feature_flags'
  ) INTO v_marketing_feature_flags_exists;

  -- 9. Check marketing_events column correlation_id
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'marketing_events' AND column_name = 'correlation_id'
  ) INTO v_events_correlation_exists;

  -- 10. Get latest applied migration version
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
    'marketing_feature_flags_exists', v_marketing_feature_flags_exists,
    'events_correlation_exists', v_events_correlation_exists,
    'current_migration_version', COALESCE(v_current_migration, 'unknown')
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
