-- ===================================================
-- PANTHER Ecommerce — 036 Marketing Attribution & Audiences
-- ===================================================

-- 1. Add marketing attribution columns to orders table
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS utm_source        TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium        TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign      TEXT,
  ADD COLUMN IF NOT EXISTS utm_content       TEXT,
  ADD COLUMN IF NOT EXISTS utm_term          TEXT,
  ADD COLUMN IF NOT EXISTS gclid             TEXT,
  ADD COLUMN IF NOT EXISTS fbclid            TEXT,
  ADD COLUMN IF NOT EXISTS landing_page      TEXT,
  ADD COLUMN IF NOT EXISTS first_touch       TEXT,
  ADD COLUMN IF NOT EXISTS last_touch        TEXT,
  ADD COLUMN IF NOT EXISTS referrer          TEXT,
  ADD COLUMN IF NOT EXISTS device            TEXT,
  ADD COLUMN IF NOT EXISTS browser           TEXT,
  ADD COLUMN IF NOT EXISTS country           TEXT DEFAULT 'India';

-- Indexes for fast attribution queries
CREATE INDEX IF NOT EXISTS idx_orders_utm_source ON orders(utm_source) WHERE utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_gclid ON orders(gclid) WHERE gclid IS NOT NULL;

-- 2. Add feed columns to products table
ALTER TABLE products 
  ADD COLUMN IF NOT EXISTS brand                    TEXT DEFAULT 'NOIR',
  ADD COLUMN IF NOT EXISTS gtin                     TEXT,
  ADD COLUMN IF NOT EXISTS google_product_category  TEXT DEFAULT 'Apparel & Accessories > Clothing';

-- 3. Create marketing_audiences table
CREATE TABLE IF NOT EXISTS marketing_audiences (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT,
  rules       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed marketing audiences
INSERT INTO marketing_audiences (name, description, rules)
VALUES 
  ('Viewed Product but NOT Purchased', 'Visitors who landed on a product detail page in the last 30 days but have not placed an order.', '{"days": 30, "events": ["product_viewed"], "exclude": ["payment_success"]}'::jsonb),
  ('Added to Cart but No Checkout', 'Visitors who added products to their cart but did not initiate the checkout flow.', '{"days": 14, "events": ["product_added_to_cart"], "exclude": ["checkout_started"]}'::jsonb),
  ('VIP Customers', 'Customers with total historical order spending exceeding 10,000 INR.', '{"spent_min": 1000000}'::jsonb),
  ('Instagram Ad Campaigns', 'Visitors routed directly via Instagram UTM parameter links.', '{"utm_source": "instagram"}'::jsonb)
ON CONFLICT DO NOTHING;

-- Enable RLS for marketing_audiences
ALTER TABLE marketing_audiences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage audiences" ON marketing_audiences;
CREATE POLICY "Admin manage audiences"
  ON marketing_audiences FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_users))
  WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));

-- 4. Update check_db_schema_health function to track new columns and tables
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
  v_orders_utm_exists BOOLEAN;
  v_products_gtin_exists BOOLEAN;
  v_audiences_exists BOOLEAN;
  v_current_migration TEXT;
BEGIN
  -- 1. Check products columns
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'media'
  ) INTO v_products_media_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'gtin'
  ) INTO v_products_gtin_exists;

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

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'marketing_audiences'
  ) INTO v_audiences_exists;

  -- 9. Check columns
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'marketing_events' AND column_name = 'correlation_id'
  ) INTO v_events_correlation_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'utm_source'
  ) INTO v_orders_utm_exists;

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
    'orders_attribution_exists', v_orders_utm_exists,
    'products_gtin_exists', v_products_gtin_exists,
    'audiences_table_exists', v_audiences_exists,
    'current_migration_version', COALESCE(v_current_migration, 'unknown')
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
