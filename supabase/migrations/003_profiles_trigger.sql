-- =============================================
-- Migration 003: Auto-create `profiles` row on user signup
-- Run in Supabase SQL Editor AFTER 002_profiles_feedback.sql
--
-- Replaces the previous client-side "GlobalAuthSync" component, which
-- raced with the rest of the app. With this trigger the profile row is
-- guaranteed to exist by the time `auth.users` insert returns, so the
-- OAuth callback / server components can read it deterministically.
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      ''
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
