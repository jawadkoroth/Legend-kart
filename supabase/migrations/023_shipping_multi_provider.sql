-- =============================================
-- NOIR Ecommerce — 023 Multi-provider shipping
--
-- Additive only. Zero destructive changes.
-- Safe to re-run (all DDL uses IF NOT EXISTS /
-- ON CONFLICT DO NOTHING / DROP ... IF EXISTS).
--
-- What lands here:
--   1. shipping_providers      — per-courier config + credentials +
--                                pickup address + token-refresh fields
--   2. shipments               — per-attempt shipment record with
--                                idempotency (client_request_id UNIQUE)
--   3. shipment_status_history — append-only audit trail of every
--                                status transition
--   4. shipping_webhook_events — raw inbound webhook dedup store
--   5. shipping_pricing_rules  — NOIR's pricing policy (singleton)
--   6. cod_rules               — NOIR's COD policy (singleton)
--   7. activate_shipping_provider(UUID) RPC
--   8. upsert_shipment_idempotent(...)  RPC
--   9. Backfill from existing shipping_settings / orders
--
-- Existing tables (shipping_settings, orders, order_items) are
-- NOT altered — every existing read/write path continues to work
-- unchanged. Legacy fields (orders.tracking_id, orders.label_url,
-- orders.shipping_provider) are preserved as-is.
-- =============================================

-- ---------------------------------------------------------------
-- 0. Shared updated_at trigger function (reuse existing if present)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------
-- 1. shipping_providers
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipping_providers (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name                    TEXT        NOT NULL
                            CHECK (name IN ('delhivery', 'shiprocket')),
  is_active               BOOLEAN     NOT NULL DEFAULT FALSE,
  environment             TEXT        NOT NULL DEFAULT 'sandbox'
                            CHECK (environment IN ('sandbox', 'live')),

  -- Credentials (plain TEXT — Vault migration tracked separately)
  api_url                 TEXT,
  api_key                 TEXT,
  api_secret              TEXT,
  webhook_secret          TEXT,

  -- Token-refresh (Shiprocket and future session-token providers)
  token                   TEXT,
  token_expires_at        TIMESTAMPTZ,
  auth_email              TEXT,
  auth_password_encrypted TEXT,       -- placeholder; Vault replaces this in a future migration

  -- Auth health observability
  last_auth_ok            BOOLEAN,
  last_auth_at            TIMESTAMPTZ,
  last_auth_error         TEXT,

  -- Pickup address embedded inside provider
  pickup_name             TEXT,
  pickup_phone            TEXT,
  pickup_gstin            TEXT,
  pickup_line1            TEXT,
  pickup_line2            TEXT,
  pickup_city             TEXT,
  pickup_state            TEXT,
  pickup_pincode          TEXT,

  -- Feature flags
  features_cod            BOOLEAN     NOT NULL DEFAULT TRUE,
  features_reverse        BOOLEAN     NOT NULL DEFAULT FALSE,
  features_insurance      BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Connection test results
  last_test_at            TIMESTAMPTZ,
  last_test_ok            BOOLEAN,
  last_test_error         TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (name)
);

-- Exactly one active provider at a time — enforced at the DB level.
-- Any INSERT/UPDATE that would result in two active rows raises a
-- unique_violation; this cannot be bypassed by application code.
CREATE UNIQUE INDEX IF NOT EXISTS shipping_providers_one_active
  ON shipping_providers (is_active)
  WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS trg_shipping_providers_updated_at ON shipping_providers;
CREATE TRIGGER trg_shipping_providers_updated_at
  BEFORE UPDATE ON shipping_providers
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- ---------------------------------------------------------------
-- 2. shipments
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipments (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Links
  order_id             UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider_id          UUID        NOT NULL REFERENCES shipping_providers(id) ON DELETE RESTRICT,
  provider_name        TEXT        NOT NULL,   -- denorm: self-describing if provider deactivated

  -- Attempt tracking (re-ship increments attempt_number)
  attempt_number       INTEGER     NOT NULL DEFAULT 1,

  -- Idempotency — THE only legal insert path (see upsert_shipment_idempotent RPC)
  client_request_id    UUID        NOT NULL,

  -- Origin
  created_via          TEXT        NOT NULL DEFAULT 'auto'
                         CHECK (created_via IN ('auto', 'manual')),

  -- Canonical status machine
  -- Provider-specific statuses are mapped INTO these by the adapter layer
  status               TEXT        NOT NULL DEFAULT 'pending'
                         CHECK (status IN (
                           'pending', 'processing', 'shipment_created',
                           'picked_up', 'in_transit', 'out_for_delivery',
                           'delivered', 'failed', 'returned', 'cancelled'
                         )),
  status_detail        TEXT,
  last_provider_event_at TIMESTAMPTZ,

  -- Provider identifiers
  tracking_id          TEXT,
  label_url            TEXT,
  external_shipment_id TEXT,

  -- Shipment parameters
  payment_method       TEXT        NOT NULL DEFAULT 'prepaid'
                         CHECK (payment_method IN ('cod', 'prepaid')),
  cod_amount_paise     INTEGER,
  weight_grams         INTEGER,

  -- Raw provider response (for support + debugging)
  raw_create_response  JSONB,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (client_request_id)
);

