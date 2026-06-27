-- =============================================
-- PANTHER Ecommerce — 040 Workflow & Automation Engine ("Panther Flow")
-- =============================================

-- 1. Extend customer_profiles with tags and applied_coupons
ALTER TABLE customer_profiles
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS applied_coupons TEXT[] NOT NULL DEFAULT '{}'::text[];

-- 2. Create workflows table
CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  definition JSONB NOT NULL, -- Stores structural graph (nodes, edges)
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create workflow_executions table
CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('started', 'running', 'completed', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  retry_count INTEGER NOT NULL DEFAULT 0,
  correlation_id TEXT,
  customer_id UUID REFERENCES customer_profiles(id) ON DELETE SET NULL,
  trigger_source TEXT,
  trigger_payload JSONB,
  logs JSONB[] NOT NULL DEFAULT '{}'::jsonb[], -- Array of execution step logs
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_workflows_trigger_type ON workflows(trigger_type);
CREATE INDEX IF NOT EXISTS idx_workflows_is_active ON workflows(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_customer_id ON workflow_executions(customer_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_created_at ON workflow_executions(created_at DESC);

-- 5. Enable Row-Level Security (RLS)
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;

-- 6. Add Admin Policies
DROP POLICY IF EXISTS "Admin manage workflows" ON workflows;
CREATE POLICY "Admin manage workflows"
  ON workflows FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_users))
  WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));

DROP POLICY IF EXISTS "Admin manage executions" ON workflow_executions;
CREATE POLICY "Admin manage executions"
  ON workflow_executions FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_users))
  WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));

-- 7. Add Tables to Realtime Publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname    = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'workflows'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.workflows';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname    = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'workflow_executions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_executions';
  END IF;
END
$$;

-- 8. Update check_db_schema_health database function to monitor workflows schema
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
  v_current_migration TEXT;
BEGIN
  -- Check column products.media
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'media'
  ) INTO v_products_media_exists;

  -- Check table product_story_sections
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'product_story_sections'
  ) INTO v_story_sections_exists;

  -- Check table product_coupons
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'product_coupons'
  ) INTO v_product_coupons_exists;

  -- Check table admin_fcm_tokens
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'admin_fcm_tokens'
  ) INTO v_admin_fcm_tokens_exists;

  -- Check return triggers
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_return_requests_push'
  ) INTO v_return_trigger_exists;

  -- Check notes trigger
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_admin_notes_push'
  ) INTO v_notes_trigger_exists;

  -- Check shipment trigger
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_shipment_status_push'
  ) INTO v_shipment_trigger_exists;

  -- Check marketing tables
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

  -- Check workflow tables
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'workflows'
  ) INTO v_workflows_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'workflow_executions'
  ) INTO v_workflow_executions_exists;

  -- Get latest applied migration version
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
    'current_migration_version', COALESCE(v_current_migration, 'unknown')
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
