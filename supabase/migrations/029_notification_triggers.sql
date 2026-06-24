-- ===============================================================
-- PANTHER Ecommerce — 029 Real-time Notification Database Triggers
--
-- Automatically schedules a `push.admin_notify` job in the
-- `job_queue` when return requests are created, admin notes are
-- added, or shipments are delivered.
-- ===============================================================

-- Trigger for return_requests -> job_queue
CREATE OR REPLACE FUNCTION trg_fn_queue_return_push()
RETURNS TRIGGER AS $$
DECLARE
  v_customer_name TEXT;
  v_order_number TEXT;
  v_payload JSONB;
BEGIN
  SELECT COALESCE(o.customer->>'name', 'Guest'), o.order_number
    INTO v_customer_name, v_order_number
    FROM orders o
   WHERE o.id = NEW.order_id;

  v_payload := json_build_object(
    'push', json_build_object(
      'title', CASE WHEN NEW.type = 'exchange' THEN '🔀 Exchange Request' ELSE '🔄 Return Request' END,
      'body', v_customer_name || ' requested an ' || NEW.type || ' for Order #' || substring(v_order_number from length(v_order_number)-5),
      'orderId', NEW.order_id,
      'type', NEW.type
    )
  );

  INSERT INTO job_queue (kind, payload)
  VALUES ('push.admin_notify', v_payload);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_return_requests_push ON return_requests;
CREATE TRIGGER trg_return_requests_push
  AFTER INSERT ON return_requests
  FOR EACH ROW EXECUTE FUNCTION trg_fn_queue_return_push();


-- Trigger for admin_notes -> job_queue
CREATE OR REPLACE FUNCTION trg_fn_queue_notes_push()
RETURNS TRIGGER AS $$
DECLARE
  v_order_number TEXT;
  v_payload JSONB;
BEGIN
  SELECT o.order_number
    INTO v_order_number
    FROM orders o
   WHERE o.id = NEW.order_id;

  v_payload := json_build_object(
    'push', json_build_object(
      'title', '📝 Admin Note',
      'body', NEW.admin_email || ': ' || substring(NEW.content from 1 for 60),
      'orderId', NEW.order_id,
      'type', 'note'
    )
  );

  INSERT INTO job_queue (kind, payload)
  VALUES ('push.admin_notify', v_payload);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_admin_notes_push ON admin_notes;
CREATE TRIGGER trg_admin_notes_push
  AFTER INSERT ON admin_notes
  FOR EACH ROW EXECUTE FUNCTION trg_fn_queue_notes_push();


-- Trigger for shipment_status_history -> job_queue
CREATE OR REPLACE FUNCTION trg_fn_queue_shipment_push()
RETURNS TRIGGER AS $$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_customer_name TEXT;
  v_payload JSONB;
BEGIN
  IF NEW.next_status = 'delivered' THEN
    SELECT s.order_id, o.order_number, COALESCE(o.customer->>'name', 'Guest')
      INTO v_order_id, v_order_number, v_customer_name
      FROM shipments s
      JOIN orders o ON o.id = s.order_id
     WHERE s.id = NEW.shipment_id;

    IF v_order_id IS NOT NULL THEN
      v_payload := json_build_object(
        'push', json_build_object(
          'title', '📦 Shipment Delivered',
          'body', 'Order #' || substring(v_order_number from length(v_order_number)-5) || ' delivered to ' || v_customer_name,
          'orderId', v_order_id,
          'type', 'delivery'
        )
      );

      INSERT INTO job_queue (kind, payload)
      VALUES ('push.admin_notify', v_payload);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_shipment_status_push ON shipment_status_history;
CREATE TRIGGER trg_shipment_status_push
  AFTER INSERT ON shipment_status_history
  FOR EACH ROW EXECUTE FUNCTION trg_fn_queue_shipment_push();
