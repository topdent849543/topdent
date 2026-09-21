import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  FlatList,
  RefreshControl,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { Search, Bell, Menu, ChevronRight, TrendingUp, Sparkles, Tag, LayoutGrid } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { ProductCard } from '@/components/ProductCard';
import { LoadingState } from '@/components/LoadingState';
import { EmptyState } from '@/components/EmptyState';
import type { Product, Category, Banner } from '@/lib/supabase';
import { ArabicText as Text } from '@/components/ArabicText';
import { getDepartments, getChildren, getDescendantIds } from '@/lib/categories';

const { width } = Dimensions.get('window');
const BANNER_HEIGHT = 200;

export default function HomeScreen() {
  const { profile } = useAuth();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [newArrivals, setNewArrivals] = useState<Product[]>([]);
  const [bestSellers, setBestSellers] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeBanner, setActiveBanner] = useState(0);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);

  // القائمة الرئيسية: كل الأقسام (تصنيفات بدون تصنيف أب)
  const departments = useMemo(() => getDepartments(categories), [categories]);
  // التصنيفات الفرعية المباشرة للقسم المختار
  const subCategories = useMemo(
    () => (selectedDept ? getChildren(categories, selectedDept) : []),
    [categories, selectedDept]
  );
  // كل معرّفات القسم المختار + فروعه بعمق غير محدود — لعرض كل منتجاته
  const deptCategoryIds = useMemo(
    () => (selectedDept ? getDescendantIds(categories, selectedDept) : []),
    [categories, selectedDept]
  );

  // تحميل أولي: البنرات + الأقسام فقط، لتحديد القسم الافتراضي بسرعة
  const loadCategoriesAndBanners = useCallback(async () => {
    const [bannersRes, categoriesRes] = await Promise.all([
      supabase.from('banners').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
    ]);
    const cats = (categoriesRes.data as Category[]) ?? [];
    setBanners((bannersRes.data as Banner[]) ?? []);
    setCategories(cats);
    return cats;
  }, []);

  // تحميل منتجات القسم المختار حالياً
  const loadDeptProducts = useCallback(async (categoryIds: string[]) => {
    const scoped = (q: any) => (categoryIds.length > 0 ? q.in('category_id', categoryIds) : q);

    const [featuredRes, newRes, bestRes] = await Promise.all([
      scoped(
        supabase.from('products').select(`*, images:product_images(*)`).eq('status', 'active').eq('is_featured', true)
      ).limit(6),
      scoped(
        supabase.from('products').select(`*, images:product_images(*)`).eq('status', 'active').eq('is_new', true)
      ).limit(6),
      scoped(
        supabase.from('products').select(`*, images:product_images(*)`).eq('status', 'active').order('rating', { ascending: false })
      ).limit(10),
    ]);

    setFeatured((featuredRes.data as Product[]) ?? []);
    setNewArrivals((newRes.data as Product[]) ?? []);
    setBestSellers((bestRes.data as Product[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const cats = await loadCategoriesAndBanners();
      const depts = getDepartments(cats);
      const initialDept = depts[0]?.id ?? null;
      setSelectedDept(initialDept);
      const ids = initialDept ? getDescendantIds(cats, initialDept) : [];
      await loadDeptProducts(ids);
      setLoading(false);
    })();
  }, [loadCategoriesAndBanners, loadDeptProducts]);

  const onSelectDept = useCallback(
    async (deptId: string | null) => {
      if (deptId === selectedDept) return;
      setSelectedDept(deptId);
      setSectionsLoading(true);
      const ids = deptId ? getDescendantIds(categories, deptId) : [];
      await loadDeptProducts(ids);
      setSectionsLoading(false);
    },
    [selectedDept, categories, loadDeptProducts]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const cats = await loadCategoriesAndBanners();
    const stillExists = selectedDept && cats.some((c) => c.id === selectedDept);
    const dept = stillExists ? selectedDept : getDepartments(cats)[0]?.id ?? null;
    setSelectedDept(dept);
    const ids = dept ? getDescendantIds(cats, dept) : [];
    await loadDeptProducts(ids);
    setRefreshing(false);
  }, [loadCategoriesAndBanners, loadDeptProducts, selectedDept]);

  // البنرات الخاصة بهذا القسم (المرتبطة به) + البنرات العامة (بدون قسم)
  const bannersForDept = useMemo(
    () =>
      banners.filter((b) => !b.category_id || (selectedDept && deptCategoryIds.includes(b.category_id))),
    [banners, selectedDept, deptCategoryIds]
  );

  const noSectionsAtAll =
    !sectionsLoading && featured.length === 0 && newArrivals.length === 0 && bestSellers.length === 0;

  if (loading) return <LoadingState />;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Header />
        <DepartmentSwitcher
          departments={departments}
          selected={selectedDept}
          onSelect={onSelectDept}
        />
        <BannerSlider banners={bannersForDept} activeIndex={activeBanner} onChange={setActiveBanner} />
        {subCategories.length > 0 ? (
          <SubCategoryRow categories={subCategories} />
        ) : null}
        {sectionsLoading ? (
          <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
            <Text style={{ color: colors.textMuted }}>...جاري تحميل منتجات القسم</Text>
          </View>
        ) : noSectionsAtAll ? (
          <EmptyState
            icon={<LayoutGrid size={44} color={colors.neutral[300]} />}
            title="لا توجد منتجات في هذا القسم بعد"
            message="عد لاحقاً أو اختر قسماً آخر لتصفح المنتجات المتوفرة."
          />
        ) : (
          <>
            <FeaturedSection
              title="منتجات مميزة"
              icon={<Sparkles size={20} color={colors.primary[600]} />}
              products={featured}
            />
            <SecondaryBanner banner={bannersForDept.find((b) => b.placement === 'home_secondary')} />
            <FeaturedSection
              title="وصل حديثاً"
              icon={<TrendingUp size={20} color={colors.success[600]} />}
              products={newArrivals}
            />
            <FeaturedSection
              title="الأكثر مبيعاً"
              icon={<Tag size={20} color={colors.accent[600]} />}
              products={bestSellers}
            />
          </>
        )}
        <View style={{ height: spacing.lg }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <Image source={require('@/assets/images/varlo-logo.png')} style={styles.brandLogo} />
        <View>
          <Text style={styles.greeting}>مرحباً بك في</Text>
          <Text style={styles.brandName}>TopDent</Text>
        </View>
      </View>
      <View style={styles.headerIcons}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/(tabs)/search')}>
          <Search size={22} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/notifications')}>
          <Bell size={22} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/menu')}>
          <Menu size={22} color={colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** شريط تبديل الأقسام أعلى الصفحة الرئيسية — يحدد أي قسم (ملابس، إلكترونيات...) نشاهد محتواه حالياً. */
function DepartmentSwitcher({
  departments,
  selected,
  onSelect,
}: {
  departments: Category[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (departments.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.deptBar}
      contentContainerStyle={styles.deptBarContent}
    >
      {departments.map((dept) => {
        const active = selected === dept.id;
        return (
          <TouchableOpacity
            key={dept.id}
            style={[styles.deptPill, active && styles.deptPillActive]}
            onPress={() => onSelect(dept.id)}
            activeOpacity={0.85}
          >
            {dept.image_url ? (
              <Image source={{ uri: dept.image_url }} style={styles.deptPillImage} />
            ) : (
              <View style={[styles.deptPillImage, styles.deptPillImagePlaceholder]}>
                <LayoutGrid size={14} color={active ? colors.white : colors.primary[500]} />
              </View>
            )}
            <Text style={[styles.deptPillText, active && styles.deptPillTextActive]} numberOfLines={1}>
              {dept.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/** التصنيفات الفرعية للقسم المختار حالياً — تنقّل مباشر لصفحة كل تصنيف. */
function SubCategoryRow({ categories }: { categories: Category[] }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>تصنيفات هذا القسم</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/search')}>
          <Text style={styles.seeAll}>عرض الكل</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subCatRow}>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={styles.subCatCard}
            onPress={() => router.push(`/category/${cat.slug}`)}
            activeOpacity={0.85}
          >
            <View style={styles.categoryImageWrap}>
              {cat.image_url ? (
                <Image source={{ uri: cat.image_url }} style={styles.categoryImage} resizeMode="cover" />
              ) : (
                <View style={[styles.categoryImage, { backgroundColor: colors.neutral[200] }]} />
              )}
            </View>
            <Text style={styles.categoryName} numberOfLines={1}>
              {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function BannerSlider({ banners, activeIndex, onChange }: { banners: Banner[]; activeIndex: number; onChange: (i: number) => void }) {
  const slides = banners.filter(b => b.placement === 'home_slider');
  if (slides.length === 0) return null;
  return (
    <View style={styles.bannerContainer}>
      <FlatList
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          onChange(idx);
        }}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.banner}>
            <Image source={{ uri: item.image_url }} style={styles.bannerImage} resizeMode="cover" />
            <View style={styles.bannerOverlay} />
            <View style={styles.bannerContent}>
              <Text style={styles.bannerTitle}>{item.title}</Text>
              {item.subtitle ? <Text style={styles.bannerSubtitle}>{item.subtitle}</Text> : null}
              {item.cta_text ? (
                <TouchableOpacity
                  style={styles.bannerCta}
                  onPress={() => {
                    if (item.cta_link) {
                      const link = item.cta_link;
                      if (link.startsWith('/category/')) {
                        const slug = link.replace('/category/', '');
                        router.push(`/category/${slug}`);
                      } else if (link === '/coupons') {
                        router.push('/coupons');
                      }
                    }
                  }}
                >
                  <Text style={styles.bannerCtaText}>{item.cta_text}</Text>
                  <ChevronRight size={16} color={colors.white} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        )}
      />
      <View style={styles.dots}>
        {slides.map((_, i) => (
          <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

function FeaturedSection({ title, icon, products }: { title: string; icon: React.ReactNode; products: Product[] }) {
  if (products.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          {icon}
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(tabs)/search')}>
          <Text style={styles.seeAll}>عرض الكل</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={products}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View style={{ width: spacing.md }} />}
        contentContainerStyle={{ paddingHorizontal: spacing.md }}
        renderItem={({ item }) => (
          <View style={{ width: 160 }}>
            <ProductCard
              product={item}
              onPress={() => router.push(`/product/${item.slug}`)}
              priceColor={colors.error[500]}
            />
          </View>
        )}
      />
    </View>
  );
}

function SecondaryBanner({ banner }: { banner?: Banner }) {
  if (!banner) return null;
  return (
    <View style={styles.section}>
      <TouchableOpacity
        style={styles.secondaryBanner}
        activeOpacity={0.9}
        onPress={() => {
          if (banner.cta_link?.startsWith('/category/')) {
            router.push(banner.cta_link as any);
          } else {
            router.push('/coupons');
          }
        }}
      >
        <Image source={{ uri: banner.image_url }} style={styles.secondaryBannerImage} resizeMode="cover" />
        <View style={styles.secondaryBannerOverlay} />
        <View style={styles.secondaryBannerContent}>
          <Text style={styles.secondaryBannerTitle}>{banner.title}</Text>
          {banner.subtitle ? <Text style={styles.secondaryBannerSubtitle}>{banner.subtitle}</Text> : null}
          {banner.cta_text ? (
            <View style={styles.secondaryBannerCta}>
              <Text style={styles.secondaryBannerCtaText}>{banner.cta_text}</Text>
              <ChevronRight size={16} color={colors.white} />
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    </View>
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
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  greeting: {
    ...typography.caption,
    color: colors.textMuted,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  brandLogo: {
    width: 34,
    height: 34,
    borderRadius: 10,
  },
  brandName: {
    ...typography.h3,
    fontWeight: '800',
    color: colors.dental,
    letterSpacing: 2,
  },
  headerIcons: {
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
  deptBar: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  deptBarContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  deptPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.neutral[100],
    borderWidth: 1,
    borderColor: colors.border,
    marginEnd: spacing.xs,
  },
  deptPillActive: {
    backgroundColor: colors.dental,
    borderColor: colors.dental,
  },
  deptPillImage: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  deptPillImagePlaceholder: {
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  deptPillText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
    maxWidth: 110,
  },
  deptPillTextActive: {
    color: colors.white,
  },
  bannerContainer: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  banner: {
    width: width - spacing.md * 2,
    height: BANNER_HEIGHT,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  bannerContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  bannerTitle: {
    ...typography.h3,
    color: colors.white,
    fontWeight: '700',
  },
  bannerSubtitle: {
    ...typography.bodySmall,
    color: 'rgba(255,255,255,0.9)',
  },
  bannerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.dental,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  bannerCtaText: {
    ...typography.bodySmall,
    color: colors.white,
    fontWeight: '600',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.sm,
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
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.h4,
    fontWeight: '700',
    color: colors.text,
  },
  seeAll: {
    ...typography.bodySmall,
    color: colors.primary[600],
    fontWeight: '600',
  },
  subCatRow: {
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  subCatCard: {
    width: 76,
    alignItems: 'center',
  },
  categoryImageWrap: {
    width: 70,
    height: 70,
    borderRadius: 35,
    overflow: 'hidden',
    ...shadows.sm,
  },
  categoryImage: {
    width: '100%',
    height: '100%',
  },
  categoryName: {
    ...typography.caption,
    color: colors.text,
    marginTop: spacing.xs,
    fontWeight: '500',
    textAlign: 'center',
  },
  secondaryBanner: {
    marginHorizontal: spacing.md,
    height: 140,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  secondaryBannerImage: {
    width: '100%',
    height: '100%',
  },
  secondaryBannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  secondaryBannerContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    gap: 4,
  },
  secondaryBannerTitle: {
    ...typography.h4,
    color: colors.white,
    fontWeight: '700',
  },
  secondaryBannerSubtitle: {
    ...typography.bodySmall,
    color: 'rgba(255,255,255,0.9)',
  },
  secondaryBannerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  secondaryBannerCtaText: {
    ...typography.bodySmall,
    color: colors.white,
    fontWeight: '600',
  },
});
