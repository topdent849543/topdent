import { useEffect, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  SafeAreaView,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Search, X, ChevronRight, TrendingUp, Clock } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { ProductCard } from '@/components/ProductCard';
import { LoadingState } from '@/components/LoadingState';
import { EmptyState } from '@/components/EmptyState';
import type { Category, Product } from '@/lib/supabase';
import { ArabicText as Text, ArabicTextInput as TextInput } from '@/components/ArabicText';
import { BannerSlot } from '@/components/BannerSlot';
import { getDepartments } from '@/lib/categories';
import { t } from '@/lib/i18n';

export default function BrowseScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadCategories = useCallback(async () => {
    const { data } = await supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    setCategories(data as Category[] ?? []);
  }, []);

  useEffect(() => {
    loadCategories().finally(() => setLoading(false));
  }, [loadCategories]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCategories();
    setRefreshing(false);
  }, [loadCategories]);

  const performSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setSearching(true);
    setHasSearched(true);
    const { data } = await supabase
      .from('products')
      .select(`*, images:product_images(*)`)
      .eq('status', 'active')
      .or(`name.ilike.%${q}%,description.ilike.%${q}%,brand.ilike.%${q}%`)
      .limit(20);
    setResults((data as Product[]) ?? []);
    setSearching(false);
    setRecentSearches(prev => {
      const updated = [q, ...prev.filter(s => s !== q)].slice(0, 5);
      return updated;
    });
  }, []);

  if (loading) return <LoadingState />;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Browse</Text>
      </View>
      <View style={styles.searchBar}>
        <Search size={20} color={colors.neutral[400]} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search products, brands..."
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => performSearch(query)}
          returnKeyType="search"
        />
        {query ? (
          <TouchableOpacity onPress={() => { setQuery(''); performSearch(''); }}>
            <X size={20} color={colors.neutral[400]} />
          </TouchableOpacity>
        ) : null}
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        <BannerSlot placement="search" style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md }} />
        {hasSearched ? (
          searching ? (
            <View style={{ padding: spacing.xl, alignItems: 'center' }}>
              <ActivityIndicator size="large" color={colors.primary[600]} />
            </View>
          ) : results.length === 0 ? (
            <EmptyState
              icon={<Search size={48} color={colors.neutral[300]} />}
              title="No results found"
              message={`Try different keywords for "${query}"`}
            />
          ) : (
            <View style={styles.resultsGrid}>
              {results.map(p => (
                <View key={p.id} style={styles.resultItem}>
                  <ProductCard product={p} onPress={() => router.push(`/product/${p.slug}`)} />
                </View>
              ))}
            </View>
          )
        ) : (
          <>
            {recentSearches.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleRow}>
                    <Clock size={18} color={colors.text} />
                    <Text style={styles.sectionTitle}>Recent Searches</Text>
                  </View>
                  <TouchableOpacity onPress={() => setRecentSearches([])}>
                    <Text style={styles.clearBtn}>Clear</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.chipsRow}>
                  {recentSearches.map((s, i) => (
                    <TouchableOpacity
                      key={i}
                      style={styles.chip}
                      onPress={() => { setQuery(s); performSearch(s); }}
                    >
                      <Text style={styles.chipText}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <TrendingUp size={18} color={colors.text} />
                  <Text style={styles.sectionTitle}>All Departments</Text>
                </View>
              </View>
              <View style={styles.catGrid}>
                {getDepartments(categories).map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={styles.catCard}
                    activeOpacity={0.85}
                    onPress={() => router.push(`/category/${cat.slug}`)}
                  >
                    {cat.image_url ? (
                      <Image source={{ uri: cat.image_url }} style={styles.catImage} resizeMode="cover" />
                    ) : (
                      <View style={[styles.catImage, { backgroundColor: colors.neutral[200] }]} />
                    )}
                    <Text style={styles.catName} numberOfLines={1}>{cat.name}</Text>
                    <ChevronRight size={16} color={colors.neutral[400]} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  title: {
    ...typography.h2,
    color: colors.text,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.text,
  },
  clearBtn: {
    ...typography.bodySmall,
    color: colors.primary[600],
    fontWeight: '600',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.neutral[100],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  chipText: {
    ...typography.bodySmall,
    color: colors.text,
  },
  catGrid: {
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  catCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  catImage: {
    width: 64,
    height: 64,
  },
  catName: {
    flex: 1,
    ...typography.h4,
    color: colors.text,
    paddingHorizontal: spacing.md,
  },
  resultsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.md,
    gap: spacing.md,
  },
  resultItem: {
    width: '48%',
    flex: 1,
    maxWidth: '48%',
  },
});
