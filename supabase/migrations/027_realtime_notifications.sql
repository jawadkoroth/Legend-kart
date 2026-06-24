-- =============================================
-- PANTHER Ecommerce — 027 Realtime publication for additional tables
-- Required so admin clients receive INSERT payloads on the
-- `return_requests`, `shipment_status_history`, and `admin_notes`
-- tables via Supabase Realtime.
-- =============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname    = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'return_requests'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.return_requests';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname    = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'shipment_status_history'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.shipment_status_history';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname    = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'admin_notes'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notes';
  END IF;
END
$$;
