-- ===============================================================
-- PANTHER Ecommerce — 030 Additional Real-time Notification Triggers
--
-- Automatically schedules a `push.admin_notify` job in the
-- `job_queue` when:
-- 1. Feedback/Support requests are submitted.
-- 2. Background jobs enter the 'dead' state.
-- 3. Inventory stock levels drop to 3 or lower.
-- ===============================================================

-- 1. Trigger for feedback -> job_queue
CREATE OR REPLACE FUNCTION trg_fn_queue_feedback_push()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
BEGIN
  v_payload := json_build_object(
    'push', json_build_object(
      'title', '💬 New Support Request',
      'body', NEW.email || ': ' || substring(NEW.message from 1 for 60),
      'type', 'feedback'
    )
  );

  INSERT INTO job_queue (kind, payload)
  VALUES ('push.admin_notify', v_payload);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_feedback_push ON feedback;
CREATE TRIGGER trg_feedback_push
  AFTER INSERT ON feedback
  FOR EACH ROW EXECUTE FUNCTION trg_fn_queue_feedback_push();


-- 2. Trigger for dead jobs -> job_queue
CREATE OR REPLACE FUNCTION trg_fn_queue_dead_job_push()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
BEGIN
  -- Only alert on non-push dead jobs to prevent potential loops
  IF NEW.status = 'dead' AND (OLD.status IS NULL OR OLD.status != 'dead') AND NEW.kind != 'push.admin_notify' THEN
    v_payload := json_build_object(
      'push', json_build_object(
        'title', '🚨 Dead Job Alert',
        'body', 'Job ' || NEW.id || ' (' || NEW.kind || ') failed. Error: ' || substring(NEW.last_error from 1 for 60),
        'type', 'dead_job'
      )
    );

    INSERT INTO job_queue (kind, payload)
    VALUES ('push.admin_notify', v_payload);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_dead_job_push ON job_queue;
CREATE TRIGGER trg_dead_job_push
  AFTER UPDATE ON job_queue
  FOR EACH ROW EXECUTE FUNCTION trg_fn_queue_dead_job_push();


-- 3. Trigger for low stock warning -> job_queue
CREATE OR REPLACE FUNCTION trg_fn_queue_low_stock_push()
RETURNS TRIGGER AS $$
DECLARE
  v_product_name TEXT;
  v_payload JSONB;
BEGIN
  -- Trigger when stock drops to 3 or lower
  IF NEW.stock <= 3 AND (OLD.stock IS NULL OR OLD.stock > 3) THEN
    SELECT name INTO v_product_name FROM products WHERE id = NEW.product_id;
    
    v_payload := json_build_object(
      'push', json_build_object(
        'title', '⚠️ Low Stock Warning',
        'body', 'Only ' || NEW.stock || ' left of ' || COALESCE(v_product_name, 'product') || ' (Size ' || NEW.size || ')',
        'type', 'low_stock'
      )
    );

    INSERT INTO job_queue (kind, payload)
    VALUES ('push.admin_notify', v_payload);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_low_stock_push ON inventory;
CREATE TRIGGER trg_low_stock_push
  AFTER UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION trg_fn_queue_low_stock_push();
