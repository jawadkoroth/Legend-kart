-- ===================================================
-- PANTHER Customer 360 (CDP) Schema Migration
-- ===================================================

-- 1. Create Core Profiles
CREATE TABLE IF NOT EXISTS customer_profiles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        UNIQUE,
  phone       TEXT,
  name        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create Identity Resolution Links
CREATE TABLE IF NOT EXISTS customer_identity_links (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID        NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  identity_type   TEXT        NOT NULL CHECK (identity_type IN ('anonymous_id', 'user_id', 'email', 'phone', 'gclid', 'fbclid', 'device_id')),
  identity_value  TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (identity_type, identity_value)
);

CREATE INDEX IF NOT EXISTS idx_identity_links_customer ON customer_identity_links(customer_id);

-- 3. Create Customer Scores Table
CREATE TABLE IF NOT EXISTS customer_scores (
  customer_id               UUID        PRIMARY KEY REFERENCES customer_profiles(id) ON DELETE CASCADE,
  ltv_paise                 BIGINT      NOT NULL DEFAULT 0,
  aov_paise                 BIGINT      NOT NULL DEFAULT 0,
  purchase_frequency        NUMERIC     NOT NULL DEFAULT 0,
  total_orders              INTEGER     NOT NULL DEFAULT 0,
  total_returns             INTEGER     NOT NULL DEFAULT 0,
  total_exchanges           INTEGER     NOT NULL DEFAULT 0,
  wishlist_count            INTEGER     NOT NULL DEFAULT 0,
  recently_viewed_count     INTEGER     NOT NULL DEFAULT 0,
  abandoned_cart_count      INTEGER     NOT NULL DEFAULT 0,
  coupon_usage_count        INTEGER     NOT NULL DEFAULT 0,
  preferred_category        TEXT,
  preferred_brand           TEXT,
  preferred_device          TEXT,
  preferred_payment_method  TEXT,
  preferred_shipping_method  TEXT,
  utm_source                TEXT,
  utm_campaign              TEXT,
  first_active              TIMESTAMPTZ,
  last_active               TIMESTAMPTZ,
  engagement_score          INTEGER     NOT NULL DEFAULT 0,
  predicted_value_paise     BIGINT      NOT NULL DEFAULT 0,
  churn_risk_score          INTEGER     NOT NULL DEFAULT 0,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create Preferences Table
CREATE TABLE IF NOT EXISTS customer_preferences (
  customer_id       UUID        PRIMARY KEY REFERENCES customer_profiles(id) ON DELETE CASCADE,
  opt_in_email      BOOLEAN     NOT NULL DEFAULT true,
  opt_in_sms        BOOLEAN     NOT NULL DEFAULT true,
  opt_in_whatsapp   BOOLEAN     NOT NULL DEFAULT true,
  opt_in_push       BOOLEAN     NOT NULL DEFAULT true,
  categories        TEXT[]      NOT NULL DEFAULT '{}'::TEXT[],
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Create Segments Table
CREATE TABLE IF NOT EXISTS customer_segments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID        NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  segment_name  TEXT        NOT NULL,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, segment_name)
);

CREATE INDEX IF NOT EXISTS idx_customer_segments_name ON customer_segments(segment_name);

-- 6. Create Daily Activity Summary
CREATE TABLE IF NOT EXISTS customer_activity_summary (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID        NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  activity_type   TEXT        NOT NULL,
  activity_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  count           INTEGER     NOT NULL DEFAULT 1,
  UNIQUE (customer_id, activity_type, activity_date)
);

-- RLS setup
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_identity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_activity_summary ENABLE ROW LEVEL SECURITY;

-- Simple Admin policies
CREATE POLICY "Admin manage profiles" ON customer_profiles FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users));
CREATE POLICY "Admin manage identity" ON customer_identity_links FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users));
CREATE POLICY "Admin manage scores" ON customer_scores FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users));
CREATE POLICY "Admin manage preferences" ON customer_preferences FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users));
CREATE POLICY "Admin manage segments" ON customer_segments FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users));
CREATE POLICY "Admin manage activity" ON customer_activity_summary FOR ALL USING (auth.uid() IN (SELECT id FROM admin_users));

