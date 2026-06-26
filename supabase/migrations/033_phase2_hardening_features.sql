-- ===============================================================
-- PANTHER Phase 2 — 033 Hardening & Customer Experience Schemas
-- ===============================================================

-- 1. Extend profiles table
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS loyalty_points INTEGER DEFAULT 0 NOT NULL;

-- 2. Create wishlist_items
CREATE TABLE IF NOT EXISTS wishlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- 3. Create recently_viewed
CREATE TABLE IF NOT EXISTS recently_viewed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- 4. Create frequently_bought_together
CREATE TABLE IF NOT EXISTS frequently_bought_together (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id_a UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_id_b UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id_a, product_id_b),
  CHECK(product_id_a <> product_id_b)
);

-- 5. Create product_reviews
CREATE TABLE IF NOT EXISTS product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  content TEXT NOT NULL,
  images JSONB DEFAULT '[]'::jsonb,
  is_verified_purchase BOOLEAN DEFAULT false NOT NULL,
  is_approved BOOLEAN DEFAULT false NOT NULL,
  helpful_count INTEGER DEFAULT 0 NOT NULL,
  is_pinned BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Create product_qas
CREATE TABLE IF NOT EXISTS product_qas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  answer TEXT,
  answered_by UUID, -- Can link to admin_users if needed
  answered_at TIMESTAMPTZ,
  is_approved BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Create gift_cards
CREATE TABLE IF NOT EXISTS gift_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  initial_balance_paise INTEGER NOT NULL CHECK (initial_balance_paise > 0),
  current_balance_paise INTEGER NOT NULL CHECK (current_balance_paise >= 0),
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  sender_email TEXT NOT NULL,
  sender_name TEXT,
  gift_message TEXT,
  expires_at TIMESTAMPTZ,
  created_by_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Create referrals
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_email TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'signed_up', 'purchased')) NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  reward_points INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Create loyalty_ledger
CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  points_changed INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reference_id TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. Create abandoned_carts
CREATE TABLE IF NOT EXISTS abandoned_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cart_items JSONB NOT NULL,
  contact_email TEXT,
  is_recovered BOOLEAN DEFAULT false NOT NULL,
  recovery_eligible BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Enablement
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE recently_viewed ENABLE ROW LEVEL SECURITY;
ALTER TABLE frequently_bought_together ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_qas ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE abandoned_carts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Wishlist
CREATE POLICY "Users can manage own wishlist"
  ON wishlist_items FOR ALL
  USING (auth.uid() = user_id);

-- Recently Viewed
CREATE POLICY "Users can manage own viewed items"
  ON recently_viewed FOR ALL
  USING (auth.uid() = user_id);

-- Frequently Bought Together
CREATE POLICY "Public read frequently_bought_together"
  ON frequently_bought_together FOR SELECT
  USING (true);

CREATE POLICY "Admin manage frequently_bought_together"
  ON frequently_bought_together FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_users));

-- Product Reviews
CREATE POLICY "Public read approved reviews"
  ON product_reviews FOR SELECT
  USING (is_approved = true OR auth.uid() = user_id OR auth.uid() IN (SELECT id FROM admin_users));

CREATE POLICY "Authenticated users can submit reviews"
  ON product_reviews FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admin manage reviews"
  ON product_reviews FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_users));

-- Product QAs
CREATE POLICY "Public read approved questions"
  ON product_qas FOR SELECT
  USING (is_approved = true OR auth.uid() = user_id OR auth.uid() IN (SELECT id FROM admin_users));

CREATE POLICY "Anyone can submit questions"
  ON product_qas FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admin manage questions"
  ON product_qas FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_users));

-- Gift Cards
CREATE POLICY "Anyone can query card balance by code"
  ON gift_cards FOR SELECT
  USING (true);

CREATE POLICY "Admin manage gift cards"
  ON gift_cards FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_users));

