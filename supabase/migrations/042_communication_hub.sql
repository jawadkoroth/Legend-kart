-- =============================================
-- PANTHER Ecommerce — 042 Communication Hub Schema (CRM Foundation)
-- =============================================

-- 1. Channels table
CREATE TABLE IF NOT EXISTS communication_channels (
  id TEXT PRIMARY KEY, -- 'email', 'whatsapp', 'push', 'sms'
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'sandbox', 'error')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at TIMESTAMPTZ,
  last_delivery_at TIMESTAMPTZ,
  health_score INTEGER NOT NULL DEFAULT 100 CHECK (health_score BETWEEN 0 AND 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default channels
INSERT INTO communication_channels (id, name, enabled, status, config)
VALUES
  ('email', 'Resend Email', true, 'sandbox', '{"from": "onboarding@resend.dev"}'::jsonb),
  ('whatsapp', 'Meta WhatsApp Cloud API', false, 'disconnected', '{}'::jsonb),
  ('push', 'FCM Firebase Push', true, 'sandbox', '{}'::jsonb),
  ('sms', 'SMS Gateway Placeholder', false, 'disconnected', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 2. Templates table
CREATE TABLE IF NOT EXISTS communication_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'push', 'sms')),
  subject TEXT, -- Required for email/push title
  body TEXT NOT NULL,
  variables TEXT[] NOT NULL DEFAULT '{}'::text[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default templates
INSERT INTO communication_templates (id, name, channel, subject, body, variables)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Welcome Onboarding Email', 'email', 'Welcome to Noir {{customer_name}}', 'Hey {{customer_name}},\n\nWelcome to Noir Apparel! Use code {{coupon_code}} for 10% off your next purchase.', '{customer_name,coupon_code}'::text[]),
  ('00000000-0000-0000-0000-000000000002', 'Order Dispatched Status', 'email', 'Order #{{order_number}} Dispatched', 'Your order #{{order_number}} is on the way! Tracking code: {{tracking_number}}.', '{order_number,tracking_number}'::text[])
ON CONFLICT (id) DO NOTHING;

-- 3. Campaigns table
CREATE TABLE IF NOT EXISTS communication_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  audience_filter JSONB NOT NULL DEFAULT '{}'::jsonb, -- segments, tags list
  channel TEXT NOT NULL,
  template_id UUID REFERENCES communication_templates(id) ON DELETE SET NULL,
  schedule_run_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'completed', 'cancelled')),
  revenue_paise BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Messages Table (Central Ledger)
CREATE TABLE IF NOT EXISTS communication_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customer_profiles(id) ON DELETE SET NULL,
  contact_value TEXT NOT NULL, -- Email, phone, or push token
  channel TEXT NOT NULL,
  provider TEXT NOT NULL,
  campaign_id UUID REFERENCES communication_campaigns(id) ON DELETE SET NULL,
  template_id UUID REFERENCES communication_templates(id) ON DELETE SET NULL,
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'queued', 'sent', 'delivered', 'opened', 'clicked', 'failed')),
  error_message TEXT,
  provider_response JSONB DEFAULT '{}'::jsonb,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Events timeline log
