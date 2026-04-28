-- =============================================
-- NOIR Ecommerce — 006 Order ownership (user_id)
-- Additive only; no destructive changes.
-- Run this in Supabase SQL Editor after 005.
-- =============================================

-- 1. Ownership link to auth.users.
--
-- NULL is allowed because guest checkout remains supported. Guest
-- orders simply will not surface on the authenticated /orders pages.
-- ON DELETE SET NULL preserves order history if a user deletes their
-- account (compliance / book-keeping).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Partial composite index for the list query
--    `WHERE user_id = $1 ORDER BY created_at DESC`.
-- Excludes guest rows so the index stays compact.
CREATE INDEX IF NOT EXISTS idx_orders_user_id_created
  ON orders(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- 3. Strict owner-read RLS policy.
--
-- This complements the existing 'Admin manage orders' policy. It is
-- READ-ONLY and uses a single equality condition with no OR fallback,
-- no email/phone matching, no auth.uid() IS NOT NULL guard (which
-- would weaken the predicate). Anonymous sessions have auth.uid() IS
-- NULL, and `NULL = NULL` is NULL (falsy) in SQL, so anon requests
-- correctly see zero rows.
DROP POLICY IF EXISTS "Users read own orders" ON orders;
CREATE POLICY "Users read own orders"
  ON orders FOR SELECT
  USING (user_id = auth.uid());

-- =============================================
-- create_order_atomic — extend with p_user_id
-- =============================================
-- Replaces the function shipped in migration 005 with an additional
-- p_user_id parameter (nullable). All other behaviour unchanged:
--   * idempotent replay on existing client_request_id
--   * atomic inventory decrement with STOCK_UNAVAILABLE on failure
--   * single-transaction insert
--
-- Argument order is preserved up through the original parameters; the
-- new p_user_id is appended last so this is a clean signature
-- extension. Callers passing the old signature need to be updated;
-- the only caller is /api/orders.
CREATE OR REPLACE FUNCTION create_order_atomic(
  p_client_request_id UUID,
  p_order_number      TEXT,
  p_product_id        UUID,
  p_size              TEXT,
  p_quantity          INTEGER,
  p_unit_price_paise  INTEGER,
  p_subtotal_paise    INTEGER,
  p_discount_paise    INTEGER,
  p_total_paise       INTEGER,
  p_coupon_code       TEXT,
  p_payment_method    TEXT,
  p_customer          JSONB,
  p_shipping_address  JSONB,
  p_user_id           UUID DEFAULT NULL
) RETURNS TABLE (
  order_id     UUID,
  order_number TEXT,
  was_existing BOOLEAN
) AS $$
DECLARE
  v_existing_id     UUID;
  v_existing_number TEXT;
  v_rows_affected   INTEGER;
  v_new_id          UUID;
BEGIN
  IF p_client_request_id IS NOT NULL THEN
    SELECT id, orders.order_number
      INTO v_existing_id, v_existing_number
      FROM orders
     WHERE client_request_id = p_client_request_id
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      order_id     := v_existing_id;
      order_number := v_existing_number;
      was_existing := TRUE;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  UPDATE inventory
     SET stock      = stock - p_quantity,
         updated_at = NOW()
   WHERE product_id = p_product_id
     AND size       = p_size
     AND stock     >= p_quantity;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION 'STOCK_UNAVAILABLE'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO orders (
    client_request_id,
    user_id,
    order_number,
    product_id,
    size,
    quantity,
    unit_price_paise,
    subtotal_paise,
    discount_paise,
    total_paise,
    coupon_code,
    payment_method,
    payment_status,
    order_status,
    customer,
    shipping_address
  ) VALUES (
    p_client_request_id,
    p_user_id,
    p_order_number,
    p_product_id,
    p_size,
    p_quantity,
    p_unit_price_paise,
    p_subtotal_paise,
    p_discount_paise,
    p_total_paise,
    NULLIF(p_coupon_code, ''),
    p_payment_method,
    'pending',
    'pending',
    p_customer,
    p_shipping_address
  )
  RETURNING id INTO v_new_id;

  order_id     := v_new_id;
  order_number := p_order_number;
  was_existing := FALSE;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
