-- =============================================
-- PANTHER Ecommerce — 009 Shipping + Order Pricing
-- Additive only; no destructive changes.
-- Run in Supabase SQL Editor after 008.
-- =============================================
--
-- This migration introduces server-authoritative shipping
-- configuration and extends orders with shipping / COD fee
-- breakdown columns. All additions are nullable / default-zero so
-- existing rows and code paths continue to work unchanged.

-- ---------------------------------------------------------------
-- 1. Extend shipping_settings (singleton row already seeded in 001).
-- ---------------------------------------------------------------
-- Every column is ADD COLUMN IF NOT EXISTS — re-running is safe.
ALTER TABLE shipping_settings
  ADD COLUMN IF NOT EXISTS provider_enabled              BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS provider_name                 TEXT    DEFAULT 'delhivery',
  ADD COLUMN IF NOT EXISTS api_url                       TEXT,
  ADD COLUMN IF NOT EXISTS api_key                       TEXT,
  ADD COLUMN IF NOT EXISTS pickup_name                   TEXT,
  ADD COLUMN IF NOT EXISTS pickup_phone                  TEXT,
  ADD COLUMN IF NOT EXISTS pickup_address_line1          TEXT,
  ADD COLUMN IF NOT EXISTS pickup_address_line2          TEXT,
  ADD COLUMN IF NOT EXISTS pickup_city                   TEXT,
  ADD COLUMN IF NOT EXISTS pickup_state                  TEXT,
  ADD COLUMN IF NOT EXISTS pickup_pincode                TEXT,
  ADD COLUMN IF NOT EXISTS free_shipping_threshold_paise INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_shipping_charge_paise INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cod_enabled                   BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS cod_fee_paise                 INTEGER DEFAULT 0;

-- ---------------------------------------------------------------
-- 2. Extend orders with fee breakdown.
-- ---------------------------------------------------------------
-- `total_paise` remains the single authoritative amount charged
-- (subtotal − discount + shipping + cod_fee). These two columns
-- are added for breakdown display and auditability; existing rows
-- default to 0 which is correct for orders placed before this
-- migration (they never charged shipping or COD fee).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_paise INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cod_fee_paise  INTEGER DEFAULT 0;

-- ---------------------------------------------------------------
-- 3. Extend create_order_atomic to persist the new breakdown.
-- ---------------------------------------------------------------
-- Postgres CREATE OR REPLACE FUNCTION cannot change the argument
-- list, so we drop the 14-arg overload from migration 006 and
-- recreate with two additional trailing DEFAULT-0 params. Existing
-- behaviour (idempotent replay, atomic stock decrement, single
-- insert) is unchanged; the new params are appended at the end so
-- the only caller (/api/orders) can update at its own pace.
DROP FUNCTION IF EXISTS create_order_atomic(
  UUID, TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER,
  INTEGER, TEXT, TEXT, JSONB, JSONB, UUID
);

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
  p_user_id           UUID    DEFAULT NULL,
  p_shipping_paise    INTEGER DEFAULT 0,
  p_cod_fee_paise     INTEGER DEFAULT 0
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
    shipping_paise,
    cod_fee_paise,
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
    COALESCE(p_shipping_paise, 0),
    COALESCE(p_cod_fee_paise, 0),
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
