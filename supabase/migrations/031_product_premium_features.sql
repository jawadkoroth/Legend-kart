-- =============================================
-- PANTHER Ecommerce — 031 Premium Product Upgrades
-- =============================================

-- 1. Extend products table with media column for images + videos mixed list
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS media JSONB DEFAULT '[]'::jsonb;

-- 2. Create product coupons linkage table
CREATE TABLE IF NOT EXISTS product_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  show_on_product_page BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, coupon_id)
);

-- 3. Create product story sections table
CREATE TABLE IF NOT EXISTS product_story_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT NOT NULL,
  image_url TEXT NOT NULL,
  button_text TEXT,
  button_url TEXT,
  layout TEXT NOT NULL CHECK (layout IN ('left', 'right')),
  background TEXT NOT NULL CHECK (background IN ('black', 'dark-grey', 'gold-accent')),
  image_ratio TEXT NOT NULL DEFAULT 'portrait' CHECK (image_ratio IN ('portrait', 'landscape', 'square')),
  display_order INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Enable RLS
ALTER TABLE product_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_story_sections ENABLE ROW LEVEL SECURITY;

-- 5. Policies: product_coupons
DROP POLICY IF EXISTS "Public read product_coupons" ON product_coupons;
CREATE POLICY "Public read product_coupons"
  ON product_coupons FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admin manage product_coupons" ON product_coupons;
CREATE POLICY "Admin manage product_coupons"
  ON product_coupons FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_users));

-- 6. Policies: product_story_sections
DROP POLICY IF EXISTS "Public read product_story_sections" ON product_story_sections;
CREATE POLICY "Public read product_story_sections"
  ON product_story_sections FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admin manage product_story_sections" ON product_story_sections;
CREATE POLICY "Admin manage product_story_sections"
  ON product_story_sections FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_users));

-- 7. Trigger: Auto-update updated_at for story sections
CREATE TRIGGER story_sections_updated_at BEFORE UPDATE ON product_story_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
