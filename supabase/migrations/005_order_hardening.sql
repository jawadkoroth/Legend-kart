-- =============================================
-- PANTHER Ecommerce — 005 Order + Payment Hardening
-- Additive only; no destructive changes.
-- Run this in Supabase SQL Editor after 004.
-- =============================================

-- 1. Idempotency key: client-supplied UUID per submit attempt.
--
-- Partial UNIQUE index keeps legacy rows (created before this
-- migration, where the column will be NULL) valid while still
-- guaranteeing that a freshly-submitted client_request_id can
-- only land in `orders` once.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS client_request_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_client_request_id
  ON orders(client_request_id)
  WHERE client_request_id IS NOT NULL;

-- 2. Webhook dedupe: store the Razorpay event id we last applied,
-- so duplicate deliveries of the same event can be short-circuited.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS webhook_event_id TEXT;

-- 3. Lookup index for the webhook (matches by razorpay_order_id).
CREATE INDEX IF NOT EXISTS idx_orders_razorpay_order_id
  ON orders(razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;

-- =============================================
-- create_order_atomic
-- =============================================
-- Single-transaction order creation:
--   1. If a row already exists for `p_client_request_id`, return it
--      (idempotent replay — no stock changes, no new row).
--   2. Otherwise atomically decrement inventory; on insufficient
--      stock raise STOCK_UNAVAILABLE so the surrounding transaction
--      rolls back the (zero) partial work cleanly.
--   3. Insert the order row.
--
-- The function runs inside an implicit transaction (every PL/pgSQL
-- function call in PG is a single statement that either commits or
-- rolls back atomically), so the {decrement → insert} pair cannot
-- leave behind a partial mutation: if the INSERT fails, the
-- preceding UPDATE on `inventory` is rolled back automatically.
-- This replaces the previous app-level "decrement, then on insert
-- failure call restore_stock" pattern, eliminating the window
-- where a crash between the two RPC calls would leak stock.
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
  p_shipping_address  JSONB
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
  -- 1. Idempotent replay: same client_request_id returns the same
  -- row without touching inventory.
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

  -- 2. Atomic stock decrement. Identical guard to decrement_stock,
  -- inlined so we can raise inside the same transaction on failure.
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

  -- 3. Insert the order. If this fails (e.g. unique violation on
  -- order_number) the surrounding transaction rolls back the
  -- inventory UPDATE above — no leaked stock.
  INSERT INTO orders (
    client_request_id,
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
