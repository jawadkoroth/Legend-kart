-- =============================================
-- PANTHER Ecommerce — 018 Rate limits (abuse mitigation)
--
-- Pragmatic Postgres-backed fixed-window counter. One UPSERT per
-- check, atomic increment in a single SQL function — no extra round
-- trips, no Redis. Adequate for the few abuse-prone public endpoints
-- (coupon validation, push subscription, order placement).
--
-- The window resets in-place rather than rolling, which keeps the
-- table size O(unique-keys-in-current-window). A nightly cron prune
-- can be added later; in practice the row count stays tiny because
-- the keyspace is bounded (IPs + user ids).
-- =============================================

CREATE TABLE IF NOT EXISTS rate_limits (
  key                TEXT        PRIMARY KEY,
  count              INT         NOT NULL DEFAULT 0,
  window_started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window
  ON rate_limits(window_started_at);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies — service-role only.

-- =============================================
-- rate_limit_hit: atomic "increment + check"
--
-- Returns:
--   allowed     BOOLEAN — true if under the cap after this hit
--   remaining   INT     — calls left in the current window
--   reset_at    TIMESTAMPTZ — when the window resets
--
-- Semantics:
--   * If no row exists, or the existing row's window has expired,
--     start a fresh window with count=1.
--   * Otherwise increment count by 1.
--   * `allowed` is computed AFTER the increment, so a request that
--     pushes us over the limit still consumes a hit (this is the
--     standard fixed-window behaviour).
-- =============================================

CREATE OR REPLACE FUNCTION rate_limit_hit(
  p_key             TEXT,
  p_max             INT,
  p_window_seconds  INT
)
RETURNS TABLE(allowed BOOLEAN, remaining INT, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now      TIMESTAMPTZ := now();
  v_row      rate_limits%ROWTYPE;
  v_count    INT;
  v_window_started TIMESTAMPTZ;
BEGIN
  -- Fast path: try to update an existing live window.
  UPDATE rate_limits
     SET count      = count + 1,
         updated_at = v_now
   WHERE key = p_key
     AND window_started_at + make_interval(secs => p_window_seconds) > v_now
   RETURNING count, window_started_at INTO v_count, v_window_started;

  IF NOT FOUND THEN
    -- Either no row, or the window has rolled over. Insert/replace
    -- with a fresh window starting now.
    INSERT INTO rate_limits AS r (key, count, window_started_at, updated_at)
    VALUES (p_key, 1, v_now, v_now)
    ON CONFLICT (key) DO UPDATE
      SET count             = 1,
          window_started_at = v_now,
          updated_at        = v_now
    RETURNING r.count, r.window_started_at INTO v_count, v_window_started;
  END IF;

  RETURN QUERY SELECT
    (v_count <= p_max) AS allowed,
    GREATEST(p_max - v_count, 0)::INT AS remaining,
    (v_window_started + make_interval(secs => p_window_seconds)) AS reset_at;
END;
$$;

GRANT EXECUTE ON FUNCTION rate_limit_hit(TEXT, INT, INT) TO service_role;