-- Profile Merge Engine
CREATE OR REPLACE FUNCTION merge_customer_profiles(p_target_id UUID, p_source_id UUID)
RETURNS VOID AS $$
BEGIN
  IF p_target_id = p_source_id THEN
    RETURN;
  END IF;

  -- 1. Resolve conflicts for customer_identity_links
  DELETE FROM customer_identity_links
  WHERE customer_id = p_source_id
    AND (identity_type, identity_value) IN (
      SELECT identity_type, identity_value 
      FROM customer_identity_links 
      WHERE customer_id = p_target_id
    );

  UPDATE customer_identity_links
  SET customer_id = p_target_id
  WHERE customer_id = p_source_id;

  -- 2. Resolve conflicts for customer_activity_summary
  UPDATE customer_activity_summary t
  SET count = t.count + s.count
  FROM customer_activity_summary s
  WHERE t.customer_id = p_target_id
    AND s.customer_id = p_source_id
    AND t.activity_type = s.activity_type
    AND t.activity_date = s.activity_date;

  DELETE FROM customer_activity_summary
  WHERE customer_id = p_source_id
    AND (activity_type, activity_date) IN (
      SELECT activity_type, activity_date
      FROM customer_activity_summary
      WHERE customer_id = p_target_id
    );

  UPDATE customer_activity_summary
  SET customer_id = p_target_id
  WHERE customer_id = p_source_id;

  -- 3. Resolve conflicts for customer_segments
  DELETE FROM customer_segments
  WHERE customer_id = p_source_id
    AND segment_name IN (
      SELECT segment_name
      FROM customer_segments
      WHERE customer_id = p_target_id
    );

  UPDATE customer_segments
  SET customer_id = p_target_id
  WHERE customer_id = p_source_id;

  -- 4. Merge scores
  INSERT INTO customer_scores (
    customer_id, ltv_paise, total_orders, wishlist_count, recently_viewed_count, engagement_score, last_active, first_active
  )
  SELECT 
    p_target_id,
    COALESCE(s.ltv_paise, 0),
    COALESCE(s.total_orders, 0),
    COALESCE(s.wishlist_count, 0),
    COALESCE(s.recently_viewed_count, 0),
    COALESCE(s.engagement_score, 0),
    s.last_active,
    s.first_active
  FROM customer_scores s WHERE s.customer_id = p_source_id
  ON CONFLICT (customer_id) DO UPDATE SET
    ltv_paise = customer_scores.ltv_paise + EXCLUDED.ltv_paise,
    total_orders = customer_scores.total_orders + EXCLUDED.total_orders,
    wishlist_count = customer_scores.wishlist_count + EXCLUDED.wishlist_count,
    recently_viewed_count = customer_scores.recently_viewed_count + EXCLUDED.recently_viewed_count,
    engagement_score = customer_scores.engagement_score + EXCLUDED.engagement_score,
    last_active = GREATEST(customer_scores.last_active, EXCLUDED.last_active),
    first_active = LEAST(customer_scores.first_active, EXCLUDED.first_active);

  -- 5. Delete source profile
  DELETE FROM customer_profiles WHERE id = p_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Identity Resolution Engine
