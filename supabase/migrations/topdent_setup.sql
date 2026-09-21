-- TopDent - Dental Equipment Trading Platform
-- Database Setup and Categories Configuration
-- This file contains the categories and initial setup for TopDent

-- ============================================================================
-- SECTION 1: ADD NEW COLUMNS FOR DENTAL EQUIPMENT TRACKING
-- ============================================================================

-- Add dental-specific fields to products table
ALTER TABLE products
ADD COLUMN IF NOT EXISTS sterility_certification BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS material_composition TEXT,
ADD COLUMN IF NOT EXISTS shelf_life_months INTEGER,
ADD COLUMN IF NOT EXISTS storage_requirements TEXT,
ADD COLUMN IF NOT EXISTS dental_specialty VARCHAR(255),
ADD COLUMN IF NOT EXISTS compatibility_info TEXT,
ADD COLUMN IF NOT EXISTS certification_ids TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS is_medical_device BOOLEAN DEFAULT true;

-- ============================================================================
-- SECTION 2: CREATE CERTIFICATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  certification_type VARCHAR(100) NOT NULL,
  certification_number VARCHAR(100),
  issue_date DATE,
  expiry_date DATE,
  issuing_authority VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT certification_type_check CHECK (
    certification_type IN ('FDA', 'ISO', 'CE', 'RoHS', 'AQIS', 'LOCAL')
  )
);

CREATE INDEX IF NOT EXISTS idx_product_certifications
ON product_certifications(product_id);

-- ============================================================================
-- SECTION 3: CLEAR OLD CATEGORIES (OPTIONAL - COMMENT OUT IF NEEDED)
-- ============================================================================

-- DELETE FROM categories WHERE parent_id IS NOT NULL;
-- DELETE FROM categories WHERE parent_id IS NULL;

-- ============================================================================
-- SECTION 4: INSERT TOPDENT MAIN CATEGORIES (DEPARTMENTS)
-- ============================================================================

-- Before inserting, we need to know the category IDs, so we'll use INSERT...RETURNING
-- or insert one at a time.

INSERT INTO categories (name, slug, description, sort_order, is_active, parent_id, image_url)
VALUES
  (
    'أدوات الكشف والتشخيص',
    'detection-diagnosis-tools',
    'مرايا الفم ومستكشفات الأسنان وأدوات قياس الجيب وأجهزة الكشف عن الجير',
    1,
    true,
    NULL,
    'https://via.placeholder.com/200?text=Detection'
  )
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, slug, description, sort_order, is_active, parent_id, image_url)
VALUES
  (
    'أجهزة الحفر والقطع',
    'drilling-cutting-devices',
    'محركات الحفر والمجاميع والبرد والأدوات الدوارة',
    2,
    true,
    NULL,
    'https://via.placeholder.com/200?text=Drilling'
  )
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, slug, description, sort_order, is_active, parent_id, image_url)
VALUES
  (
    'مواد الحشو والتركيب',
    'filling-materials',
    'الحشوات المركبة والاسمنت السني وموارد الختم وحشوات الجذر',
    3,
    true,
    NULL,
    'https://via.placeholder.com/200?text=Materials'
  )
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, slug, description, sort_order, is_active, parent_id, image_url)
VALUES
  (
    'أجهزة التنظيف والكشط',
    'cleaning-devices',
    'ماكينات تنظيف الأسنان والشافطات وأدوات الكشط',
    4,
    true,
    NULL,
    'https://via.placeholder.com/200?text=Cleaning'
  )
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, slug, description, sort_order, is_active, parent_id, image_url)
VALUES
  (
    'معدات العيادة الكبيرة',
    'large-clinic-equipment',
    'كراسي طب الأسنان وأجهزة الأشعات السينية ونظم التهوية',
    5,
    true,
    NULL,
    'https://via.placeholder.com/200?text=Equipment'
  )
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, slug, description, sort_order, is_active, parent_id, image_url)
VALUES
  (
    'مستلزمات الحماية والسلامة',
    'protective-safety-supplies',
    'الكمامات والقفازات والنظارات الطبية وملابس العمل',
    6,
    true,
    NULL,
    'https://via.placeholder.com/200?text=Protection'
  )
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, slug, description, sort_order, is_active, parent_id, image_url)
VALUES
  (
    'مواد الطب الرميح والجراحي',
    'endodontic-surgical-materials',
    'مواد معالجة قنوات الجذر ومواد تقويم الأسنان',
    7,
    true,
    NULL,
    'https://via.placeholder.com/200?text=Surgical'
  )
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, slug, description, sort_order, is_active, parent_id, image_url)
VALUES
  (
    'الأدوات المستعملة والمجددة',
    'used-refurbished-equipment',
    'أدوات مستعملة بحالة جيدة ومعدات مجددة',
    8,
    true,
    NULL,
    'https://via.placeholder.com/200?text=Used'
  )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SECTION 5: INSERT SUBCATEGORIES (OPTIONAL)
-- ============================================================================

