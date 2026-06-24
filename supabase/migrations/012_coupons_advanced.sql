-- =============================================
-- PANTHER Ecommerce — 012 Coupons advanced rules
--
-- Additive columns on `coupons` for production segmentation:
--
--   * min_cart_paise        Minimum subtotal (after sale_price,
--                           before coupon discount) required for
--                           the coupon to apply. NULL / 0 = no min.
--
--   * max_discount_paise    Hard cap on the discount amount in
--                           paise. Allows percent coupons that
--                           never give away more than X. NULL =
--                           uncapped.
--
--   * starts_at             Earliest moment the coupon is valid.
--                           NULL = always valid.
--
--   * expires_at            Latest moment the coupon is valid.
--                           NULL = no expiry.
--
--   * per_user_limit        Maximum non-cancelled orders that may
--                           use this coupon per user_id. NULL =
--                           unlimited. Guests are exempt from the
--                           per-user check (no identity to count
--                           against).
--
--   * usage_limit           Hard global cap on total non-cancelled
--                           orders that may use this coupon. NULL =
--                           unlimited.
--
-- Per-user and global usage are computed on demand from the
-- `orders` table (`coupon_code` column already populated by
-- `create_order_atomic`); a denormalised counter would race with
-- order creation and require RPC changes — costly for the small
-- query the count actually runs.
--
-- All columns are nullable / defaulted, so no row migration is
-- required. RLS unchanged.
-- =============================================

ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS min_cart_paise     INTEGER     CHECK (min_cart_paise     IS NULL OR min_cart_paise     >= 0),
  ADD COLUMN IF NOT EXISTS max_discount_paise INTEGER     CHECK (max_discount_paise IS NULL OR max_discount_paise >= 0),
  ADD COLUMN IF NOT EXISTS starts_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS per_user_limit     INTEGER     CHECK (per_user_limit     IS NULL OR per_user_limit     >= 1),
  ADD COLUMN IF NOT EXISTS usage_limit        INTEGER     CHECK (usage_limit        IS NULL OR usage_limit        >= 1);

-- Sanity: starts_at must be <= expires_at when both present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'coupons_validity_window_chk'
  ) THEN
    ALTER TABLE coupons
      ADD CONSTRAINT coupons_validity_window_chk
      CHECK (
        starts_at IS NULL
        OR expires_at IS NULL
        OR starts_at <= expires_at
      );
  END IF;
END
$$;

-- Lookup index for the order-time per-user / global usage counts.
CREATE INDEX IF NOT EXISTS idx_orders_coupon_code_status
  ON orders(coupon_code, order_status)
  WHERE coupon_code IS NOT NULL AND coupon_code <> '';
