-- ════════════════════════════════════════════════════════════════════════
--  ترقية المتجر ليصبح منصة تجارة إلكترونية شاملة متعددة الأقسام
--  (Multi-department marketplace upgrade)
--
--  هذا الملف إضافي (يُنفَّذ بعد full_sql) — آمن لإعادة التشغيل (idempotent).
--  لا يحذف أو يغيّر أي بيانات موجودة.
--
--  ما الذي يضيفه:
--  1) ربط البنرات (banners) بتصنيف/قسم معيّن — لإظهار بنرات خاصة بكل قسم
--     (مثلاً بنر خاص بقسم "إلكترونيات") بالإضافة للبنرات العامة.
--  2) فهرس على categories.parent_id لتسريع جلب التصنيفات الفرعية لكل قسم.
--  3) دالة مساعدة category_descendant_ids(uuid) ترجع التصنيف نفسه وكل
--     أبنائه وأحفاده — تُستخدم لعرض منتجات قسم كامل (وليس فقط تصنيف واحد).
--
--  ملاحظة مهمة: جدول categories يدعم أصلاً parent_id بشكل شجري غير محدود
--  العمق، لذلك "الأقسام" هي التصنيفات التي لا تملك parent_id (رئيسية)،
--  و"التصنيفات الفرعية" هي أي تصنيف له parent_id. هذا يعني أن الأدمن يقدر
--  من نفس صفحة "التصنيفات" أن يضيف قسم جديد بالكامل (مثل إلكترونيات) ثم
--  يضيف تحته تصنيفات فرعية (موبايلات، لابتوبات...) بدون أي تغيير إضافي.
-- ════════════════════════════════════════════════════════════════════════

-- ============ BANNERS: ربط اختياري بقسم/تصنيف ============
ALTER TABLE public.banners
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.banners.category_id IS
  'إن كان فارغاً (NULL) يظهر البنر بشكل عام. إن كان مربوطاً بتصنيف/قسم، يظهر فقط عند تصفح ذلك القسم أو أحد تصنيفاته الفرعية.';

CREATE INDEX IF NOT EXISTS idx_banners_category_id ON public.banners(category_id);

-- ============ CATEGORIES: فهرس للأداء ============
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON public.categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON public.categories(is_active);

-- ============ دالة: كل أبناء وأحفاد تصنيف معيّن (شامل نفسه) ============
CREATE OR REPLACE FUNCTION public.category_descendant_ids(root_id uuid)
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
AS $$
  WITH RECURSIVE tree AS (
    SELECT c.id FROM public.categories c WHERE c.id = root_id
    UNION ALL
    SELECT c.id FROM public.categories c
    INNER JOIN tree t ON c.parent_id = t.id
  )
  SELECT id FROM tree;
$$;

GRANT EXECUTE ON FUNCTION public.category_descendant_ids(uuid) TO anon, authenticated;