-- Note: You'll need to get the parent category IDs first
-- Example (update the parent_id with actual IDs from your database):

-- Detection & Diagnosis Subcategories
INSERT INTO categories (name, slug, description, sort_order, is_active, parent_id)
SELECT 'مرايا الفم', 'mouth-mirrors', 'مرايا الفم بأحجام وأنواع مختلفة', 1, true, id
FROM categories WHERE slug = 'detection-diagnosis-tools'
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, slug, description, sort_order, is_active, parent_id)
SELECT 'مستكشفات الأسنان', 'dental-explorers', 'مستكشفات حادة ودقيقة لكشف التسوس', 2, true, id
FROM categories WHERE slug = 'detection-diagnosis-tools'
ON CONFLICT DO NOTHING;

-- Drilling & Cutting Subcategories
INSERT INTO categories (name, slug, description, sort_order, is_active, parent_id)
SELECT 'محركات الحفر', 'handpieces', 'محركات حفر عالية والسرعة والسرعة المنخفضة', 1, true, id
FROM categories WHERE slug = 'drilling-cutting-devices'
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, slug, description, sort_order, is_active, parent_id)
SELECT 'مجاميع الحفر', 'drill-bits', 'مجاميع حفر متنوعة للأغراض المختلفة', 2, true, id
FROM categories WHERE slug = 'drilling-cutting-devices'
ON CONFLICT DO NOTHING;

-- Protective Supplies Subcategories
INSERT INTO categories (name, slug, description, sort_order, is_active, parent_id)
SELECT 'الكمامات الطبية', 'medical-masks', 'كمامات N95 وطبية معتمدة', 1, true, id
FROM categories WHERE slug = 'protective-safety-supplies'
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, slug, description, sort_order, is_active, parent_id)
SELECT 'القفازات الطبية', 'medical-gloves', 'قفازات لاتكس ونيتريل وخالية من اللاتكس', 2, true, id
FROM categories WHERE slug = 'protective-safety-supplies'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SECTION 6: ENABLE ROW LEVEL SECURITY (RLS) FOR NEW TABLES
-- ============================================================================

ALTER TABLE product_certifications ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read certifications (public marketplace)
CREATE POLICY "Enable read access for all users" ON product_certifications
  FOR SELECT
  USING (true);

-- Allow authenticated users to manage their product certifications
CREATE POLICY "Enable write access for merchants" ON product_certifications
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM products
      WHERE products.id = product_certifications.product_id
      AND products.merchant_id = auth.uid()
    )
  );

-- ============================================================================
-- SECTION 7: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_products_dental_specialty
ON products(dental_specialty);

CREATE INDEX IF NOT EXISTS idx_products_is_medical
ON products(is_medical_device);

CREATE INDEX IF NOT EXISTS idx_categories_dental_marketplace
ON categories(parent_id, sort_order);

-- ============================================================================
-- SECTION 8: INSERT SAMPLE PRODUCT CERTIFICATIONS (OPTIONAL)
-- ============================================================================

-- This section would be populated with actual certification data
-- Example structure:
/*
INSERT INTO product_certifications (
  product_id,
  certification_type,
  certification_number,
  issue_date,
  expiry_date,
  issuing_authority
)
VALUES
  (
    '550e8400-e29b-41d4-a716-446655440000'::uuid,
    'FDA',
    'FDA-2024-001234',
    '2024-01-15'::date,
    '2026-01-15'::date,
    'Food and Drug Administration'
  );
*/

-- ============================================================================
-- SECTION 9: VIEWS FOR DENTAL MARKETPLACE
-- ============================================================================

-- View for all active products with certification summary
CREATE OR REPLACE VIEW dental_products_with_certifications AS
SELECT
  p.id,
  p.name,
  p.description,
  p.price,
  p.category_id,
  p.merchant_id,
  p.dental_specialty,
  p.sterility_certification,
  p.material_composition,
  p.shelf_life_months,
  p.storage_requirements,
  COUNT(pc.id) as certification_count,
  ARRAY_AGG(pc.certification_type) FILTER (WHERE pc.certification_type IS NOT NULL) as certifications
FROM products p
LEFT JOIN product_certifications pc ON p.id = pc.product_id
WHERE p.status = 'active' AND p.is_medical_device = true
GROUP BY p.id;

-- View for top certified products
CREATE OR REPLACE VIEW top_certified_dental_products AS
SELECT
  p.id,
  p.name,
  p.price,
  p.rating,
  p.dental_specialty,
  COUNT(pc.id) as certification_count
FROM products p
LEFT JOIN product_certifications pc ON p.id = pc.product_id
WHERE p.status = 'active'
  AND p.is_medical_device = true
  AND pc.id IS NOT NULL
GROUP BY p.id
ORDER BY certification_count DESC, p.rating DESC
LIMIT 50;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

-- TopDent database setup completed successfully!
-- Next steps:
-- 1. Update category images with actual dental equipment photos
-- 2. Import your product catalog
-- 3. Add product certifications data
-- 4. Test the application thoroughly
-- 5. Deploy to production

COMMIT;
