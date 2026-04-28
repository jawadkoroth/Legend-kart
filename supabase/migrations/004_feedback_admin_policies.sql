-- =============================================
-- Migration 004: Allow admin_users to read & update feedback
-- Run in Supabase SQL Editor AFTER 002_profiles_feedback.sql
--
-- Root cause being fixed
-- ----------------------
-- 002 only granted access to `auth.role() = 'service_role'`. The admin
-- panel uses the anon-key browser client with the admin's user JWT
-- (role = 'authenticated'), so:
--
--   * SELECT silently returned no rows for non-service-role clients.
--   * UPDATE feedback SET is_read = true was silently rejected.
--
-- The drawer never inspected the error, so the UI marked items as
-- read while the database row stayed unread. Reopening the drawer (a
-- fresh fetch) re-displayed the unread dot.
--
-- Fix: scope new policies strictly to members of `admin_users` via
-- auth.uid(). Service-role and anonymous-insert policies stay intact.
-- =============================================

DROP POLICY IF EXISTS "Admins read feedback" ON feedback;
CREATE POLICY "Admins read feedback"
  ON feedback FOR SELECT
  USING (auth.uid() IN (SELECT id FROM admin_users));

DROP POLICY IF EXISTS "Admins update feedback" ON feedback;
CREATE POLICY "Admins update feedback"
  ON feedback FOR UPDATE
  USING (auth.uid() IN (SELECT id FROM admin_users))
  WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));
