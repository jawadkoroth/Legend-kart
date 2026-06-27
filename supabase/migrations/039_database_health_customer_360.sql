-- Update check_db_schema_health to monitor Customer 360 CDP tables
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
  
  -- Customer 360 CDP elements
  v_customer_profiles_exists BOOLEAN;
  v_customer_identity_links_exists BOOLEAN;
  v_customer_scores_exists BOOLEAN;
  v_customer_segments_exists BOOLEAN;
  v_customer_activity_summary_exists BOOLEAN;
  v_customer_preferences_exists BOOLEAN;
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

  -- 10. Check Customer 360 CDP Tables
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customer_profiles'
  ) INTO v_customer_profiles_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customer_identity_links'
  ) INTO v_customer_identity_links_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customer_scores'
  ) INTO v_customer_scores_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customer_segments'
  ) INTO v_customer_segments_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customer_activity_summary'
  ) INTO v_customer_activity_summary_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customer_preferences'
  ) INTO v_customer_preferences_exists;

  -- 11. Get latest applied migration version
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
    
    -- Customer 360 CDP fields
    'customer_profiles_exists', v_customer_profiles_exists,
    'customer_identity_links_exists', v_customer_identity_links_exists,
    'customer_scores_exists', v_customer_scores_exists,
    'customer_segments_exists', v_customer_segments_exists,
    'customer_activity_summary_exists', v_customer_activity_summary_exists,
    'customer_preferences_exists', v_customer_preferences_exists,
    
    'current_migration_version', COALESCE(v_current_migration, 'unknown')
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
