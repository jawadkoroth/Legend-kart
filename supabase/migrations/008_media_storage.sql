-- =============================================
-- PANTHER Ecommerce — Media Storage Setup
-- Phase 1: Product image uploads via Supabase Storage
-- =============================================

-- 1. Create the "products" storage bucket (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('products', 'products', true)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS: Public read access to product images
CREATE POLICY "Public read product images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'products');

-- 3. RLS: Admin-only insert
CREATE POLICY "Admin insert product images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'products'
    AND auth.uid() IN (SELECT id FROM admin_users)
  );

-- 4. RLS: Admin-only update
CREATE POLICY "Admin update product images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'products'
    AND auth.uid() IN (SELECT id FROM admin_users)
  );

-- 5. RLS: Admin-only delete
CREATE POLICY "Admin delete product images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'products'
    AND auth.uid() IN (SELECT id FROM admin_users)
  );
