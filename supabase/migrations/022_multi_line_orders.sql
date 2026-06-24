-- =============================================
-- PANTHER Ecommerce — 022 Multi-line orders (Path B, Phase B1)
--
-- Introduces order_items so a single order row can carry multiple
-- (product, size, quantity) lines instead of exactly one. This is
-- the foundation for the cart -> multi-line checkout flow.
--
-- Strategy
-- --------
--   1. New order_items table with denormalised product_name + first
--      image_url so admin / customer order pages render correctly
--      even after a product is later renamed or archived.
--   2. Backfill: every existing order gets one order_items row,
--      derived from its current orders.product_id / size / quantity
--      / unit_price_paise / subtotal_paise. After this migration
--      runs, "every order has >= 1 order_items row" is an invariant
--      the display layer can rely on.
--   3. Relax NOT NULL on orders.product_id / size / unit_price_paise.
--      Legacy rows keep their values; new multi-line orders leave
--      these NULL and read line data from order_items.
--   4. New RPC create_order_atomic_v2 takes p_items JSONB array.
--      Mirrors all guarantees of the single-line v1 (idempotent
--      replay, FOR UPDATE coupon lock, atomic stock decrement) and
--      additionally inserts one order_items row per line.
--   5. New RPC restore_order_stock(p_order_id) loops over order_items
--      to undo per-line decrements on the failure paths in
--      /api/orders and the Razorpay webhook.
--
-- Compatibility
-- -------------
--   * The single-line create_order_atomic from migration 019 is
--     PRESERVED unchanged. /api/orders continues to call it until
--     phase B2 flips the call to v2. Rolling B2 back is therefore a
--     pure code revert, no schema rollback required.
--   * Existing single-line restore_stock(p_product_id, p_size, qty)
--     from migration 001 is also PRESERVED for the same reason.
--   * All ALTERs use IF EXISTS / DROP NOT NULL — re-running the
--     migration is a no-op on an already-applied database.
-- =============================================

-- ---------------------------------------------------------------
-- 1. order_items table.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id),
  -- Denormalised so a renamed/archived product still renders
  -- correctly in admin order pages and customer receipt emails.
  product_name      TEXT NOT NULL,
  size              TEXT NOT NULL,
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_paise  INTEGER NOT NULL CHECK (unit_price_paise >= 0),
  -- = quantity * unit_price_paise at insert time. Stored (not
  -- computed) so historical line totals survive any later price
  -- changes without recomputation drift.
  subtotal_paise    INTEGER NOT NULL CHECK (subtotal_paise >= 0),
  image_url         TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_product_id
  ON order_items(product_id);

-- ---------------------------------------------------------------
-- 2. RLS — mirrors the orders table policy model.
-- ---------------------------------------------------------------
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage order_items" ON order_items;
CREATE POLICY "Admin manage order_items" ON order_items FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_users));

-- A logged-in user may read items belonging to their own order.
-- Guests (orders.user_id IS NULL) reach their order via the
-- /order/[id] route which uses the service-role admin client, so
-- this policy doesn't have to cover the guest path.
DROP POLICY IF EXISTS "User read own order_items" ON order_items;
CREATE POLICY "User read own order_items" ON order_items FOR SELECT
  USING (
    order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
  );

-- ---------------------------------------------------------------
-- 3. Backfill existing orders -> one order_items row each.
-- ---------------------------------------------------------------
-- Idempotent: NOT EXISTS gate skips orders that already have rows.
INSERT INTO order_items (
  order_id, product_id, product_name, size, quantity,
  unit_price_paise, subtotal_paise, image_url
)
SELECT
  o.id,
  o.product_id,
  COALESCE(p.name, '(deleted product)'),
  o.size,
  o.quantity,
  o.unit_price_paise,
  o.subtotal_paise,
  CASE
    WHEN jsonb_typeof(p.images) = 'array'
         AND jsonb_array_length(p.images) > 0
      THEN p.images->>0
    ELSE NULL
  END
FROM orders o
LEFT JOIN products p ON p.id = o.product_id
WHERE o.product_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM order_items oi WHERE oi.order_id = o.id
  );