CREATE INDEX IF NOT EXISTS idx_shipments_order_id
  ON shipments(order_id);

CREATE INDEX IF NOT EXISTS idx_shipments_tracking_id
  ON shipments(tracking_id)
  WHERE tracking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shipments_status
  ON shipments(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_shipments_provider_id
  ON shipments(provider_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_shipments_updated_at ON shipments;
CREATE TRIGGER trg_shipments_updated_at
  BEFORE UPDATE ON shipments
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- ---------------------------------------------------------------
-- 3. shipment_status_history (append-only — never UPDATE or DELETE)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipment_status_history (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  shipment_id       UUID        NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,

  -- The transition recorded
  previous_status   TEXT,       -- NULL for the initial synthetic row
  next_status       TEXT        NOT NULL,

  -- Where this transition came from
  source            TEXT        NOT NULL DEFAULT 'system'
                      CHECK (source IN ('webhook', 'admin', 'system', 'job')),

  -- Provider-supplied event context (webhook payload slice, API response, etc.)
  provider_payload  JSONB,

  -- Free-form notes (admin manual overrides, error context, etc.)
  notes             TEXT,

  -- When the transition happened at the provider (may differ from created_at)
  provider_event_at TIMESTAMPTZ,

  -- Who triggered it (NULL for system/job/webhook)
  actor_id          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()

  -- NOTE: updated_at is included for schema consistency but application
  -- code MUST treat this table as append-only — rows are never updated
  -- or deleted from application logic.
);

CREATE INDEX IF NOT EXISTS idx_shipment_status_history_shipment_id
  ON shipment_status_history(shipment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shipment_status_history_source
  ON shipment_status_history(source, created_at DESC);

DROP TRIGGER IF EXISTS trg_shipment_status_history_updated_at ON shipment_status_history;
CREATE TRIGGER trg_shipment_status_history_updated_at
  BEFORE UPDATE ON shipment_status_history
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- ---------------------------------------------------------------
-- 4. shipping_webhook_events
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipping_webhook_events (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dedup key — DB-level idempotency for provider retries
  provider_name       TEXT        NOT NULL,
  external_event_id   TEXT        NOT NULL,

  -- Link to resolved shipment (populated by the processing job)
  linked_shipment_id  UUID        REFERENCES shipments(id) ON DELETE SET NULL,
  tracking_id         TEXT,

  -- Event data
  event_type          TEXT,
  payload             JSONB       NOT NULL DEFAULT '{}'::jsonb,

  -- Processing state
  received_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at        TIMESTAMPTZ,          -- NULL = pending processing
  error               TEXT,                 -- last processing error if any
  retry_count         INTEGER     NOT NULL DEFAULT 0,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (provider_name, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_shipping_webhook_events_pending
  ON shipping_webhook_events(received_at ASC)
  WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shipping_webhook_events_tracking
  ON shipping_webhook_events(tracking_id)
  WHERE tracking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shipping_webhook_events_provider
  ON shipping_webhook_events(provider_name, received_at DESC);

DROP TRIGGER IF EXISTS trg_shipping_webhook_events_updated_at ON shipping_webhook_events;
CREATE TRIGGER trg_shipping_webhook_events_updated_at
  BEFORE UPDATE ON shipping_webhook_events
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- ---------------------------------------------------------------
-- 5. shipping_pricing_rules (singleton)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipping_pricing_rules (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  free_shipping_threshold_paise INTEGER     NOT NULL DEFAULT 0,
  default_charge_paise          INTEGER     NOT NULL DEFAULT 0,

  -- Fallback weight when products.weight_grams IS NULL (added in PR 4)
  default_weight_grams          INTEGER     NOT NULL DEFAULT 500,

  -- Express shipping
  express_enabled               BOOLEAN     NOT NULL DEFAULT FALSE,
  express_charge_paise          INTEGER     NOT NULL DEFAULT 0,

  -- Regional / weight-slab pricing (JSONB scaffold; promoted to columns when rules stabilise)
  regional_rules                JSONB       NOT NULL DEFAULT '[]'::jsonb,
  weight_slabs                  JSONB       NOT NULL DEFAULT '[]'::jsonb,

  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_shipping_pricing_rules_updated_at ON shipping_pricing_rules;
CREATE TRIGGER trg_shipping_pricing_rules_updated_at
  BEFORE UPDATE ON shipping_pricing_rules
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- ---------------------------------------------------------------
-- 6. cod_rules (singleton)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cod_rules (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  enabled               BOOLEAN     NOT NULL DEFAULT TRUE,
  fee_paise             INTEGER     NOT NULL DEFAULT 0,
  min_order_paise       INTEGER     NOT NULL DEFAULT 0,
  max_order_paise       INTEGER,                            -- NULL = no upper limit

  blocked_pincodes      TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  blocked_states        TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  prepaid_only_states   TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_cod_rules_updated_at ON cod_rules;
CREATE TRIGGER trg_cod_rules_updated_at
  BEFORE UPDATE ON cod_rules
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- ---------------------------------------------------------------
-- 7. RLS policies
-- ---------------------------------------------------------------

-- shipping_providers
ALTER TABLE shipping_providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage shipping_providers" ON shipping_providers;
CREATE POLICY "Admin manage shipping_providers" ON shipping_providers FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_users));

-- shipments
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage shipments" ON shipments;
CREATE POLICY "Admin manage shipments" ON shipments FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_users));
DROP POLICY IF EXISTS "User read own shipments" ON shipments;
CREATE POLICY "User read own shipments" ON shipments FOR SELECT
  USING (
    order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
  );

-- shipment_status_history
ALTER TABLE shipment_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage shipment_status_history" ON shipment_status_history;
CREATE POLICY "Admin manage shipment_status_history" ON shipment_status_history FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_users));
DROP POLICY IF EXISTS "User read own shipment_status_history" ON shipment_status_history;
CREATE POLICY "User read own shipment_status_history" ON shipment_status_history FOR SELECT
  USING (
    shipment_id IN (
      SELECT s.id FROM shipments s
      JOIN orders o ON o.id = s.order_id
      WHERE o.user_id = auth.uid()
    )
  );

-- shipping_webhook_events (admin only — raw provider data)
ALTER TABLE shipping_webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage shipping_webhook_events" ON shipping_webhook_events;
CREATE POLICY "Admin manage shipping_webhook_events" ON shipping_webhook_events FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_users));

