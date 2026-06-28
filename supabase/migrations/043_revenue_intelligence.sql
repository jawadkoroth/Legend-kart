-- =============================================
-- PANTHER Ecommerce — 043 Revenue Intelligence & Attribution Engine
-- =============================================

-- 1. Attribution settings configuration table
CREATE TABLE IF NOT EXISTS attribution_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default global attribution model
INSERT INTO attribution_settings (key, value)
VALUES ('attribution_model', 'last_touch')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 2. Marketing ad spend records
CREATE TABLE IF NOT EXISTS attribution_spend (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL CHECK (channel IN ('instagram', 'facebook', 'google', 'email', 'sms', 'organic', 'direct', 'referral', 'other')),
  campaign TEXT NOT NULL DEFAULT 'generic',
  spend_paise BIGINT NOT NULL DEFAULT 0 CHECK (spend_paise >= 0),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel, campaign, date)
);

-- Seed default spend profiles for analytics demonstration
INSERT INTO attribution_spend (channel, campaign, spend_paise, date)
VALUES
  ('instagram', 'summer_drop_2026', 1500000, CURRENT_DATE - INTERVAL '1 day'),
  ('google', 'brand_search_keywords', 800000, CURRENT_DATE - INTERVAL '1 day'),
  ('facebook', 'retargeting_cohort_v3', 1200000, CURRENT_DATE - INTERVAL '1 day'),
  ('instagram', 'summer_drop_2026', 1600000, CURRENT_DATE),
  ('google', 'brand_search_keywords', 950000, CURRENT_DATE),
  ('facebook', 'retargeting_cohort_v3', 1400000, CURRENT_DATE)
ON CONFLICT (channel, campaign, date) DO NOTHING;

-- 3. Executive alerts log
CREATE TABLE IF NOT EXISTS admin_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('roas_drop', 'conversion_drop', 'sales_spike', 'inventory_low', 'provider_disconnect', 'workflow_failure', 'revenue_anomaly')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('unread', 'read')) DEFAULT 'unread',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default admin alerts for verification
INSERT INTO admin_alerts (type, title, body)
VALUES
  ('inventory_low', 'Inventory Warning: Classic Black Hoodie (L)', 'Stock level has dropped below the threshold. Current quantity: 3.'),
  ('roas_drop', 'Facebook Ad ROAS Drop Detected', 'ROAS for retargeting_cohort_v3 dropped to 1.8x. Immediate adjustment recommended.'),
  ('sales_spike', 'Revenue Anomaly: High Sales Surge', 'Sales volume increased by 350% in the last 2 hours. Traffic checks recommended.')
ON CONFLICT (id) DO NOTHING;

-- RLS Configuration
ALTER TABLE attribution_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE attribution_spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage attribution_settings" ON attribution_settings FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users)) WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));
CREATE POLICY "Admin manage attribution_spend" ON attribution_spend FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users)) WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));
CREATE POLICY "Admin manage admin_alerts" ON admin_alerts FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users)) WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));

-- Realtime Broadcasts
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'attribution_settings') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.attribution_settings';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'attribution_spend') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.attribution_spend';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'admin_alerts') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_alerts';
  END IF;
END
$$;

-- Upgrade check_db_schema_health
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
  v_workflows_exists BOOLEAN;
  v_workflow_executions_exists BOOLEAN;
  v_comm_messages_exists BOOLEAN;
  v_comm_templates_exists BOOLEAN;
  v_comm_preferences_exists BOOLEAN;
  v_attr_settings_exists BOOLEAN;
  v_attr_spend_exists BOOLEAN;
  v_admin_alerts_exists BOOLEAN;
  v_current_migration TEXT;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'media') INTO v_products_media_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_story_sections') INTO v_story_sections_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_coupons') INTO v_product_coupons_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_fcm_tokens') INTO v_admin_fcm_tokens_exists;
  SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_return_requests_push') INTO v_return_trigger_exists;
  SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_admin_notes_push') INTO v_notes_trigger_exists;
  SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_shipment_status_push') INTO v_shipment_trigger_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketing_events') INTO v_marketing_events_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketing_providers') INTO v_marketing_providers_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketing_consent') INTO v_marketing_consent_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workflows') INTO v_workflows_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workflow_executions') INTO v_workflow_executions_exists;
  
  -- Comm Hub
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'communication_messages') INTO v_comm_messages_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'communication_templates') INTO v_comm_templates_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'communication_preferences') INTO v_comm_preferences_exists;

  -- Revenue Intel
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'attribution_settings') INTO v_attr_settings_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'attribution_spend') INTO v_attr_spend_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_alerts') INTO v_admin_alerts_exists;

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
    'workflows_exists', v_workflows_exists,
    'workflow_executions_exists', v_workflow_executions_exists,
    'communication_messages_exists', v_comm_messages_exists,
    'communication_templates_exists', v_comm_templates_exists,
    'communication_preferences_exists', v_comm_preferences_exists,
    'attribution_settings_exists', v_attr_settings_exists,
    'attribution_spend_exists', v_attr_spend_exists,
    'admin_alerts_exists', v_admin_alerts_exists,
    'current_migration_version', COALESCE(v_current_migration, 'unknown')
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
