/**
 * طبقة بيانات التقييمات والتعليقات على المنتجات.
 *
 * تشمل:
 *  - جلب التقييمات مع إحصائيات (المتوسط + توزيع النجوم)
 *  - نشر تعليق مع تقييم بالنجوم وصور (تُرفع إلى Cloudinary)
 *  - تعديل وحذف تعليق المستخدم نفسه
 *  - تصويت "مفيد" (مرة واحدة لكل مستخدم لكل تعليق)
 *
 * ملاحظة: يجب تشغيل ملف supabase/migrations/REVIEWS_AND_COMMENTS.sql مرة واحدة.
 */
import { supabase } from '@/lib/supabase';
import type { Review } from '@/lib/supabase';
import { pickImage, uploadToCloudinary, isCloudinaryConfigured } from '@/lib/cloudinary';

export const MAX_REVIEW_IMAGES = 4;

export type ReviewStats = {
  average: number;
  total: number;
  /** توزيع عدد التقييمات لكل نجمة: breakdown[5] = عدد تقييمات 5 نجوم */
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
};

function normalizeImages(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((v: unknown) => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function normalizeReview(row: any): Review {
  return { ...row, images: normalizeImages(row?.images) } as Review;
}

export function computeStats(reviews: Review[]): ReviewStats {
  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
  let sum = 0;
  for (const r of reviews) {
    const key = Math.min(5, Math.max(1, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5;
    breakdown[key] += 1;
    sum += r.rating;
  }
  return {
    average: reviews.length ? sum / reviews.length : 0,
    total: reviews.length,
    breakdown,
  };
}

export type ReviewSort = 'newest' | 'oldest' | 'highest' | 'lowest' | 'helpful';

export async function fetchReviews(
  productId: string,
  sort: ReviewSort = 'newest'
): Promise<Review[]> {
  let query = supabase
    .from('reviews')
    .select('*')
    .eq('product_id', productId)
    .eq('is_approved', true);

  switch (sort) {
    case 'oldest':
      query = query.order('created_at', { ascending: true });
      break;
    case 'highest':
      query = query.order('rating', { ascending: false }).order('created_at', { ascending: false });
      break;
    case 'lowest':
      query = query.order('rating', { ascending: true }).order('created_at', { ascending: false });
      break;
    case 'helpful':
      query = query
        .order('helpful_count', { ascending: false })
        .order('created_at', { ascending: false });
      break;
    default:
      query = query.order('created_at', { ascending: false });
  }

  const { data, error } = await query;
  if (error) throw error;
  return ((data as any[]) ?? []).map(normalizeReview);
}

/** معرّفات التقييمات التي صوّت المستخدم الحالي أنها مفيدة */
export async function fetchMyHelpfulVotes(reviewIds: string[]): Promise<Set<string>> {
  if (reviewIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('review_helpful_votes')
    .select('review_id')
    .in('review_id', reviewIds);
  if (error) return new Set();
  return new Set(((data as { review_id: string }[]) ?? []).map((v) => v.review_id));
}

export async function toggleHelpful(reviewId: string, currentlyVoted: boolean): Promise<void> {
  if (currentlyVoted) {
    const { error } = await supabase.from('review_helpful_votes').delete().eq('review_id', reviewId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('review_helpful_votes').insert({ review_id: reviewId });
    if (error && !String(error.message).includes('duplicate')) throw error;
  }
}

/** اختيار صورة من المعرض ورفعها — ترجع الرابط أو null إذا أُلغيت العملية */
export async function pickAndUploadReviewImage(
  onProgress?: (percent: number) => void
): Promise<string | null> {
  if (!isCloudinaryConfigured()) {
    throw new Error('خدمة رفع الصور غير مهيّأة. أضف بيانات Cloudinary في ملف .env');
  }
  const uri = await pickImage();
  if (!uri) return null;
  const result = await uploadToCloudinary(uri, 'image', onProgress);
  return result.secure_url;
}

export type ReviewInput = {
  productId: string;
  rating: number;
  title?: string | null;
  body: string;
  images?: string[];
  userName?: string | null;
  userAvatar?: string | null;
};

export async function createReview(input: ReviewInput): Promise<void> {
  const payload: Record<string, unknown> = {
    product_id: input.productId,
    rating: Math.min(5, Math.max(1, Math.round(input.rating))),
    title: input.title?.trim() ? input.title.trim() : null,
    body: input.body.trim(),
    images: (input.images ?? []).slice(0, MAX_REVIEW_IMAGES),
    user_name: input.userName?.trim() || null,
    user_avatar: input.userAvatar || null,
  };
  const { error } = await supabase.from('reviews').insert(payload);
  if (error) throw error;
}

export async function updateReview(
  reviewId: string,
  patch: { rating?: number; title?: string | null; body?: string; images?: string[] }
): Promise<void> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.rating != null) payload.rating = Math.min(5, Math.max(1, Math.round(patch.rating)));
  if (patch.title !== undefined) payload.title = patch.title?.trim() ? patch.title.trim() : null;
  if (patch.body !== undefined) payload.body = patch.body.trim();
  if (patch.images !== undefined) payload.images = patch.images.slice(0, MAX_REVIEW_IMAGES);
  const { error } = await supabase.from('reviews').update(payload).eq('id', reviewId);
  if (error) throw error;
}

export async function deleteReview(reviewId: string): Promise<void> {
  const { error } = await supabase.from('reviews').delete().eq('id', reviewId);
  if (error) throw error;
}
