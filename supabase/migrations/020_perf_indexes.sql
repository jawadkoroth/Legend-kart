-- =============================================
-- NOIR Ecommerce — 020 Perf indexes (targeted, not premature)
--
-- Two surgical index additions backed by concrete query patterns
-- already in production code. No speculative indexes — every entry
-- below maps to a hot SQL path I can point to in the codebase.
--
-- Existing index inventory (already shipped, not re-created here):
--
--   * idx_orders_user_id_created        — /orders user history
--   * idx_orders_created                — admin lists, analytics range
--   * idx_orders_status                 — single-status filter
--   * idx_orders_payment                — payment_method+payment_status
--   * idx_orders_stuck                  — partial: 30m+ unpaid online
--   * idx_orders_razorpay_order_id      — webhook lookup
--   * idx_orders_client_request_id      — idempotent replay
--   * idx_orders_coupon_code_status     — coupon usage counts (012)
--   * idx_inventory_product_size        — atomic stock decrement
--   * idx_products_live                 — admin list (active+unarchived)
--   * idx_products_archived_at          — admin "archived" tab
--   * idx_app_events_*                  — diagnostics queries (016)
--   * idx_job_queue_due / _dead / _kind — runner + diagnostics (017)
--
-- =============================================

-- ---------------------------------------------------------------
-- 1. orders (order_status, created_at DESC) — admin list
-- ---------------------------------------------------------------
-- /api/admin/orders default query: WHERE order_status = $1
-- ORDER BY created_at DESC LIMIT $n. Currently the planner picks
-- either:
--   (a) idx_orders_status, then sorts the matched rows in memory
--       (slow when one status holds most rows, e.g. 'delivered'),
--   (b) idx_orders_created, then filters rows that don't match
--       (slow when the requested status is rare).
-- A composite covers both branches with no in-memory sort.
--
-- Also accelerates the bulk-status update path (admin POST) which
-- filters `.in('order_status', allowedFromStatus)`.
CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON orders(order_status, created_at DESC);

-- ---------------------------------------------------------------
-- 2. job_queue (lease_until) WHERE status = 'running'
-- ---------------------------------------------------------------
-- claim_jobs reclaims stale leases via:
--   OR (status = 'running' AND lease_until < now())
-- The existing idx_job_queue_due partial covers only queued rows.
-- A second tiny partial keeps the reclaim branch index-served
-- without bloating the all-status table index.
CREATE INDEX IF NOT EXISTS idx_job_queue_running_lease
  ON job_queue(lease_until)
  WHERE status = 'running';

-- ---------------------------------------------------------------
-- 3. ANALYZE so the planner picks the new indexes immediately
-- ---------------------------------------------------------------
-- Without ANALYZE, the first few queries after deploy use stale
-- statistics and may not switch over until autovacuum runs.
ANALYZE orders;
ANALYZE job_queue;
