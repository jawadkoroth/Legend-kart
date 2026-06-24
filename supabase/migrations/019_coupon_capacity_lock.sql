-- =============================================
-- PANTHER Ecommerce — 019 Coupon capacity race-fix
--
-- Closes a TOCTOU window between the application-level
-- `evaluateCoupon()` check and `create_order_atomic` insert.
--
-- Concrete attack/regression scenarios it fixes:
--
--   (a) per_user_limit = 1, user double-clicks Place Order on a
--       slow network. Two requests race: both see 0 prior orders,
--       both pass the JS check, both call create_order_atomic →
--       two orders created with the same coupon, exceeding the
--       per-user cap.
--
--   (b) usage_limit = 100 (e.g. a launch coupon). At the boundary,
--       N concurrent submitters all read count=99 in their own
--       evaluateCoupon call → all N pass → 100+N orders use the
--       coupon. Loss = N over-discounted orders.
--
-- Strategy:
--
--   * On the way INTO `create_order_atomic`, when a coupon code is
--     supplied, take a row-level FOR UPDATE lock on the matching
--     `coupons` row. This serializes every concurrent order
--     placement that quotes the same code, on the same coupon
--     row, for the duration of the transaction.
--
--   * Re-count usage with the lock held. If the order we're about
--     to create would push usage past per_user_limit / usage_limit,
--     RAISE with a stable ERRCODE so /api/orders can map the error
--     to a clean 4xx without parsing English.
--
--   * The check runs BEFORE the inventory decrement and the
--     INSERT, so a coupon-rejected order does NOT consume stock.
--
-- Lock granularity: per coupon row. Two orders for different
-- coupons never block each other. An order with no coupon never
-- takes the lock at all.
--
-- Idempotent replay: the existing client_request_id short-circuit
-- runs FIRST and returns the existing order without re-checking
-- the coupon — replays of an already-accepted order are still
-- safe and cheap.
-- =============================================

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
  v_coupon_code     TEXT;
  v_per_user_limit  INTEGER;
  v_usage_limit     INTEGER;
  v_per_user_used   INTEGER;
  v_global_used     INTEGER;
BEGIN
  -- 1. Idempotent replay short-circuit. Runs BEFORE every check
  --    so a retry never re-runs the coupon recount or the stock
  --    decrement. Holds no locks — purely a read.
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

  -- 2. Coupon capacity recheck under row lock.
  --
  --    NULLIF maps the empty string to NULL so the rest of the
  --    block can use a single IS NOT NULL gate.
  v_coupon_code := NULLIF(p_coupon_code, '');

  IF v_coupon_code IS NOT NULL THEN
    -- FOR UPDATE serialises this section across concurrent
    -- order placements that quote the same code. Released at
    -- transaction end (function return / RAISE).
    SELECT per_user_limit, usage_limit
      INTO v_per_user_limit, v_usage_limit
      FROM coupons
     WHERE code = v_coupon_code
     FOR UPDATE;

    -- If the row vanished between the JS evaluate and now (admin
    -- deleted it) we silently treat the coupon as inert: the
    -- discount the JS layer already applied still rides through,
    -- but no capacity check is possible. Logging this transition
    -- is not the SQL function's job.

    IF v_per_user_limit IS NOT NULL AND p_user_id IS NOT NULL THEN
      SELECT COUNT(*)
        INTO v_per_user_used
        FROM orders
       WHERE user_id      = p_user_id
         AND coupon_code  = v_coupon_code
         AND order_status <> 'cancelled';

      IF v_per_user_used >= v_per_user_limit THEN
        RAISE EXCEPTION 'COUPON_PER_USER_LIMIT'
          USING ERRCODE = 'P0002';
      END IF;
    END IF;

    IF v_usage_limit IS NOT NULL THEN
      SELECT COUNT(*)
        INTO v_global_used
        FROM orders
       WHERE coupon_code  = v_coupon_code
         AND order_status <> 'cancelled';

      IF v_global_used >= v_usage_limit THEN
        RAISE EXCEPTION 'COUPON_USAGE_LIMIT'
          USING ERRCODE = 'P0003';
      END IF;
    END IF;
  END IF;

  -- 3. Atomic stock decrement. Same as before — predicate gate
  --    eliminates the "select then update" race on stock.
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

  -- 4. Order insert.
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
    v_coupon_code,
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
