import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
  Image,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, SlidersHorizontal, ArrowUpDown } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { ProductCard } from '@/components/ProductCard';
import { LoadingState } from '@/components/LoadingState';
import { EmptyState } from '@/components/EmptyState';
import { BannerSlot } from '@/components/BannerSlot';
import type { Product, Category } from '@/lib/supabase';
import { ArabicText as Text } from '@/components/ArabicText';
import { getChildren, getDescendantIds, getCategoryPath } from '@/lib/categories';

type SortOption = 'newest' | 'price_asc' | 'price_desc' | 'rating';

export default function CategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [category, setCategory] = useState<Category | null>(null);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showSortMenu, setShowSortMenu] = useState(false);

  const load = useCallback(async () => {
    if (!slug) return;
    const [{ data: cat }, { data: allCats }] = await Promise.all([
      supabase.from('categories').select('*').eq('slug', slug).maybeSingle(),
      supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
    ]);
    setCategory(cat as Category | null);
    setAllCategories((allCats as Category[]) ?? []);

    if (!cat) {
      setProducts([]);
      return;
    }

    // كل منتجات هذا التصنيف + كل تصنيفاته الفرعية بعمق غير محدود (قسم كامل مثلاً)
    const categoryIds = getDescendantIds((allCats as Category[]) ?? [cat as Category], cat.id);

    let query = supabase
      .from('products')
      .select(`*, images:product_images(*)`)
      .eq('status', 'active')
      .in('category_id', categoryIds);

    switch (sortBy) {
      case 'price_asc':
        query = query.order('price', { ascending: true });
        break;
      case 'price_desc':
        query = query.order('price', { ascending: false });
        break;
      case 'rating':
        query = query.order('rating', { ascending: false });
        break;
      default:
        query = query.order('created_at', { ascending: false });
    }

    const { data } = await query.limit(50);
    setProducts((data as Product[]) ?? []);
  }, [slug, sortBy]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const subCategories = useMemo(
    () => (category ? getChildren(allCategories, category.id) : []),
    [allCategories, category]
  );
  const categoryIds = useMemo(
    () => (category ? getDescendantIds(allCategories, category.id) : []),
    [allCategories, category]
  );
  const breadcrumb = useMemo(
    () => (category ? getCategoryPath(allCategories, category.id) : []),
    [allCategories, category]
  );

  if (loading) return <LoadingState />;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{category?.name ?? 'التصنيف'}</Text>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => setShowSortMenu(!showSortMenu)}
        >
          <ArrowUpDown size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {breadcrumb.length > 1 ? (
        <View style={styles.breadcrumbRow}>
          {breadcrumb.map((c, i) => (
            <View key={c.id} style={styles.breadcrumbItem}>
              {i > 0 ? <Text style={styles.breadcrumbSep}>›</Text> : null}
              <Text
                style={[
                  styles.breadcrumbText,
                  i === breadcrumb.length - 1 && styles.breadcrumbTextActive,
                ]}
                numberOfLines={1}
                onPress={() => i < breadcrumb.length - 1 && router.push(`/category/${c.slug}`)}
              >
                {c.name}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {showSortMenu ? (
        <View style={styles.sortMenu}>
          {([
            { key: 'newest', label: 'الأحدث' },
            { key: 'price_asc', label: 'السعر: من الأقل للأعلى' },
            { key: 'price_desc', label: 'السعر: من الأعلى للأقل' },
            { key: 'rating', label: 'الأعلى تقييماً' },
          ] as { key: SortOption; label: string }[]).map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.sortItem, sortBy === opt.key && styles.sortItemActive]}
              onPress={() => { setSortBy(opt.key); setShowSortMenu(false); }}
            >
              <Text
                style={[
                  styles.sortItemText,
                  sortBy === opt.key && styles.sortItemTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <FlatList
        data={products}
        numColumns={2}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
        columnWrapperStyle={{ gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <BannerSlot placement="category" categoryIds={categoryIds} />
            {subCategories.length > 0 ? (
              <View>
                <Text style={styles.subHeading}>تصنيفات فرعية</Text>
                <View style={styles.subGrid}>
                  {subCategories.map((sc) => (
                    <TouchableOpacity
                      key={sc.id}
                      style={styles.subCard}
                      onPress={() => router.push(`/category/${sc.slug}`)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.subImageWrap}>
                        {sc.image_url ? (
                          <Image source={{ uri: sc.image_url }} style={styles.subImage} resizeMode="cover" />
                        ) : (
                          <View style={[styles.subImage, { backgroundColor: colors.neutral[200] }]} />
                        )}
                      </View>
                      <Text style={styles.subCardText} numberOfLines={1}>{sc.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={<SlidersHorizontal size={48} color={colors.neutral[300]} />}
            title="لا توجد منتجات"
            message="عد لاحقاً للاطلاع على منتجات جديدة في هذا التصنيف"
          />
        }
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            onPress={() => router.push(`/product/${item.slug}`)}
          />
        )}
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
  backBtn: {
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
    flex: 1,
    textAlign: 'center',
  },
  breadcrumbRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  breadcrumbItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  breadcrumbSep: { ...typography.caption, color: colors.neutral[300], marginHorizontal: 4 },
  breadcrumbText: { ...typography.caption, color: colors.textMuted },
  breadcrumbTextActive: { color: colors.primary[600], fontWeight: '700' },
  subHeading: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  subGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  subCard: {
    width: 76,
    alignItems: 'center',
  },
  subImageWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
  },
  subImage: { width: '100%', height: '100%' },
  subCardText: {
    ...typography.caption,
    color: colors.text,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  sortMenu: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sortItem: {
    paddingVertical: spacing.sm,
  },
  sortItemActive: {},
  sortItemText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  sortItemTextActive: {
    color: colors.primary[600],
    fontWeight: '600',
  },
});
