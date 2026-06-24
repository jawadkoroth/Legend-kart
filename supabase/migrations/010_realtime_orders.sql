-- =============================================
-- PANTHER Ecommerce — 010 Realtime publication for orders
-- Required so admin clients receive INSERT payloads on the
-- `orders` table via Supabase Realtime.
-- =============================================
--
-- The default Supabase publication is `supabase_realtime`. Tables
-- have to be explicitly added to it to broadcast change events.
-- Row-Level Security still applies: only sessions whose JWT can
-- SELECT the row receive the payload, so the existing
-- "Admin manage orders" policy (admins-only, all operations) is
-- already sufficient — non-admin clients will never see the event.
--
-- This migration is idempotent: it is a no-op if `orders` is
-- already in the publication.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname    = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'orders'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.orders';
  END IF;
END
$$;