-- shipping_pricing_rules
ALTER TABLE shipping_pricing_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage shipping_pricing_rules" ON shipping_pricing_rules;
CREATE POLICY "Admin manage shipping_pricing_rules" ON shipping_pricing_rules FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_users));

-- cod_rules
ALTER TABLE cod_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage cod_rules" ON cod_rules;
CREATE POLICY "Admin manage cod_rules" ON cod_rules FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_users));

-- ---------------------------------------------------------------
-- 8. activate_shipping_provider(p_provider_id UUID)
--
-- Atomically sets exactly one provider active, deactivating all
-- others. The partial unique index is the DB-level hard guarantee;
-- this RPC is the canonical safe path for application code.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION activate_shipping_provider(
  p_provider_id UUID
) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  -- Deactivate all others first so the partial unique index is never
  -- violated during the two-step update.
  UPDATE shipping_providers
     SET is_active  = FALSE,
         updated_at = NOW()
   WHERE id <> p_provider_id
     AND is_active = TRUE;

  UPDATE shipping_providers
     SET is_active  = TRUE,
         updated_at = NOW()
   WHERE id = p_provider_id;
END;
$$;

GRANT EXECUTE ON FUNCTION activate_shipping_provider(UUID) TO service_role;

-- ---------------------------------------------------------------
-- 9. upsert_shipment_idempotent(...)
--
-- THE only legal insert path for shipment rows. On conflict on
-- client_request_id it returns the existing row unchanged — so
-- retries and double-clicks are safe.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_shipment_idempotent(
  p_client_request_id  UUID,
  p_order_id           UUID,
  p_provider_id        UUID,
  p_provider_name      TEXT,
  p_attempt_number     INTEGER  DEFAULT 1,
  p_created_via        TEXT     DEFAULT 'auto',
  p_payment_method     TEXT     DEFAULT 'prepaid',
  p_cod_amount_paise   INTEGER  DEFAULT NULL,
  p_weight_grams       INTEGER  DEFAULT NULL,
  p_raw_create_response JSONB   DEFAULT NULL
) RETURNS shipments
LANGUAGE plpgsql AS $$
DECLARE
  v_row shipments;
