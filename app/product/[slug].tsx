import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  SafeAreaView,
  FlatList,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WEBSITE_URL = 'https://varlostore.com';
import {
  ChevronLeft,
  Heart,
  Share2,
  ShoppingBag,
  Star,
  Truck,
  RefreshCw,
  Shield,
  Ruler,
  ChevronRight,
  Link2,
  MessageCircle,
  Maximize2,
  ThumbsUp,
  Camera,
  X,
  Pencil,
  Trash2,
  ShieldCheck,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useCart } from '@/lib/CartContext';
import { useWishlist } from '@/lib/WishlistContext';
import { Button } from '@/components/Button';
import { LoadingState } from '@/components/LoadingState';
import type { Product, ProductVariant, Review, AffiliateLink } from '@/lib/supabase';
import { ArabicText as Text, ArabicTextInput as TextInput } from '@/components/ArabicText';
import { t } from '@/lib/i18n';
import { openProductChat } from '@/lib/chat';
import { playFeedback } from '@/lib/sounds';
import { formatSyp } from '@/lib/currency';
import { ImageLightbox } from '@/components/ImageLightbox';
import { sortProductImages } from '@/lib/productImages';
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

const { width } = Dimensions.get('window');

const SORTS: { key: ReviewSort; label: string }[] = [
  { key: 'newest', label: 'Newest' },
  { key: 'helpful', label: 'Most Helpful' },
  { key: 'highest', label: 'Highest Rated' },
  { key: 'lowest', label: 'Lowest Rated' },
];

