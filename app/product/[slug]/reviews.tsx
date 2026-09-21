/**
 * شاشة التقييمات والتعليقات لمنتج معيّن.
 *
 * الميزات:
 *  - ملخّص التقييم (المتوسط + توزيع النجوم بأشرطة)
 *  - نشر تعليق مع تقييم بالنجوم + صور (حتى 4 صور) عبر Cloudinary
 *  - تعديل/حذف تعليق المستخدم نفسه
 *  - تصويت "مفيد" مرة واحدة لكل مستخدم
 *  - فرز التعليقات (الأحدث / الأعلى تقييمًا / الأكثر إفادة …)
 *  - عرض صور التعليقات بشاشة كاملة
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Image,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ChevronLeft,
  Star,
  ThumbsUp,
  Camera,
  X,
  Pencil,
  Trash2,
  ShieldCheck,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { LoadingState } from '@/components/LoadingState';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import { ImageLightbox } from '@/components/ImageLightbox';
import type { Review, Product } from '@/lib/supabase';
import { ArabicText as Text, ArabicTextInput as TextInput } from '@/components/ArabicText';
import { t } from '@/lib/i18n';
import {
  fetchReviews,
  fetchMyHelpfulVotes,
  toggleHelpful,
  createReview,
  updateReview,
  deleteReview,
  pickAndUploadReviewImage,
  computeStats,
  MAX_REVIEW_IMAGES,
  type ReviewSort,
} from '@/lib/reviews';

const SORTS: { key: ReviewSort; label: string }[] = [
  { key: 'newest', label: 'Newest' },
  { key: 'helpful', label: 'Most Helpful' },
  { key: 'highest', label: 'Highest Rated' },
  { key: 'lowest', label: 'Lowest Rated' },
];

export default function ReviewsScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { user, profile } = useAuth();

  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [votes, setVotes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<ReviewSort>('newest');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  const load = useCallback(async () => {
    if (!slug) return;
    const { data: prod } = await supabase
      .from('products')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    setProduct(prod as Product | null);
    if (!prod) return;
    try {
      const revs = await fetchReviews((prod as Product).id, sort);
      setReviews(revs);
      if (user) setVotes(await fetchMyHelpfulVotes(revs.map((r) => r.id)));
    } catch (e: any) {
      Alert.alert(t('Error'), e?.message ?? t('Something went wrong'));
    }
  }, [slug, sort, user]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const stats = useMemo(() => computeStats(reviews), [reviews]);
  const myReview = useMemo(
    () => (user ? reviews.find((r) => r.user_id === user.id) ?? null : null),
    [reviews, user]
  );

  const resetForm = () => {
    setEditingId(null);
    setRating(5);
    setTitle('');
    setBody('');
    setImages([]);
    setUploadPercent(0);
  };

  const openForm = () => {
    if (!user) {
      Alert.alert(t('Sign in required'), t('Please sign in to leave a review.'));
      return;
    }
    resetForm();
    setShowForm(true);
  };

  const openEdit = (review: Review) => {
    setEditingId(review.id);
    setRating(review.rating);
    setTitle(review.title ?? '');
    setBody(review.body ?? '');
    setImages(review.images ?? []);
    setShowForm(true);
  };

  const addImage = async () => {
    if (images.length >= MAX_REVIEW_IMAGES) {
      Alert.alert(t('Limit reached'), t('You can attach up to 4 photos.'));
      return;
    }
    setUploading(true);
    setUploadPercent(0);
    try {
      const url = await pickAndUploadReviewImage(setUploadPercent);
      if (url) setImages((prev) => [...prev, url]);
    } catch (e: any) {
      Alert.alert(t('Upload failed'), e?.message ?? t('Something went wrong'));
    } finally {
      setUploading(false);
      setUploadPercent(0);
    }
  };

  const submit = async () => {
    if (!user || !product) return;
    if (!body.trim()) {
      Alert.alert(t('Review required'), t('Please write your review'));
      return;
    }
    setSubmitting(true);
    try {
      if (editingId) {
        await updateReview(editingId, { rating, title, body, images });
      } else {
        await createReview({
          productId: product.id,
          rating,
          title,
          body,
          images,
          userName: profile?.full_name ?? user.email?.split('@')[0] ?? null,
          userAvatar: profile?.avatar_url ?? null,
        });
      }
      resetForm();
      setShowForm(false);
      await load();
      Alert.alert(t('Success'), t('Your review has been submitted!'));
    } catch (e: any) {
      Alert.alert(t('Error'), e?.message ?? t('Something went wrong'));
    } finally {
      setSubmitting(false);
    }
  };

  const removeReview = (review: Review) => {
    Alert.alert(t('Delete comment?'), t('This action cannot be undone.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteReview(review.id);
            await load();
          } catch (e: any) {
            Alert.alert(t('Error'), e?.message ?? t('Something went wrong'));
          }
        },
      },
    ]);
  };

  const onHelpful = async (review: Review) => {
    if (!user) {
      Alert.alert(t('Sign in required'), t('Please sign in to leave a review.'));
      return;
    }
    const voted = votes.has(review.id);
    setVotes((prev) => {
      const next = new Set(prev);
      if (voted) next.delete(review.id);
      else next.add(review.id);
      return next;
    });
    setReviews((prev) =>
      prev.map((r) =>
        r.id === review.id
          ? { ...r, helpful_count: Math.max(0, r.helpful_count + (voted ? -1 : 1)) }
          : r
      )
    );
    try {
      await toggleHelpful(review.id, voted);
    } catch {
      await load();
    }
  };

  if (loading) return <LoadingState />;

  const average = stats.total ? stats.average : product?.rating ?? 0;
  const total = stats.total || product?.review_count || 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Ratings & Reviews</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={reviews}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md }}>
            <View style={styles.summaryCard}>
              <View style={styles.summaryLeft}>
                <Text style={styles.bigRating}>{average.toFixed(1)}</Text>
                <View style={styles.stars}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star
                      key={i}
                      size={16}
                      color={i <= Math.round(average) ? colors.accent[500] : colors.neutral[300]}
                      fill={i <= Math.round(average) ? colors.accent[500] : 'transparent'}
                    />
                  ))}
                </View>
                <Text style={styles.reviewCount}>{`${total} ${t('reviews')}`}</Text>
              </View>
              <View style={styles.breakdown}>
                {[5, 4, 3, 2, 1].map((starValue) => {
                  const count = stats.breakdown[starValue as 1 | 2 | 3 | 4 | 5] ?? 0;
                  const pct = stats.total ? (count / stats.total) * 100 : 0;
                  return (
                    <View key={starValue} style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>{String(starValue)}</Text>
                      <Star size={11} color={colors.accent[500]} fill={colors.accent[500]} />
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${pct}%` }]} />
                      </View>
                      <Text style={styles.breakdownCount}>{String(count)}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {!showForm ? (
              <Button
                title={myReview ? 'Edit your review' : 'Write a Review'}
                onPress={() => (myReview ? openEdit(myReview) : openForm())}
                fullWidth
              />
            ) : null}

            {showForm ? (
              <View style={styles.formCard}>
                <View style={styles.formHeader}>
                  <Text style={styles.formTitle}>
                    {editingId ? 'Edit your review' : 'Write a Review'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowForm(false);
                      resetForm();
                    }}
                  >
                    <X size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.formLabel}>Your Rating</Text>
                <View style={styles.ratingRow}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <TouchableOpacity key={i} onPress={() => setRating(i)} activeOpacity={0.7}>
                      <Star
                        size={32}
                        color={i <= rating ? colors.accent[500] : colors.neutral[300]}
                        fill={i <= rating ? colors.accent[500] : 'transparent'}
                      />
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.formLabel}>Title (Optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Summarize your review"
                  value={title}
                  onChangeText={setTitle}
                />

                <Text style={styles.formLabel}>Review</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="What did you like or dislike?"
                  value={body}
                  onChangeText={setBody}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />

                <Text style={styles.formLabel}>Photos (Optional)</Text>
                <View style={styles.thumbRow}>
                  {images.map((uri, idx) => (
                    <View key={`${uri}-${idx}`} style={styles.thumbWrap}>
                      <TouchableOpacity onPress={() => setLightbox({ images, index: idx })}>
                        <Image source={{ uri }} style={styles.thumb} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.thumbRemove}
                        onPress={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <X size={12} color={colors.white} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {images.length < MAX_REVIEW_IMAGES ? (
                    <TouchableOpacity
                      style={styles.addThumb}
                      onPress={addImage}
                      disabled={uploading}
                      activeOpacity={0.7}
                    >
                      {uploading ? (
                        <>
                          <ActivityIndicator size="small" color={colors.primary[600]} />
                          <Text style={styles.addThumbText}>{`${uploadPercent}%`}</Text>
                        </>
                      ) : (
                        <>
                          <Camera size={20} color={colors.primary[600]} />
                          <Text style={styles.addThumbText}>Add photo</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>

                <Button
                  title={submitting ? 'Submitting...' : editingId ? 'Save changes' : 'Submit Review'}
                  onPress={submit}
                  loading={submitting}
                  disabled={uploading}
                  fullWidth
                />
              </View>
            ) : null}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sortRow}
            >
              {SORTS.map((s) => (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.sortChip, sort === s.key && styles.sortChipActive]}
                  onPress={() => setSort(s.key)}
                >
                  <Text style={[styles.sortText, sort === s.key && styles.sortTextActive]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={<Star size={64} color={colors.neutral[300]} />}
            title="No reviews yet"
            message="Be the first to review this product"
          />
        }
        renderItem={({ item }) => {
          const mine = user?.id === item.user_id;
          const voted = votes.has(item.id);
          const name = item.user_name || t('Customer');
          return (
            <View style={styles.reviewCard}>
              <View style={styles.authorRow}>
                {item.user_avatar ? (
                  <Image source={{ uri: item.user_avatar }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarLetter}>{name.slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.authorName}>{name}</Text>
                    {mine ? (
                      <View style={styles.badge}>
                        <ShieldCheck size={11} color={colors.primary[600]} />
                        <Text style={styles.badgeText}>You</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.reviewHeader}>
                    <View style={styles.stars}>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star
                          key={i}
                          size={13}
                          color={i <= item.rating ? colors.accent[500] : colors.neutral[300]}
                          fill={i <= item.rating ? colors.accent[500] : 'transparent'}
                        />
                      ))}
                    </View>
                    <Text style={styles.reviewDate}>
                      {new Date(item.created_at).toLocaleDateString('ar', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>
                </View>
              </View>

              {item.title ? <Text style={styles.reviewTitle}>{item.title}</Text> : null}
              {item.body ? <Text style={styles.reviewBody}>{item.body}</Text> : null}

              {item.images && item.images.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.reviewImages}
                >
                  {item.images.map((uri, idx) => (
                    <TouchableOpacity
                      key={`${item.id}-${idx}`}
                      onPress={() => setLightbox({ images: item.images, index: idx })}
                      activeOpacity={0.85}
                    >
                      <Image source={{ uri }} style={styles.reviewImage} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : null}

              <View style={styles.reviewFooter}>
                <TouchableOpacity style={styles.helpfulBtn} onPress={() => onHelpful(item)}>
                  <ThumbsUp
                    size={14}
                    color={voted ? colors.primary[600] : colors.neutral[400]}
                    fill={voted ? colors.primary[600] : 'transparent'}
                  />
                  <Text style={[styles.helpfulText, voted && styles.helpfulTextActive]}>
                    {`${t('Helpful')} (${item.helpful_count})`}
                  </Text>
                </TouchableOpacity>
                {mine ? (
                  <View style={styles.ownerActions}>
                    <TouchableOpacity style={styles.helpfulBtn} onPress={() => openEdit(item)}>
                      <Pencil size={14} color={colors.textMuted} />
                      <Text style={styles.helpfulText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.helpfulBtn} onPress={() => removeReview(item)}>
                      <Trash2 size={14} color={colors.error[500]} />
                      <Text style={styles.helpfulText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            </View>
          );
        }}
      />

      <ImageLightbox
        visible={!!lightbox}
        images={lightbox?.images ?? []}
        initialIndex={lightbox?.index ?? 0}
        onClose={() => setLightbox(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '700',
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadows.sm,
  },
  summaryLeft: {
    alignItems: 'center',
    gap: 4,
    minWidth: 92,
  },
  bigRating: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.text,
  },
  stars: {
    flexDirection: 'row',
    gap: 2,
  },
  reviewCount: {
    ...typography.caption,
    color: colors.textMuted,
  },
  breakdown: {
    flex: 1,
    gap: 4,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  breakdownLabel: {
    ...typography.caption,
    color: colors.textMuted,
    width: 10,
    textAlign: 'center',
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.neutral[200],
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.accent[500],
  },
  breakdownCount: {
    ...typography.caption,
    color: colors.textMuted,
    width: 24,
    textAlign: 'left',
  },
  formCard: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    gap: spacing.sm,
    ...shadows.sm,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  formTitle: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
  },
  formLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.background,
  },
  textArea: {
    minHeight: 100,
  },
  thumbRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  thumbWrap: {
    position: 'relative',
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.neutral[100],
  },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    left: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.neutral[800],
    alignItems: 'center',
    justifyContent: 'center',
  },
  addThumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: colors.background,
  },
  addThumbText: {
    ...typography.caption,
    fontSize: 10,
    color: colors.primary[600],
    textAlign: 'center',
  },
  sortRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  sortChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortChipActive: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  sortText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  sortTextActive: {
    color: colors.white,
  },
  reviewCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 6,
    ...shadows.sm,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.neutral[100],
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary[100],
  },
  avatarLetter: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.primary[600],
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  authorName: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.primary[100],
  },
  badgeText: {
    ...typography.caption,
    fontSize: 10,
    color: colors.primary[600],
    fontWeight: '700',
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  reviewDate: {
    ...typography.caption,
    color: colors.textMuted,
  },
  reviewTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  reviewBody: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  reviewImages: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: 4,
  },
  reviewImage: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    backgroundColor: colors.neutral[100],
  },
  reviewFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  ownerActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  helpfulBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  helpfulText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  helpfulTextActive: {
    color: colors.primary[600],
    fontWeight: '700',
  },
});
