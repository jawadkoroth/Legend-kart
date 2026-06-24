-- =============================================
-- PANTHER Ecommerce — 015 Product soft-archive
--
-- Why soft-delete:
--
--   * `orders.product_id` is a FK to `products(id)` with the
--     default NO ACTION rule. Hard-deleting a product that has
--     any historical orders would be blocked by the DB anyway.
--
--   * Even if a product has no orders today, it may be ordered
--     tomorrow (returning customers, reactivated listings), and
--     full deletion destroys brand analytics + images that may
--     still be referenced from past emails / order detail pages.
--
-- The safest production approach is soft-archive:
--
--   * A nullable `archived_at` timestamp signals the row is hidden
--     from all storefront + admin-default views.
--   * Archiving ALSO flips `is_active` to false so the existing
--     `/api/products` filter (`eq('is_active', true)`) and cart
--     validate (which already drops inactive products) hide it
--     without further code changes.
--   * Archives are reversible: set archived_at = NULL and flip
--     is_active back to true.
-- =============================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Index for the admin "show archived" view (DESC so the most
-- recently archived lands first).
CREATE INDEX IF NOT EXISTS idx_products_archived_at
  ON products(archived_at DESC)
  WHERE archived_at IS NOT NULL;

-- Partial index for the common "live catalogue" admin query
-- (is_active AND NOT archived). Speeds up the default products
-- list without penalising the full-table archive view.
CREATE INDEX IF NOT EXISTS idx_products_live
  ON products(created_at DESC)
  WHERE is_active = true AND archived_at IS NULL;