CREATE TABLE IF NOT EXISTS communication_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES communication_messages(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL CHECK (event_name IN ('created', 'queued', 'sent', 'delivered', 'opened', 'clicked', 'failed', 'retry')),
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 6. Customer Preferences
CREATE TABLE IF NOT EXISTS communication_preferences (
  customer_id UUID PRIMARY KEY REFERENCES customer_profiles(id) ON DELETE CASCADE,
  email_opt_in BOOLEAN NOT NULL DEFAULT true,
  whatsapp_opt_in BOOLEAN NOT NULL DEFAULT true,
  push_opt_in BOOLEAN NOT NULL DEFAULT true,
  sms_opt_in BOOLEAN NOT NULL DEFAULT true,
  marketing_consent BOOLEAN NOT NULL DEFAULT false,
  transactional_only BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Providers Credentials Configurations
CREATE TABLE IF NOT EXISTS communication_provider_configs (
  provider_id TEXT PRIMARY KEY, -- 'resend', 'whatsapp_meta', 'firebase'
  encrypted_secret TEXT NOT NULL,
  public_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Delivery Attempts Logs
CREATE TABLE IF NOT EXISTS communication_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES communication_messages(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  error TEXT,
  response_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Inbox Conversations
CREATE TABLE IF NOT EXISTS communication_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE UNIQUE,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unread_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 10. External Contacts Lookup
CREATE TABLE IF NOT EXISTS communication_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customer_profiles(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('email', 'phone', 'push_token')),
  value TEXT NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (type, value)
);

-- Indexes for lightning searches
CREATE INDEX IF NOT EXISTS idx_comm_messages_customer_id ON communication_messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_comm_messages_created_at ON communication_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_events_message_id ON communication_events(message_id);
CREATE INDEX IF NOT EXISTS idx_comm_events_ts ON communication_events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_comm_conversations_last_msg ON communication_conversations(last_message_at DESC);

-- Enable RLS
ALTER TABLE communication_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_delivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_contacts ENABLE ROW LEVEL SECURITY;

-- Admin access policies
CREATE POLICY "Admin manage communication_channels" ON communication_channels FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users)) WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));
CREATE POLICY "Admin manage communication_templates" ON communication_templates FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users)) WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));
CREATE POLICY "Admin manage communication_campaigns" ON communication_campaigns FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users)) WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));
CREATE POLICY "Admin manage communication_messages" ON communication_messages FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users)) WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));
CREATE POLICY "Admin manage communication_events" ON communication_events FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users)) WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));
CREATE POLICY "Admin manage communication_preferences" ON communication_preferences FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users)) WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));
CREATE POLICY "Admin manage communication_provider_configs" ON communication_provider_configs FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users)) WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));
CREATE POLICY "Admin manage communication_delivery_logs" ON communication_delivery_logs FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users)) WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));
CREATE POLICY "Admin manage communication_conversations" ON communication_conversations FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users)) WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));
CREATE POLICY "Admin manage communication_contacts" ON communication_contacts FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users)) WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));

-- Customer permissions for preferences
CREATE POLICY "Customers view own preferences" ON communication_preferences FOR SELECT USING (auth.uid() = customer_id);
CREATE POLICY "Customers update own preferences" ON communication_preferences FOR UPDATE USING (auth.uid() = customer_id) WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Customers insert own preferences" ON communication_preferences FOR INSERT WITH CHECK (auth.uid() = customer_id);

-- Create automatic preferences trigger on signup
CREATE OR REPLACE FUNCTION trg_create_customer_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO communication_preferences (customer_id, email_opt_in, whatsapp_opt_in, push_opt_in, sms_opt_in, marketing_consent, transactional_only)
  VALUES (NEW.id, true, true, true, true, false, true)
  ON CONFLICT (customer_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS create_preferences_on_profile ON customer_profiles;
CREATE TRIGGER create_preferences_on_profile
  AFTER INSERT ON customer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION trg_create_customer_preferences();

-- Seed existing profiles
INSERT INTO communication_preferences (customer_id, email_opt_in, whatsapp_opt_in, push_opt_in, sms_opt_in, marketing_consent, transactional_only)
SELECT id, true, true, true, true, false, true FROM customer_profiles
ON CONFLICT (customer_id) DO NOTHING;

-- Realtime broadcast
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'communication_channels') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.communication_channels';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'communication_templates') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.communication_templates';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'communication_campaigns') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.communication_campaigns';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'communication_messages') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.communication_messages';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'communication_events') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.communication_events';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'communication_conversations') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.communication_conversations';
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
    'current_migration_version', COALESCE(v_current_migration, 'unknown')
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