export default function ProductDetailScreen() {
  const { slug, ref } = useLocalSearchParams<{ slug: string; ref?: string }>();
  const { user, profile, isPublisher } = useAuth();
  const { addToCart } = useCart();
  const { isWishlisted, toggle } = useWishlist();
  const [product, setProduct] = useState<Product | null>(null);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const galleryRef = useRef<FlatList<any>>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [affiliateLink, setAffiliateLink] = useState<AffiliateLink | null>(null);
  const [showAffiliateModal, setShowAffiliateModal] = useState(false);

  // ===== التعليقات والتقييمات (معروضة مباشرة تحت الصور، بدون الحاجة لصفحة منفصلة) =====
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [votes, setVotes] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<ReviewSort>('newest');
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewBody, setReviewBody] = useState('');
  const [reviewImages, setReviewImages] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewLightbox, setReviewLightbox] = useState<{ images: string[]; index: number } | null>(null);

  const load = useCallback(async () => {
    if (!slug) return;
    const { data: prod } = await supabase
      .from('products')
      .select(`*, category:categories(*)`)
      .eq('slug', slug)
      .maybeSingle();
    if (!prod) return;
    const p = prod as Product;

    const [imgsRes, variantsRes] = await Promise.all([
      supabase.from('product_images').select('*').eq('product_id', p.id).order('sort_order'),
      supabase.from('product_variants').select('*').eq('product_id', p.id),
    ]);

    const images = imgsRes.data ?? [];
    const fullProduct = { ...p, images: images as any };
    setProduct(fullProduct);
    setVariants((variantsRes.data as ProductVariant[]) ?? []);

    // Track affiliate click if visitor arrived via affiliate link
    if (ref) {
      try {
        await AsyncStorage.setItem('affiliate_ref', ref);
        await supabase.rpc('track_affiliate_click', {
          p_affiliate_code: ref,
          p_user_id: user?.id ?? null,
        });
      } catch {}
    }

    // Load affiliate link for publishers
    if (user && profile?.role === 'publisher') {
      const { data: affData } = await supabase
        .from('affiliate_links')
        .select('*')
        .eq('user_id', user.id)
        .eq('product_id', p.id)
        .maybeSingle();
      setAffiliateLink(affData as AffiliateLink | null);
    }

    const sizes = Array.from(new Set((variantsRes.data as ProductVariant[])?.map(v => v.size) ?? []));
    const colorOpts = Array.from(new Set((variantsRes.data as ProductVariant[])?.map(v => v.color) ?? []));
    if (sizes.length === 1) setSelectedSize(sizes[0]);
    if (colorOpts.length === 1) setSelectedColor(colorOpts[0]);
  }, [slug]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // تحميل التعليقات مع دعم الفرز، مستقلّة عن تحميل بيانات المنتج الأساسية
  const loadReviews = useCallback(async () => {
    if (!product?.id) return;
    setReviewsLoading(true);
    try {
      const revs = await fetchReviews(product.id, sort);
      setReviews(revs);
      if (user) setVotes(await fetchMyHelpfulVotes(revs.map(r => r.id)));
    } catch (e: any) {
      // لا نزعج المستخدم برسالة خطأ أثناء تصفح المنتج، فقط نترك القسم فارغاً
    } finally {
      setReviewsLoading(false);
    }
  }, [product?.id, sort, user]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const reviewStats = useMemo(() => computeStats(reviews), [reviews]);
  const myReview = useMemo(
    () => (user ? reviews.find(r => r.user_id === user.id) ?? null : null),
    [reviews, user]
  );

  const resetReviewForm = () => {
    setEditingReviewId(null);
    setReviewRating(5);
    setReviewTitle('');
    setReviewBody('');
    setReviewImages([]);
    setUploadPercent(0);
  };

  const openReviewForm = () => {
    if (!user) {
      Alert.alert(t('Sign in required'), t('Please sign in to leave a review.'));
      return;
    }
    resetReviewForm();
    setShowReviewForm(true);
  };

  const openEditReview = (review: Review) => {
    setEditingReviewId(review.id);
    setReviewRating(review.rating);
    setReviewTitle(review.title ?? '');
    setReviewBody(review.body ?? '');
    setReviewImages(review.images ?? []);
    setShowReviewForm(true);
  };

  const addReviewImage = async () => {
    if (reviewImages.length >= MAX_REVIEW_IMAGES) {
      Alert.alert(t('Limit reached'), t('You can attach up to 4 photos.'));
      return;
    }
    setUploadingImage(true);
    setUploadPercent(0);
    try {
      const url = await pickAndUploadReviewImage(setUploadPercent);
      if (url) setReviewImages(prev => [...prev, url]);
    } catch (e: any) {
      Alert.alert(t('Upload failed'), e?.message ?? t('Something went wrong'));
    } finally {
      setUploadingImage(false);
      setUploadPercent(0);
    }
  };

  const submitReview = async () => {
    if (!user || !product) return;
    if (!reviewBody.trim()) {
      Alert.alert(t('Review required'), t('Please write your review'));
      return;
    }
    setSubmittingReview(true);
    try {
      if (editingReviewId) {
        await updateReview(editingReviewId, {
          rating: reviewRating,
          title: reviewTitle,
          body: reviewBody,
          images: reviewImages,
        });
      } else {
        await createReview({
          productId: product.id,
          rating: reviewRating,
          title: reviewTitle,
          body: reviewBody,
          images: reviewImages,
          userName: profile?.full_name ?? user.email?.split('@')[0] ?? null,
          userAvatar: profile?.avatar_url ?? null,
        });
      }
      resetReviewForm();
      setShowReviewForm(false);
      await loadReviews();
      Alert.alert(t('Success'), t('Your review has been submitted!'));
    } catch (e: any) {
      Alert.alert(t('Error'), e?.message ?? t('Something went wrong'));
    } finally {
      setSubmittingReview(false);
    }
  };

  const removeMyReview = (review: Review) => {
    Alert.alert(t('Delete comment?'), t('This action cannot be undone.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteReview(review.id);
            await loadReviews();
          } catch (e: any) {
            Alert.alert(t('Error'), e?.message ?? t('Something went wrong'));
          }
        },
      },
    ]);
  };

  const onHelpfulPress = async (review: Review) => {
    if (!user) {
      Alert.alert(t('Sign in required'), t('Please sign in to leave a review.'));
      return;
    }
    const voted = votes.has(review.id);
    setVotes(prev => {
      const next = new Set(prev);
      if (voted) next.delete(review.id);
      else next.add(review.id);
      return next;
    });
    setReviews(prev =>
      prev.map(r =>
        r.id === review.id
          ? { ...r, helpful_count: Math.max(0, r.helpful_count + (voted ? -1 : 1)) }
          : r
      )
    );
    try {
      await toggleHelpful(review.id, voted);
    } catch {
      await loadReviews();
    }
  };

  /**
   * استئناف عملية الشراء بعد تسجيل الدخول / إنشاء الحساب:
   * نعيد اختيار المقاس واللون ثم نكمل إلى صفحة الدفع تلقائياً،
   * مع الحفاظ على ارتباط الطلب برابط الأفلييت.
   */
  const resumedRef = useRef(false);
  useEffect(() => {
    if (!user || !product || resumedRef.current) return;
    resumedRef.current = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('pending_purchase');
        if (!raw) return;
        const pending = JSON.parse(raw) as {
          slug?: string;
          ref?: string | null;
          intent?: 'cart' | 'buy';
          size?: string | null;
          color?: string | null;
        };
        if (!pending?.slug || pending.slug !== slug) return;
        await AsyncStorage.removeItem('pending_purchase');
        if (pending.ref) {
          await AsyncStorage.setItem('affiliate_ref', pending.ref);
        }
        const size = pending.size ?? selectedSize;
        const color = pending.color ?? selectedColor;
        if (size) setSelectedSize(size);
        if (color) setSelectedColor(color);
        if (!size && variants.some(v => v.size)) return;
        if (!color && variants.some(v => v.color)) return;

        await addToCart(product, size ?? 'One Size', color ?? 'Default', 1);
        if (pending.intent === 'buy') {
          router.push('/checkout');
        } else {
          Alert.alert(t('Success'), t('Added to cart!'));
        }
      } catch {}
    })();
  }, [user, product, slug, variants, selectedSize, selectedColor, addToCart]);



  /**
   * الزائر غير المسجّل: يُحفظ رابط المنتج مع كود الأفلييت ثم يُنقل إلى
   * تسجيل الدخول / إنشاء حساب، وبعد نجاح العملية يعود إلى نفس المنتج
   * ويبقى مربوطاً بالناشر (كود الأفلييت محفوظ في AsyncStorage + في الرابط).
   */
  const goToAuthWithReturn = async (intent: 'cart' | 'buy' | 'chat') => {
    const refCode = typeof ref === 'string' && ref ? ref : null;
    try {
      if (refCode) await AsyncStorage.setItem('affiliate_ref', refCode);
      await AsyncStorage.setItem(
        'pending_purchase',
        JSON.stringify({
          slug,
          ref: refCode,
          intent,
          size: selectedSize,
          color: selectedColor,
        })
      );
    } catch {}

    const returnPath = `/product/${slug}${refCode ? `?ref=${encodeURIComponent(refCode)}` : ''}`;
    router.push(
      `/auth/login?redirect=${encodeURIComponent(returnPath)}&intent=${intent}` +
        (refCode ? `&ref=${encodeURIComponent(refCode)}` : '')
    );
  };

  const [openingChat, setOpeningChat] = useState(false);

  // فتح محادثة مع تاجر المنتج (تُنشأ تلقائياً إن لم تكن موجودة)
  const handleChatWithMerchant = async () => {
    if (!product) return;
    if (!user) {
      await goToAuthWithReturn('chat');
      return;
    }
    setOpeningChat(true);
    try {
      const chat = await openProductChat(product.id);
      playFeedback('message');
      router.push(`/chat/${chat.id}`);
    } catch (e: any) {
      Alert.alert(t('Error'), e?.message ?? 'تعذّر فتح المحادثة مع التاجر');
    } finally {
      setOpeningChat(false);
    }
  };

  const handleAddToCart = async () => {
    if (!product) return;
    if (!user) {
      await goToAuthWithReturn('cart');
      return;
    }
    if (!selectedSize && variants.some(v => v.size)) {
      Alert.alert(t('Select size'), t('Please select a size first.'));
      return;
    }
    if (!selectedColor && variants.some(v => v.color)) {
      Alert.alert(t('Select color'), t('Please select a color first.'));
      return;
    }
    setAdding(true);
    try {
      await addToCart(product, selectedSize ?? 'One Size', selectedColor ?? 'Default', 1);
      playFeedback('addToCart');
      Alert.alert(t('Success'), t('Added to cart!'), [
        { text: t('Continue Shopping'), style: 'cancel' },
        { text: t('View Cart'), onPress: () => router.push('/(tabs)/cart') },
      ]);
    } catch (e: any) {
      playFeedback('error');
      Alert.alert(t('Error'), e.message ?? t('Failed to add to cart'));
    } finally {
      setAdding(false);
    }
  };

  const handleBuyNow = async () => {
    if (!product) return;
    if (!user) {
      await goToAuthWithReturn('buy');
      return;
    }
    if (!selectedSize && variants.some(v => v.size)) {
      Alert.alert(t('Select size'), t('Please select a size first.'));
      return;
    }
    if (!selectedColor && variants.some(v => v.color)) {
      Alert.alert(t('Select color'), t('Please select a color first.'));
      return;
    }
    setAdding(true);
    try {
      await addToCart(product, selectedSize ?? 'One Size', selectedColor ?? 'Default', 1);
      router.push('/checkout');
    } catch (e: any) {
      Alert.alert(t('Error'), e.message ?? t('Failed to process'));
    } finally {
      setAdding(false);
    }

  };

  if (loading) return <LoadingState />;
  if (!product) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={styles.notFound}>Product not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const sizes = Array.from(new Set(variants.map(v => v.size)));
  const colorOptions = Array.from(new Set(variants.map(v => v.color)));
  const hasDiscount = product.compare_at_price && product.compare_at_price > product.price;
  const wished = isWishlisted(product.id);
  // الصور مرتّبة: الصورة الرئيسية أولاً (وهي التي تظهر بالصفحة الرئيسية)
  const images = sortProductImages(product.images);
  const imageUrls = images.map(i => i.image_url).filter(Boolean);
  const displayRating = reviewStats.total ? reviewStats.average : product.rating;
  const displayReviewCount = reviewStats.total || product.review_count;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => toggle(product.id).catch(() => {})}
          >
            <Heart
              size={22}
              color={wished ? colors.error[500] : colors.text}
              fill={wished ? colors.error[500] : 'transparent'}
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn}>
            <Share2 size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View>
          <FlatList
            ref={galleryRef}
            data={images.length > 0 ? images : [{ id: 'placeholder', image_url: '', product_id: '', sort_order: 0 }]}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item, i) => item.id ?? `img-${i}`}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / width);
              setActiveImage(idx);
            }}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                style={styles.imageWrap}
                activeOpacity={0.95}
                disabled={!item.image_url}
                onPress={() => {
                  setLightboxIndex(index);
                  setLightboxOpen(true);
                }}
              >
                {item.image_url ? (
                  <Image source={{ uri: item.image_url }} style={styles.image} resizeMode="cover" />
                ) : (
                  <View style={[styles.image, { backgroundColor: colors.neutral[200] }]} />
                )}
              </TouchableOpacity>
            )}
          />

          {imageUrls.length > 0 ? (
            <>
              <TouchableOpacity
                style={styles.zoomBtn}
                onPress={() => {
                  setLightboxIndex(activeImage);
                  setLightboxOpen(true);
                }}
                accessibilityLabel="عرض الصورة بالحجم الكامل"
              >
                <Maximize2 size={16} color={colors.white} />
              </TouchableOpacity>
              {images.length > 1 ? (
                <View style={styles.imageCounter}>
                  <Text style={styles.imageCounterText}>
                    {activeImage + 1} / {images.length}
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
        </View>

        {images.length > 1 ? (
          <>
            <View style={styles.dots}>
              {images.map((_, i) => (
                <View key={i} style={[styles.dot, i === activeImage && styles.dotActive]} />
              ))}
            </View>
            <FlatList
              data={images}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item, i) => `thumb-${item.id ?? i}`}
              contentContainerStyle={styles.thumbRow}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    setActiveImage(index);
                    galleryRef.current?.scrollToOffset({ offset: index * width, animated: true });
                  }}
                >
                  <Image
                    source={{ uri: item.image_url }}
                    style={[styles.thumbImg, index === activeImage && styles.thumbImgActive]}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              )}
            />
          </>
        ) : null}
        <View style={styles.content}>
          <Text style={styles.brand}>{product.brand ?? ''}</Text>
          <Text style={styles.name}>{product.name}</Text>
          <View style={styles.ratingRow}>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map(i => (
                <Star
                  key={i}
                  size={16}
                  color={i <= Math.round(displayRating) ? colors.accent[500] : colors.neutral[300]}
                  fill={i <= Math.round(displayRating) ? colors.accent[500] : 'transparent'}
                />
              ))}
            </View>
            <Text style={styles.ratingText}>{displayRating.toFixed(1)}</Text>
            <Text style={styles.reviewCount}>({displayReviewCount} reviews)</Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatSyp(product.price)}</Text>
            {hasDiscount ? (
              <>
                <Text style={styles.oldPrice}>{formatSyp(product.compare_at_price!)}</Text>
                <View style={styles.discountBadge}>
                  <Text style={styles.discountText}>
                    {Math.round(((product.compare_at_price! - product.price) / product.compare_at_price!) * 100)}% OFF
                  </Text>
                </View>
              </>
            ) : null}
          </View>
          {colorOptions.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Color: <Text style={styles.sectionValue}>{selectedColor ?? 'Select'}</Text></Text>
              <View style={styles.optionsRow}>
                {colorOptions.map(c => {
                  const v = variants.find(v => v.color === c);
                  return (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.colorOption,
                        selectedColor === c && styles.colorOptionActive,
                      ]}
                      onPress={() => setSelectedColor(c)}
                    >
                      <View
                        style={[
                          styles.colorSwatch,
                          { backgroundColor: v?.color_hex ?? colors.neutral[400] },
                        ]}
                      />
                      <Text style={styles.colorLabel}>{c}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}
          {sizes.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sizeHeader}>
                <Text style={styles.sectionLabel}>Size: <Text style={styles.sectionValue}>{selectedSize ?? 'Select'}</Text></Text>
                <TouchableOpacity
                  style={styles.sizeGuideBtn}
                  onPress={() => router.push('/size-guide')}
                >
                  <Ruler size={14} color={colors.primary[600]} />
                  <Text style={styles.sizeGuideText}>Size Guide</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.optionsRow}>
                {sizes.map(s => {
                  const inStock = variants.some(v => v.size === s && v.stock > 0);
                  return (
                    <TouchableOpacity
                      key={s}
                      disabled={!inStock}
                      style={[
                        styles.sizeOption,
                        selectedSize === s && styles.sizeOptionActive,
                        !inStock && styles.sizeOptionDisabled,
                      ]}
                      onPress={() => setSelectedSize(s)}
                    >
                      <Text
                        style={[
                          styles.sizeText,
                          selectedSize === s && styles.sizeTextActive,
                          !inStock && styles.sizeTextDisabled,
                        ]}
                      >
                        {s}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}
          <View style={styles.featuresRow}>
            <View style={styles.feature}>
              <Truck size={20} color={colors.primary[600]} />
              <Text style={styles.featureText}>Free shipping{'\n'}over 50,000 ل.س</Text>
            </View>
            <View style={styles.feature}>
              <RefreshCw size={20} color={colors.primary[600]} />
              <Text style={styles.featureText}>30-day{'\n'}returns</Text>
            </View>
            <View style={styles.feature}>
              <Shield size={20} color={colors.primary[600]} />
              <Text style={styles.featureText}>Secure{'\n'}payment</Text>
            </View>
          </View>
          {product.description ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.description}>{product.description}</Text>
            </View>
          ) : null}
          {product.material ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Material</Text>
              <Text style={styles.description}>{product.material}</Text>
            </View>
          ) : null}

          {/* ===== قسم التعليقات والتقييمات — معروض بالكامل هنا مباشرة تحت الصور،
               بما فيه إضافة تعليق، دون الحاجة للانتقال إلى صفحة أخرى ===== */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Ratings & Reviews ({displayReviewCount})</Text>
            </View>

            <View style={styles.summaryCard}>
              <View style={styles.summaryLeft}>
                <Text style={styles.bigRating}>{displayRating.toFixed(1)}</Text>
                <View style={styles.stars}>
                  {[1, 2, 3, 4, 5].map(i => (
                    <Star
                      key={i}
                      size={16}
                      color={i <= Math.round(displayRating) ? colors.accent[500] : colors.neutral[300]}
                      fill={i <= Math.round(displayRating) ? colors.accent[500] : 'transparent'}
                    />
                  ))}
                </View>
                <Text style={styles.reviewCount}>{`${displayReviewCount} ${t('reviews')}`}</Text>
              </View>
              <View style={styles.breakdown}>
                {[5, 4, 3, 2, 1].map(starValue => {
                  const count = reviewStats.breakdown[starValue as 1 | 2 | 3 | 4 | 5] ?? 0;
                  const pct = reviewStats.total ? (count / reviewStats.total) * 100 : 0;
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

            {!showReviewForm ? (
              <Button
                title={myReview ? 'Edit your review' : 'Write a Review'}
                onPress={() => (myReview ? openEditReview(myReview) : openReviewForm())}
                variant="outline"
                fullWidth
              />
            ) : null}

            {showReviewForm ? (
              <View style={styles.reviewFormCard}>
                <View style={styles.formHeader}>
                  <Text style={styles.formTitle}>
                    {editingReviewId ? 'Edit your review' : 'Write a Review'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowReviewForm(false);
                      resetReviewForm();
                    }}
                  >
                    <X size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.formLabel}>Your Rating</Text>
                <View style={styles.formRatingRow}>
                  {[1, 2, 3, 4, 5].map(i => (
                    <TouchableOpacity key={i} onPress={() => setReviewRating(i)} activeOpacity={0.7}>
                      <Star
                        size={32}
                        color={i <= reviewRating ? colors.accent[500] : colors.neutral[300]}
                        fill={i <= reviewRating ? colors.accent[500] : 'transparent'}
                      />
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.formLabel}>Title (Optional)</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Summarize your review"
                  value={reviewTitle}
                  onChangeText={setReviewTitle}
                />

                <Text style={styles.formLabel}>Review</Text>
                <TextInput
                  style={[styles.formInput, styles.formTextArea]}
                  placeholder="What did you like or dislike?"
                  value={reviewBody}
                  onChangeText={setReviewBody}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />

                <Text style={styles.formLabel}>Photos (Optional)</Text>
                <View style={styles.reviewThumbRow}>
                  {reviewImages.map((uri, idx) => (
                    <View key={`${uri}-${idx}`} style={styles.reviewThumbWrap}>
                      <TouchableOpacity onPress={() => setReviewLightbox({ images: reviewImages, index: idx })}>
                        <Image source={{ uri }} style={styles.reviewThumb} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.reviewThumbRemove}
                        onPress={() => setReviewImages(prev => prev.filter((_, i) => i !== idx))}
                      >
                        <X size={12} color={colors.white} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {reviewImages.length < MAX_REVIEW_IMAGES ? (
                    <TouchableOpacity
                      style={styles.addReviewThumb}
                      onPress={addReviewImage}
                      disabled={uploadingImage}
                      activeOpacity={0.7}
                    >
                      {uploadingImage ? (
                        <>
                          <ActivityIndicator size="small" color={colors.primary[600]} />
                          <Text style={styles.addReviewThumbText}>{`${uploadPercent}%`}</Text>
                        </>
                      ) : (
                        <>
                          <Camera size={20} color={colors.primary[600]} />
                          <Text style={styles.addReviewThumbText}>Add photo</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>

                <Button
                  title={submittingReview ? 'Submitting...' : editingReviewId ? 'Save changes' : 'Submit Review'}
                  onPress={submitReview}
                  loading={submittingReview}
                  disabled={uploadingImage}
                  fullWidth
                />
              </View>
            ) : null}

            {reviews.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.sortRow}
              >
                {SORTS.map(s => (
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
            ) : null}

            {reviewsLoading ? (
              <ActivityIndicator style={{ marginVertical: spacing.md }} color={colors.primary[600]} />
            ) : reviews.length > 0 ? (
              reviews.map(item => {
                const mine = user?.id === item.user_id;
                const voted = votes.has(item.id);
                const name = item.user_name || t('Customer');
                return (
                  <View key={item.id} style={styles.reviewCard}>
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
                            <View style={styles.reviewBadge}>
                              <ShieldCheck size={11} color={colors.primary[600]} />
                              <Text style={styles.reviewBadgeText}>You</Text>
                            </View>
                          ) : null}
                        </View>
                        <View style={styles.reviewMetaRow}>
                          <View style={styles.stars}>
                            {[1, 2, 3, 4, 5].map(i => (
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
                        contentContainerStyle={styles.reviewImagesRow}
                      >
                        {item.images.map((uri, idx) => (
                          <TouchableOpacity
                            key={`${item.id}-${idx}`}
                            onPress={() => setReviewLightbox({ images: item.images, index: idx })}
                            activeOpacity={0.85}
                          >
                            <Image source={{ uri }} style={styles.reviewImage} />
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    ) : null}

                    <View style={styles.reviewFooter}>
                      <TouchableOpacity style={styles.helpfulBtn} onPress={() => onHelpfulPress(item)}>
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
                        <View style={styles.reviewOwnerActions}>
                          <TouchableOpacity style={styles.helpfulBtn} onPress={() => openEditReview(item)}>
                            <Pencil size={14} color={colors.textMuted} />
                            <Text style={styles.helpfulText}>Edit</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.helpfulBtn} onPress={() => removeMyReview(item)}>
                            <Trash2 size={14} color={colors.error[500]} />
                            <Text style={styles.helpfulText}>Delete</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={styles.reviewBody}>Be the first to review this product</Text>
            )}
          </View>

          {isPublisher && product && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Affiliate Program</Text>
              <View style={styles.affiliateCard}>
                <View style={styles.affiliateHeader}>
                  <View style={styles.affiliateIcon}>
                    <Link2 size={20} color={colors.white} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.affiliateTitle}>Earn 10% Commission</Text>
                    <Text style={styles.affiliateDesc}>Share your link and earn from every sale</Text>
                  </View>
                </View>
                {affiliateLink ? (
                  <View>
                    <Text style={styles.affiliateUrlLabel}>Your Affiliate Link</Text>
                    <Text style={styles.affiliateUrl} selectable>
                      {WEBSITE_URL}/product/{product.slug}?ref={affiliateLink.affiliate_code}
                    </Text>
                    <View style={styles.affiliateStats}>
                      <View style={styles.affiliateStat}>
                        <Text style={styles.affiliateStatValue}>{affiliateLink.clicks_count}</Text>
                        <Text style={styles.affiliateStatLabel}>Clicks</Text>
                      </View>
                      <View style={styles.affiliateStat}>
                        <Text style={styles.affiliateStatValue}>{affiliateLink.purchases_count}</Text>
                        <Text style={styles.affiliateStatLabel}>Sales</Text>
                      </View>
                      <View style={styles.affiliateStat}>
                        <Text style={styles.affiliateStatValue}>{formatSyp(affiliateLink.total_earnings)}</Text>
                        <Text style={styles.affiliateStatLabel}>Earned</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <Button
                    title="Generate Affiliate Link"
                    onPress={async () => {
                      if (!user) return;
                      const code = `AFF-${user.id.slice(0, 8)}-${Date.now().toString(36)}`;
                      const { data, error } = await supabase
                        .from('affiliate_links')
                        .insert({
                          user_id: user.id,
                          product_id: product.id,
                          affiliate_code: code,
                        })
                        .select()
                        .single();
                      if (!error && data) {
                        setAffiliateLink(data as AffiliateLink);
                      }
                    }}
                    size="sm"
                    fullWidth
                  />
                )}
              </View>
            </View>
          )}
          <View style={{ height: 100 }} />
        </View>
      </ScrollView>
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.chatBtn}
          onPress={handleChatWithMerchant}
          disabled={openingChat}
          accessibilityLabel="التحدث مع التاجر"
        >
          {openingChat ? (
            <ActivityIndicator size="small" color={colors.primary[600]} />
          ) : (
            <MessageCircle size={22} color={colors.primary[600]} />
          )}
          <Text style={styles.chatBtnText}>التحدث مع التاجر</Text>
        </TouchableOpacity>
        <Button
          title="Add to Cart"
          onPress={handleAddToCart}
          variant="outline"
          loading={adding}
          style={{ flex: 1 }}
        />
        <Button
          title="Buy Now"
          onPress={handleBuyNow}
          loading={adding}
          style={{ flex: 1 }}
        />
      </View>

      {/* عارض الصور بالحجم الكامل - صور المنتج */}
      <ImageLightbox
        visible={lightboxOpen}
        images={imageUrls}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
      />

      {/* عارض الصور بالحجم الكامل - صور التعليقات */}
      <ImageLightbox
        visible={!!reviewLightbox}
        images={reviewLightbox?.images ?? []}
        initialIndex={reviewLightbox?.index ?? 0}
        onClose={() => setReviewLightbox(null)}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  headerRight: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtn: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  imageCounter: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  imageCounterText: { ...typography.caption, color: colors.white, fontWeight: '700' },
  thumbRow: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  thumbImg: {
    width: 58,
    height: 58,
    borderRadius: radius.sm,
    backgroundColor: colors.neutral[100],
    borderWidth: 2,
    borderColor: 'transparent',
    opacity: 0.7,
  },
  thumbImgActive: { borderColor: colors.primary[600], opacity: 1 },
  imageWrap: {
    width,
    height: width,
    backgroundColor: colors.neutral[100],
  },
  image: {
    width: '100%',
    height: '100%',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.neutral[300],
  },
  dotActive: {
    backgroundColor: colors.primary[600],
    width: 24,
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
  },
  brand: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  name: {
    ...typography.h2,
    color: colors.text,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stars: {
    flexDirection: 'row',
    gap: 2,
  },
  ratingText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  reviewCount: {
    ...typography.bodySmall,
    color: colors.textMuted,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  price: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  oldPrice: {
    ...typography.body,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  discountBadge: {
    backgroundColor: colors.error[500],
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  discountText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  sectionValue: {
    color: colors.text,
    fontWeight: '600',
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.text,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  colorOption: {
    alignItems: 'center',
    gap: 4,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  colorOptionActive: {
    borderColor: colors.primary[600],
    backgroundColor: colors.primary[50],
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  colorLabel: {
    ...typography.caption,
    color: colors.text,
  },
  sizeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sizeGuideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sizeGuideText: {
    ...typography.caption,
    color: colors.primary[600],
    fontWeight: '600',
  },
  sizeOption: {
    minWidth: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  sizeOptionActive: {
    borderColor: colors.primary[600],
    backgroundColor: colors.primary[600],
  },
  sizeOptionDisabled: {
    opacity: 0.4,
  },
  sizeText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  sizeTextActive: {
    color: colors.white,
  },
  sizeTextDisabled: {
    textDecorationLine: 'line-through',
  },
  featuresRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  feature: {
    alignItems: 'center',
    gap: 4,
  },
  featureText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 24,
  },

  // ===== أنماط قسم التعليقات والتقييمات =====
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
  reviewFormCard: {
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
  formRatingRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  formInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.background,
  },
  formTextArea: {
    minHeight: 100,
  },
  reviewThumbRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  reviewThumbWrap: {
    position: 'relative',
  },
  reviewThumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.neutral[100],
  },
  reviewThumbRemove: {
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
  addReviewThumb: {
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
  addReviewThumbText: {
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
  reviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.primary[100],
  },
  reviewBadgeText: {
    ...typography.caption,
    fontSize: 10,
    color: colors.primary[600],
    fontWeight: '700',
  },
  reviewMetaRow: {
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
    marginBottom: 2,
  },
  reviewBody: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  reviewImagesRow: {
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
  reviewOwnerActions: {
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

  chatBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.primary[200],
    backgroundColor: colors.primary[50],
    gap: 2,
  },
  chatBtnText: {
    ...typography.caption,
    color: colors.primary[700],
    fontWeight: '700',
    fontSize: 10,
  },
  bottomBar: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  notFound: {
    ...typography.h4,
    color: colors.text,
  },
  affiliateCard: {
    backgroundColor: colors.primary[50],
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  affiliateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  affiliateIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  affiliateTitle: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.primary[700],
  },
  affiliateDesc: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  affiliateUrlLabel: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  affiliateUrl: {
    ...typography.caption,
    color: colors.primary[600],
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  affiliateStats: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  affiliateStat: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  affiliateStatValue: {
    ...typography.h4,
    color: colors.primary[700],
    fontWeight: '700',
  },
  affiliateStatLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
