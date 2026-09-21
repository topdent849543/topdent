/**
 * أدوات صور المنتج المتعددة.
 *
 * - كل منتج يمكن أن يملك أكثر من صورة.
 * - صورة واحدة فقط تُعتبر «الصورة الرئيسية» (is_primary) وهي التي تظهر
 *   في الصفحة الرئيسية وفي بطاقات المنتجات وسلة الشراء.
 * - داخل صفحة المنتج تظهر كل الصور مع إمكانية التنقّل بينها وفتحها بالحجم الكامل.
 */
import { supabase } from '@/lib/supabase';
import type { Product, ProductImage } from '@/lib/supabase';

export type EditableImage = {
  /** معرّف الصورة في قاعدة البيانات (غير موجود للصور الجديدة) */
  id?: string;
  url: string;
  isPrimary: boolean;
};

/** ترتيب الصور: الرئيسية أولاً ثم حسب الترتيب المحفوظ. */
export function sortProductImages(images?: ProductImage[] | null): ProductImage[] {
  return [...(images ?? [])].sort((a, b) => {
    const ap = (a as any).is_primary ? 0 : 1;
    const bp = (b as any).is_primary ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
}

/** رابط الصورة الرئيسية للمنتج (أو أول صورة متاحة). */
export function primaryImageUrl(product?: Partial<Product> | null): string | null {
  const sorted = sortProductImages(product?.images as ProductImage[] | undefined);
  return sorted[0]?.image_url ?? null;
}

/** كل روابط صور المنتج مرتّبة (الرئيسية أولاً). */
export function productImageUrls(product?: Partial<Product> | null): string[] {
  return sortProductImages(product?.images as ProductImage[] | undefined)
    .map(i => i.image_url)
    .filter(Boolean);
}

/** تحويل صور قاعدة البيانات إلى صور قابلة للتحرير داخل النماذج. */
export function toEditableImages(images?: ProductImage[] | null): EditableImage[] {
  const sorted = sortProductImages(images);
  return sorted.map((img, index) => ({
    id: img.id,
    url: img.image_url,
    isPrimary: (img as any).is_primary ? true : index === 0 && !sorted.some(i => (i as any).is_primary),
  }));
}

/** جلب صور منتج معيّن مرتّبة. */
export async function fetchProductImages(productId: string): Promise<ProductImage[]> {
  const { data, error } = await supabase
    .from('product_images')
    .select('*')
    .eq('product_id', productId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return sortProductImages((data as ProductImage[]) ?? []);
}

/**
 * حفظ كل صور المنتج دفعة واحدة (إضافة/حذف/ترتيب/تحديد الرئيسية).
 * يعتمد على الدالة الآمنة `sync_product_images` في قاعدة البيانات،
 * والتي تتحقّق أن المستخدم أدمن أو صاحب المنتج.
 */
export async function saveProductImages(
  productId: string,
  images: EditableImage[]
): Promise<void> {
  const clean = images
    .map(i => ({ url: (i.url || '').trim(), is_primary: !!i.isPrimary }))
    .filter(i => i.url.length > 0);

  if (clean.length > 0 && !clean.some(i => i.is_primary)) {
    clean[0].is_primary = true;
  }

  const { error } = await supabase.rpc('sync_product_images', {
    p_product_id: productId,
    p_images: clean,
  });
  if (error) throw error;
}