CREATE OR REPLACE FUNCTION resolve_customer_identity(
  p_identity_type TEXT,
  p_identity_value TEXT,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_name TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_customer_id UUID := NULL;
  v_matching_email_id UUID := NULL;
  v_matching_phone_id UUID := NULL;
BEGIN
  -- Validate input value
  IF p_identity_value IS NULL OR p_identity_value = '' THEN
    RETURN NULL;
  END IF;

  -- 1. Try to find existing link
  SELECT customer_id INTO v_customer_id
  FROM customer_identity_links
  WHERE identity_type = p_identity_type AND identity_value = p_identity_value
  LIMIT 1;

  IF v_customer_id IS NOT NULL THEN
    -- Refresh name/email/phone on the profile if missing
    UPDATE customer_profiles
    SET 
      email = COALESCE(email, p_email),
      phone = COALESCE(phone, p_phone),
      name = COALESCE(name, p_name),
      updated_at = now()
    WHERE id = v_customer_id;
    
    RETURN v_customer_id;
  END IF;

  -- 2. Check if email matches another profile
  IF p_email IS NOT NULL AND p_email <> '' THEN
    SELECT id INTO v_matching_email_id FROM customer_profiles WHERE email = p_email LIMIT 1;
  END IF;

  -- 3. Check if phone matches another profile
  IF p_phone IS NOT NULL AND p_phone <> '' THEN
    SELECT id INTO v_matching_phone_id FROM customer_profiles WHERE phone = p_phone LIMIT 1;
  END IF;

  -- 4. Identity Stitching / Merging paths
  IF v_matching_email_id IS NOT NULL AND v_matching_phone_id IS NOT NULL AND v_matching_email_id <> v_matching_phone_id THEN
    -- Email and Phone match different profiles! Merge them.
    PERFORM merge_customer_profiles(v_matching_email_id, v_matching_phone_id);
    v_customer_id := v_matching_email_id;
  ELSIF v_matching_email_id IS NOT NULL THEN
    v_customer_id := v_matching_email_id;
  ELSIF v_matching_phone_id IS NOT NULL THEN
    v_customer_id := v_matching_phone_id;
  END IF;

  -- 5. If still no profile, create a new one
  IF v_customer_id IS NULL THEN
    INSERT INTO customer_profiles (email, phone, name)
    VALUES (p_email, p_phone, p_name)
    RETURNING id INTO v_customer_id;

    -- Initialize scores & preferences
    INSERT INTO customer_scores (customer_id, first_active, last_active)
    VALUES (v_customer_id, now(), now()) ON CONFLICT DO NOTHING;

    INSERT INTO customer_preferences (customer_id)
    VALUES (v_customer_id) ON CONFLICT DO NOTHING;
  END IF;

  -- 6. Link this new identity to resolved profile
  INSERT INTO customer_identity_links (customer_id, identity_type, identity_value)
  VALUES (v_customer_id, p_identity_type, p_identity_value)
  ON CONFLICT (identity_type, identity_value) DO NOTHING;

  RETURN v_customer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recompute Scores and Segments
CREATE OR REPLACE FUNCTION sync_customer_scores_and_segments(p_customer_id UUID)
RETURNS VOID AS $$
DECLARE
  v_total_revenue BIGINT := 0;
  v_order_count INTEGER := 0;
  v_avg_order_value BIGINT := 0;
  v_preferred_pm TEXT := NULL;
  v_preferred_cat TEXT := NULL;
  v_latest_utm_source TEXT := NULL;
  v_latest_utm_campaign TEXT := NULL;
BEGIN
  -- 1. Query order statistics
  SELECT 
    COALESCE(SUM(total_paise), 0),
    COUNT(id)
  INTO v_total_revenue, v_order_count
  FROM orders
  WHERE customer->>'email' = (SELECT email FROM customer_profiles WHERE id = p_customer_id)
     OR user_id IN (SELECT identity_value::UUID FROM customer_identity_links WHERE customer_id = p_customer_id AND identity_type = 'user_id');

  IF v_order_count > 0 THEN
    v_avg_order_value := v_total_revenue / v_order_count;
  END IF;

  -- 2. Query preferred payment method
  SELECT payment_method INTO v_preferred_pm
  FROM orders
  WHERE customer->>'email' = (SELECT email FROM customer_profiles WHERE id = p_customer_id)
     OR user_id IN (SELECT identity_value::UUID FROM customer_identity_links WHERE customer_id = p_customer_id AND identity_type = 'user_id')
  GROUP BY payment_method
  ORDER BY COUNT(id) DESC
  LIMIT 1;

  -- 3. Query preferred category
  SELECT p.category INTO v_preferred_cat
  FROM orders o
  JOIN products p ON o.product_id = p.id
  WHERE o.customer->>'email' = (SELECT email FROM customer_profiles WHERE id = p_customer_id)
     OR o.user_id IN (SELECT identity_value::UUID FROM customer_identity_links WHERE customer_id = p_customer_id AND identity_type = 'user_id')
  GROUP BY p.category
  ORDER BY COUNT(o.id) DESC
  LIMIT 1;

  -- 4. Query UTM values from last order
  SELECT utm_source, utm_campaign INTO v_latest_utm_source, v_latest_utm_campaign
  FROM orders
  WHERE customer->>'email' = (SELECT email FROM customer_profiles WHERE id = p_customer_id)
     OR user_id IN (SELECT identity_value::UUID FROM customer_identity_links WHERE customer_id = p_customer_id AND identity_type = 'user_id')
  ORDER BY created_at DESC
  LIMIT 1;

  -- 5. Update scores
  UPDATE customer_scores
  SET
    ltv_paise = v_total_revenue,
    total_orders = v_order_count,
    aov_paise = v_avg_order_value,
    preferred_payment_method = v_preferred_pm,
    preferred_category = v_preferred_cat,
    utm_source = COALESCE(v_latest_utm_source, utm_source),
    utm_campaign = COALESCE(v_latest_utm_campaign, utm_campaign),
    updated_at = now()
  WHERE customer_id = p_customer_id;

  -- 6. Recalculate segments
  -- Clean up transient status segments
  DELETE FROM customer_segments WHERE customer_id = p_customer_id AND segment_name IN ('VIP', 'High Spender', 'Repeat Customer', 'New Customer');

  IF v_total_revenue >= 1000000 THEN
    INSERT INTO customer_segments (customer_id, segment_name) VALUES (p_customer_id, 'VIP') ON CONFLICT DO NOTHING;
    INSERT INTO customer_segments (customer_id, segment_name) VALUES (p_customer_id, 'High Spender') ON CONFLICT DO NOTHING;
  END IF;

  IF v_order_count > 1 THEN
    INSERT INTO customer_segments (customer_id, segment_name) VALUES (p_customer_id, 'Repeat Customer') ON CONFLICT DO NOTHING;
  ELSIF v_order_count = 1 THEN
    INSERT INTO customer_segments (customer_id, segment_name) VALUES (p_customer_id, 'New Customer') ON CONFLICT DO NOTHING;
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Orders sync to customer profile
CREATE OR REPLACE FUNCTION trg_orders_customer_sync_func()
RETURNS TRIGGER AS $$
DECLARE
  v_customer_id UUID;
  v_email TEXT;
  v_phone TEXT;
  v_name TEXT;
BEGIN
  v_email := NEW.customer->>'email';
  v_phone := NEW.customer->>'phone';
  v_name := NEW.customer->>'name';

  -- Resolve customer profile
  v_customer_id := resolve_customer_identity(
    'email', 
    v_email, 
    v_email, 
    v_phone, 
    v_name
  );

  IF v_customer_id IS NOT NULL THEN
    -- Sync order data to identity links
    IF NEW.user_id IS NOT NULL THEN
      INSERT INTO customer_identity_links (customer_id, identity_type, identity_value)
      VALUES (v_customer_id, 'user_id', NEW.user_id::TEXT)
      ON CONFLICT (identity_type, identity_value) DO NOTHING;
    END IF;

    IF NEW.gclid IS NOT NULL THEN
      INSERT INTO customer_identity_links (customer_id, identity_type, identity_value)
      VALUES (v_customer_id, 'gclid', NEW.gclid)
      ON CONFLICT (identity_type, identity_value) DO NOTHING;
    END IF;

    IF NEW.fbclid IS NOT NULL THEN
      INSERT INTO customer_identity_links (customer_id, identity_type, identity_value)
      VALUES (v_customer_id, 'fbclid', NEW.fbclid)
      ON CONFLICT (identity_type, identity_value) DO NOTHING;
    END IF;

    -- Perform calculation refresh
    PERFORM sync_customer_scores_and_segments(v_customer_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_orders_customer_sync ON orders;
CREATE TRIGGER trg_orders_customer_sync
  AFTER INSERT OR UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trg_orders_customer_sync_func();


-- Trigger: Marketing Events sync to customer profile
CREATE OR REPLACE FUNCTION trg_marketing_event_customer_sync_func()
RETURNS TRIGGER AS $$
DECLARE
  v_customer_id UUID := NULL;
  v_props JSONB;
BEGIN
  v_props := NEW.payload;

  -- 1. Try to resolve using user_id
  IF NEW.user_id IS NOT NULL THEN
    v_customer_id := resolve_customer_identity('user_id', NEW.user_id::TEXT, v_props->>'email', v_props->>'phone', v_props->>'name');
  END IF;

  -- 2. Fall back to anonymous_id
  IF v_customer_id IS NULL AND NEW.anonymous_id IS NOT NULL AND NEW.anonymous_id <> '' THEN
    v_customer_id := resolve_customer_identity('anonymous_id', NEW.anonymous_id, v_props->>'email', v_props->>'phone', v_props->>'name');
  END IF;

  -- 3. Fall back to email/phone triggers inside properties
  IF v_customer_id IS NULL AND v_props->>'email' IS NOT NULL AND v_props->>'email' <> '' THEN
    v_customer_id := resolve_customer_identity('email', v_props->>'email', v_props->>'email', v_props->>'phone', v_props->>'name');
  END IF;

  IF v_customer_id IS NOT NULL THEN
    -- Update last active and device contexts
    UPDATE customer_scores
    SET 
      last_active = NEW.created_at,
      first_active = COALESCE(first_active, NEW.created_at),
      preferred_device = COALESCE(v_props->'context'->'device'->>'type', preferred_device),
      engagement_score = engagement_score + (
        CASE NEW.event_name
          WHEN 'page_viewed' THEN 1
          WHEN 'product_viewed' THEN 3
          WHEN 'product_added_to_cart' THEN 5
          WHEN 'checkout_started' THEN 10
          WHEN 'payment_success' THEN 20
          ELSE 1
        END
      ),
      updated_at = now()
    WHERE customer_id = v_customer_id;

    -- Increment daily activity summary counters
    INSERT INTO customer_activity_summary (customer_id, activity_type, activity_date, count)
    VALUES (v_customer_id, NEW.event_name, NEW.created_at::DATE, 1)
    ON CONFLICT (customer_id, activity_type, activity_date)
    DO UPDATE SET count = customer_activity_summary.count + 1;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_marketing_event_customer_sync ON marketing_events;
CREATE TRIGGER trg_marketing_event_customer_sync
  AFTER INSERT ON marketing_events
  FOR EACH ROW
  EXECUTE FUNCTION trg_marketing_event_customer_sync_func();