-- ---------------------------------------------------------------
-- 4. Relax legacy single-line columns on orders.
-- ---------------------------------------------------------------
-- Existing data is untouched (every legacy row already has values
-- for these columns and now also has its mirror in order_items).
-- New multi-line orders leave these NULL; display reads from
-- order_items.
ALTER TABLE orders ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN size DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN unit_price_paise DROP NOT NULL;

-- ---------------------------------------------------------------
-- 5. restore_order_stock(p_order_id) — multi-line rollback.
-- ---------------------------------------------------------------
-- Replaces the call sites that today do
--   restore_stock(p_product_id, p_size, p_quantity)
-- after backfill, every order has order_items rows so the loop
-- always has work to do. The legacy fallback at the end exists
-- only as defence-in-depth for edge cases (e.g. a race where this
-- migration is applied between an order insert and its rollback).
CREATE OR REPLACE FUNCTION restore_order_stock(p_order_id UUID)
RETURNS VOID AS $$
DECLARE
  r            RECORD;
  v_any_item   BOOLEAN := FALSE;
BEGIN
  FOR r IN
    SELECT product_id, size, quantity
      FROM order_items
     WHERE order_id = p_order_id
  LOOP
    v_any_item := TRUE;
    UPDATE inventory
       SET stock = stock + r.quantity,
           updated_at = NOW()
     WHERE product_id = r.product_id
       AND size = r.size;
  END LOOP;

  -- Defensive legacy fallback: if no order_items rows exist (which
  -- shouldn't be reachable after backfill), restore from the orders
  -- header columns. Costs nothing when order_items rows are present.
  IF NOT v_any_item THEN
    UPDATE inventory inv
       SET stock = inv.stock + COALESCE(o.quantity, 0),
           updated_at = NOW()
      FROM orders o
     WHERE o.id = p_order_id
       AND o.product_id IS NOT NULL
       AND inv.product_id = o.product_id
       AND inv.size = o.size;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------
-- 6. create_order_atomic_v2 — multi-line order creation.
-- ---------------------------------------------------------------
-- p_items: JSONB array of objects, each with:
--   { product_id (uuid),
--     size (text),
--     quantity (int > 0),
--     unit_price_paise (int >= 0),
--     subtotal_paise (int >= 0),
--     product_name (text),         -- for denormalised display
--     image_url (text | null) }
--
-- Header totals (subtotal/discount/shipping/cod_fee/total) are
-- still computed in /api/orders BEFORE this RPC is called, mirroring
-- the v1 flow. The RPC trusts those numbers — it does not
-- recompute. This preserves the single-source-of-truth for pricing
-- (calcShipping in TS) without forcing the SQL function to know
-- about shipping rules.
--
-- Failure modes (mapped by /api/orders to clean HTTP errors):
--   STOCK_UNAVAILABLE     (P0001)  any line short on stock
--   COUPON_PER_USER_LIMIT (P0002)  coupon per_user cap reached
--   COUPON_USAGE_LIMIT    (P0003)  coupon global cap reached
--   EMPTY_ITEMS           (P0004)  p_items missing/empty
--   INVALID_ITEM          (P0005)  malformed item entry
CREATE OR REPLACE FUNCTION create_order_atomic_v2(
  p_client_request_id UUID,
  p_order_number      TEXT,
  p_items             JSONB,
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
  v_total_qty       INTEGER;
  v_item            JSONB;
  v_item_pid        UUID;
  v_item_size       TEXT;
  v_item_qty        INTEGER;
  v_item_unit       INTEGER;
  v_item_subtotal   INTEGER;
  v_item_name       TEXT;
  v_item_image      TEXT;
BEGIN
  -- 1. Idempotent replay. Identical to v1.
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

  -- 2. Validate items array shape.
  IF p_items IS NULL
     OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_ITEMS' USING ERRCODE = 'P0004';
  END IF;

  -- 3. Coupon capacity recheck. Mirrors the single-line RPC EXACTLY,
  --    including the FOR UPDATE row lock granularity. Two concurrent
  --    multi-line orders quoting the same coupon serialise on the
  --    coupons row; orders for different coupons never block each
  --    other.
  v_coupon_code := NULLIF(p_coupon_code, '');
  IF v_coupon_code IS NOT NULL THEN
    SELECT per_user_limit, usage_limit
      INTO v_per_user_limit, v_usage_limit
      FROM coupons
     WHERE code = v_coupon_code
     FOR UPDATE;

    IF v_per_user_limit IS NOT NULL AND p_user_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_per_user_used
        FROM orders
       WHERE user_id = p_user_id
         AND coupon_code = v_coupon_code
         AND order_status <> 'cancelled';
      IF v_per_user_used >= v_per_user_limit THEN
        RAISE EXCEPTION 'COUPON_PER_USER_LIMIT' USING ERRCODE = 'P0002';
      END IF;
    END IF;

    IF v_usage_limit IS NOT NULL THEN
      SELECT COUNT(*) INTO v_global_used
        FROM orders
       WHERE coupon_code = v_coupon_code
         AND order_status <> 'cancelled';
      IF v_global_used >= v_usage_limit THEN
        RAISE EXCEPTION 'COUPON_USAGE_LIMIT' USING ERRCODE = 'P0003';
      END IF;
    END IF;
  END IF;

  -- 4. Per-item stock decrement. Each UPDATE is gated by
  --    `stock >= needed`; if any line fails, the transaction rolls
  --    back the entire function call (Postgres atomicity), so a
  --    partial decrement is never persisted.
  --
  --    Lines are processed in input order. Iteration order does not
  --    affect correctness, only which line surfaces in the error
  --    message when stock is short on more than one.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_pid  := (v_item->>'product_id')::UUID;
    v_item_size := v_item->>'size';
    v_item_qty  := (v_item->>'quantity')::INTEGER;

    IF v_item_pid IS NULL
       OR v_item_size IS NULL
       OR v_item_qty IS NULL
       OR v_item_qty <= 0 THEN
      RAISE EXCEPTION 'INVALID_ITEM' USING ERRCODE = 'P0005';
    END IF;

    UPDATE inventory
       SET stock = stock - v_item_qty,
           updated_at = NOW()
     WHERE product_id = v_item_pid
       AND size = v_item_size
       AND stock >= v_item_qty;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    IF v_rows_affected = 0 THEN
      RAISE EXCEPTION 'STOCK_UNAVAILABLE' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  -- 5. Sum quantity for the orders.quantity header column. We keep
  --    this column populated (rather than NULL) so admin list views
  --    that show "qty" remain meaningful for multi-line orders too.
  SELECT SUM((v->>'quantity')::INTEGER) INTO v_total_qty
    FROM jsonb_array_elements(p_items) v;

  -- 6. Insert the order header row. Legacy single-line columns
  --    (product_id, size, unit_price_paise) are intentionally NULL
  --    on multi-line orders; display code reads order_items.
  INSERT INTO orders (
    client_request_id, user_id, order_number,
    quantity, subtotal_paise, discount_paise,
    shipping_paise, cod_fee_paise, total_paise,
    coupon_code, payment_method, payment_status, order_status,
    customer, shipping_address
  ) VALUES (
    p_client_request_id, p_user_id, p_order_number,
    v_total_qty, p_subtotal_paise, p_discount_paise,
    COALESCE(p_shipping_paise, 0), COALESCE(p_cod_fee_paise, 0), p_total_paise,
    v_coupon_code, p_payment_method, 'pending', 'pending',
    p_customer, p_shipping_address
  )
  RETURNING id INTO v_new_id;

  -- 7. Insert one order_items row per line. The line-level subtotal
  --    is taken from the payload (not recomputed) because /api/orders
  --    already validated unit_price_paise against the live products
  --    table before calling this RPC.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_pid      := (v_item->>'product_id')::UUID;
    v_item_size     := v_item->>'size';
    v_item_qty      := (v_item->>'quantity')::INTEGER;
    v_item_unit     := (v_item->>'unit_price_paise')::INTEGER;
    v_item_subtotal := (v_item->>'subtotal_paise')::INTEGER;
    v_item_name     := COALESCE(v_item->>'product_name', '(unnamed product)');
    v_item_image    := v_item->>'image_url';

    INSERT INTO order_items (
      order_id, product_id, product_name, size, quantity,
      unit_price_paise, subtotal_paise, image_url
    ) VALUES (
      v_new_id, v_item_pid, v_item_name, v_item_size, v_item_qty,
      v_item_unit, v_item_subtotal, v_item_image
    );
  END LOOP;

  order_id     := v_new_id;
  order_number := p_order_number;
  was_existing := FALSE;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