BEGIN
  INSERT INTO shipments (
    client_request_id,
    order_id,
    provider_id,
    provider_name,
    attempt_number,
    created_via,
    status,
    payment_method,
    cod_amount_paise,
    weight_grams,
    raw_create_response
  ) VALUES (
    p_client_request_id,
    p_order_id,
    p_provider_id,
    p_provider_name,
    p_attempt_number,
    p_created_via,
    'pending',
    p_payment_method,
    p_cod_amount_paise,
    p_weight_grams,
    p_raw_create_response
  )
  ON CONFLICT (client_request_id) DO NOTHING
  RETURNING * INTO v_row;

  -- If DO NOTHING fired, fetch the existing row.
  IF v_row.id IS NULL THEN
    SELECT * INTO v_row
      FROM shipments
     WHERE client_request_id = p_client_request_id
     LIMIT 1;
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_shipment_idempotent(
  UUID, UUID, UUID, TEXT, INTEGER, TEXT, TEXT, INTEGER, INTEGER, JSONB
) TO service_role;

-- ---------------------------------------------------------------
-- 10. Backfill — idempotent (NOT EXISTS / ON CONFLICT DO NOTHING)
-- ---------------------------------------------------------------

-- 10a. shipping_providers ← from shipping_settings singleton
INSERT INTO shipping_providers (
  name,
  is_active,
  environment,
  api_url,
  api_key,
  pickup_name,
  pickup_phone,
  pickup_line1,
  pickup_line2,
  pickup_city,
  pickup_state,
  pickup_pincode,
  features_cod
)
SELECT
  COALESCE(ss.provider_name, 'delhivery'),
  COALESCE(ss.provider_enabled, FALSE),
  'sandbox',                                 -- default; admin upgrades to 'live' in UI
  ss.api_url,
  ss.api_key,
  ss.pickup_name,
  ss.pickup_phone,
  ss.pickup_address_line1,
  ss.pickup_address_line2,
  ss.pickup_city,
  ss.pickup_state,
  ss.pickup_pincode,
  COALESCE(ss.cod_enabled, TRUE)
FROM shipping_settings ss
WHERE NOT EXISTS (SELECT 1 FROM shipping_providers)
LIMIT 1;

-- 10b. shipping_pricing_rules ← from shipping_settings
INSERT INTO shipping_pricing_rules (
  free_shipping_threshold_paise,
  default_charge_paise,
  default_weight_grams
)
SELECT
  COALESCE(ss.free_shipping_threshold_paise, 0),
  COALESCE(ss.default_shipping_charge_paise, 0),
  500
FROM shipping_settings ss
WHERE NOT EXISTS (SELECT 1 FROM shipping_pricing_rules)
LIMIT 1;

-- 10c. cod_rules ← from shipping_settings
INSERT INTO cod_rules (
  enabled,
  fee_paise
)
SELECT
  COALESCE(ss.cod_enabled, TRUE),
  COALESCE(ss.cod_fee_paise, 0)
FROM shipping_settings ss
WHERE NOT EXISTS (SELECT 1 FROM cod_rules)
LIMIT 1;

-- 10d. shipments ← one row per order with a non-null tracking_id
--
-- Status mapping from order_status → canonical shipment status:
--   delivered  → delivered
--   shipped    → in_transit
--   cancelled  → cancelled
--   *          → shipment_created
--
-- client_request_id is seeded from the order's own UUID — stable
-- and unique across any re-run of this migration.
WITH provider_row AS (
  SELECT id, name FROM shipping_providers LIMIT 1
)
INSERT INTO shipments (
  client_request_id,
  order_id,
  provider_id,
  provider_name,
  attempt_number,
  created_via,
  status,
  tracking_id,
  label_url,
  payment_method,
  created_at,
  updated_at
)
SELECT
  o.id,               -- stable synthetic client_request_id
  o.id,
  p.id,
  p.name,
  1,
  'auto',
  CASE o.order_status
    WHEN 'delivered'  THEN 'delivered'
    WHEN 'shipped'    THEN 'in_transit'
    WHEN 'cancelled'  THEN 'cancelled'
    ELSE                   'shipment_created'
  END,
  o.tracking_id,
  o.label_url,
  COALESCE(o.payment_method, 'prepaid'),
  o.created_at,
  o.updated_at
FROM orders o
CROSS JOIN provider_row p
WHERE o.tracking_id IS NOT NULL
ON CONFLICT (client_request_id) DO NOTHING;

-- 10e. shipment_status_history ← one synthetic 'system' row per
--      backfilled shipment, recording the inferred initial state.
INSERT INTO shipment_status_history (
  shipment_id,
  previous_status,
  next_status,
  source,
  notes,
  created_at,
  updated_at
)
SELECT
  s.id,
  NULL,
  s.status,
  'system',
  'Backfilled from orders.tracking_id by migration 023',
  s.created_at,
  s.created_at
FROM shipments s
WHERE NOT EXISTS (
  SELECT 1 FROM shipment_status_history h WHERE h.shipment_id = s.id
);

-- ---------------------------------------------------------------
-- End of migration 023
-- ---------------------------------------------------------------
