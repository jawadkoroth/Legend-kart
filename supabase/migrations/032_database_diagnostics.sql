-- ===============================================================
-- PANTHER Ecommerce — 032 Database Diagnostics & Health
-- ===============================================================

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

  -- 8. Get latest applied migration version from Supabase schema migrations
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
    'current_migration_version', COALESCE(v_current_migration, 'unknown')
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
