-- =============================================
-- NOIR Ecommerce — 007 Address book + soft-delete flag
-- Additive only; safe to re-run.
-- Run this in Supabase SQL Editor after 006.
-- =============================================

-- 1. Address book table.
--
-- Snapshot model: orders.shipping_address remains a JSONB snapshot
-- copied at order creation, so editing or deleting an entry here
-- never mutates historical orders.
CREATE TABLE IF NOT EXISTS addresses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label       TEXT,
  full_name   TEXT NOT NULL,
  phone       TEXT NOT NULL,
  line1       TEXT NOT NULL,
  line2       TEXT,
  city        TEXT NOT NULL,
  state       TEXT NOT NULL,
  pincode     TEXT NOT NULL,
  country     TEXT NOT NULL DEFAULT 'India',
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Listing index: WHERE user_id = $1 ORDER BY created_at DESC.
CREATE INDEX IF NOT EXISTS idx_addresses_user_id_created
  ON addresses(user_id, created_at DESC);

-- At most one default per user (partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS uq_addresses_one_default_per_user
  ON addresses(user_id) WHERE is_default;

-- 2. RLS — strict per-row ownership; anon sees nothing.
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own addresses" ON addresses;
CREATE POLICY "Users read own addresses"
  ON addresses FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users insert own addresses" ON addresses;
CREATE POLICY "Users insert own addresses"
  ON addresses FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own addresses" ON addresses;
CREATE POLICY "Users update own addresses"
  ON addresses FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users delete own addresses" ON addresses;
CREATE POLICY "Users delete own addresses"
  ON addresses FOR DELETE
  USING (user_id = auth.uid());

-- 3. updated_at trigger.
CREATE OR REPLACE FUNCTION addresses_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_addresses_updated_at ON addresses;
CREATE TRIGGER trg_addresses_updated_at
  BEFORE UPDATE ON addresses
  FOR EACH ROW EXECUTE FUNCTION addresses_set_updated_at();

-- 4. set_default_address(p_id) — atomic clear + set, owner-checked.
--
-- SECURITY DEFINER so the two UPDATEs run inside one transaction
-- without RLS subtleties; the explicit auth.uid() guard preserves
-- ownership. Calling with a foreign id raises NOT_OWNER.
CREATE OR REPLACE FUNCTION set_default_address(p_id UUID)
RETURNS VOID AS $$
DECLARE
  v_user UUID;
BEGIN
  SELECT user_id INTO v_user FROM addresses WHERE id = p_id;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'ADDRESS_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_user IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'NOT_OWNER' USING ERRCODE = 'P0001';
  END IF;

  UPDATE addresses
     SET is_default = FALSE
   WHERE user_id = v_user
     AND is_default = TRUE
     AND id <> p_id;

  UPDATE addresses
     SET is_default = TRUE
   WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Auto-promote remaining address to default after the default
-- is deleted. Picks the most-recent remaining row.
CREATE OR REPLACE FUNCTION addresses_promote_default_after_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_default THEN
    UPDATE addresses
       SET is_default = TRUE
     WHERE id = (
       SELECT id FROM addresses
        WHERE user_id = OLD.user_id
        ORDER BY created_at DESC
        LIMIT 1
     );
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_addresses_promote_default ON addresses;
CREATE TRIGGER trg_addresses_promote_default
  AFTER DELETE ON addresses
  FOR EACH ROW EXECUTE FUNCTION addresses_promote_default_after_delete();

-- 6. Soft-delete flag for profiles (used by Settings → Delete account).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at
  ON profiles(deleted_at) WHERE deleted_at IS NOT NULL;