-- Referrals
CREATE POLICY "Referrers can check own referrals"
  ON referrals FOR SELECT
  USING (auth.uid() = referrer_id);

CREATE POLICY "Admin manage referrals"
  ON referrals FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_users));

-- Loyalty Ledger
CREATE POLICY "Users can view own loyalty entries"
  ON loyalty_ledger FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admin manage loyalty"
  ON loyalty_ledger FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_users));

-- Abandoned Carts
CREATE POLICY "Admin manage abandoned carts"
  ON abandoned_carts FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_users));


-- 11. Enhance check_db_schema_health() RPC function
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

  -- Phase 2 new checks
  v_wishlist_items_exists BOOLEAN;
  v_recently_viewed_exists BOOLEAN;
  v_frequently_bought_together_exists BOOLEAN;
  v_product_reviews_exists BOOLEAN;
  v_product_qas_exists BOOLEAN;
  v_gift_cards_exists BOOLEAN;
  v_referrals_exists BOOLEAN;
  v_loyalty_ledger_exists BOOLEAN;
  v_abandoned_carts_exists BOOLEAN;

  -- Operational metrics
  v_total_tables INTEGER;
  v_total_functions INTEGER;
  v_total_triggers INTEGER;
  v_rls_enabled_tables INTEGER;
  v_realtime_publication_exists BOOLEAN;
BEGIN
  -- 1. Legacy checks
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'media'
  ) INTO v_products_media_exists;

  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_story_sections') INTO v_story_sections_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_coupons') INTO v_product_coupons_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_fcm_tokens') INTO v_admin_fcm_tokens_exists;
  SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_return_requests_push') INTO v_return_trigger_exists;
  SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_admin_notes_push') INTO v_notes_trigger_exists;
  SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_shipment_status_push') INTO v_shipment_trigger_exists;

  -- 2. Phase 2 new table checks
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'wishlist_items') INTO v_wishlist_items_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recently_viewed') INTO v_recently_viewed_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'frequently_bought_together') INTO v_frequently_bought_together_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_reviews') INTO v_product_reviews_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_qas') INTO v_product_qas_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'gift_cards') INTO v_gift_cards_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'referrals') INTO v_referrals_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'loyalty_ledger') INTO v_loyalty_ledger_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'abandoned_carts') INTO v_abandoned_carts_exists;

  -- 3. Operational checks
  SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' INTO v_total_tables;
  
  SELECT COUNT(*) FROM pg_proc p 
  JOIN pg_namespace n ON p.pronamespace = n.oid 
  WHERE n.nspname = 'public' INTO v_total_functions;
  
  SELECT COUNT(*) FROM pg_trigger INTO v_total_triggers;

  SELECT COUNT(*) FROM pg_class c 
  JOIN pg_namespace n ON n.oid = c.relnamespace 
  WHERE n.nspname = 'public' AND c.relrowsecurity = true INTO v_rls_enabled_tables;

  SELECT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') INTO v_realtime_publication_exists;

  -- 4. Get migration version
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
    'current_migration_version', COALESCE(v_current_migration, 'unknown'),
    -- Phase 2
    'wishlist_items_exists', v_wishlist_items_exists,
    'recently_viewed_exists', v_recently_viewed_exists,
    'frequently_bought_together_exists', v_frequently_bought_together_exists,
    'product_reviews_exists', v_product_reviews_exists,
    'product_qas_exists', v_product_qas_exists,
    'gift_cards_exists', v_gift_cards_exists,
    'referrals_exists', v_referrals_exists,
    'loyalty_ledger_exists', v_loyalty_ledger_exists,
    'abandoned_carts_exists', v_abandoned_carts_exists,
    -- Metrics
    'total_tables', v_total_tables,
    'total_functions', v_total_functions,
    'total_triggers', v_total_triggers,
    'rls_enabled_tables', v_rls_enabled_tables,
    'realtime_publication_exists', v_realtime_publication_exists
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
