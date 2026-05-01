-- =============================================
-- NOIR Ecommerce — 011 Coupon segmentation
--
-- Additive columns on `coupons`:
--
--   * new_users_only       Restricts the coupon to users with NO
--                          prior placed orders (paid or COD).
--                          Validation enforced server-side only;
--                          the storefront only renders the user-
--                          facing rejection.
--
--   * show_on_homepage     If true, this coupon's banner is
--                          rendered below the navbar on the public
--                          homepage. At most one banner is shown
--                          (the most recently updated active row).
--
--   * homepage_text        Free-text headline for the banner.
--                          Falls back to a default formed from
--                          the discount_percent if blank.
--
--   * homepage_accent      Premium accent color slot. Only the
--                          enum below is supported so the brand
--                          aesthetic stays controlled.
--
-- All columns are nullable / defaulted, so no row migration is
-- required. RLS already restricts writes to admins; the existing
-- "Public read active coupons" policy continues to allow the
-- homepage to read banner rows without auth.
-- =============================================

ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS new_users_only   BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_on_homepage BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS homepage_text    TEXT,
  ADD COLUMN IF NOT EXISTS homepage_accent  TEXT,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT now();

-- Constrain accent to the brand's premium palette so admins can't
-- introduce off-brand neon / red banners by accident.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'coupons_homepage_accent_chk'
  ) THEN
    ALTER TABLE coupons
      ADD CONSTRAINT coupons_homepage_accent_chk
      CHECK (
        homepage_accent IS NULL
        OR homepage_accent IN ('royal-blue', 'cobalt', 'gold', 'emerald')
      );
  END IF;
END
$$;

-- Touch-trigger on update so banner ordering stays meaningful.
CREATE OR REPLACE FUNCTION touch_coupons_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS coupons_touch_updated_at ON coupons;
CREATE TRIGGER coupons_touch_updated_at
  BEFORE UPDATE ON coupons
  FOR EACH ROW EXECUTE FUNCTION touch_coupons_updated_at();

-- Lookup index for the homepage banner query.
CREATE INDEX IF NOT EXISTS idx_coupons_homepage
  ON coupons(show_on_homepage, updated_at DESC)
  WHERE show_on_homepage = true AND is_active = true;
