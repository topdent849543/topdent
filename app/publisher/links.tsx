import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Alert,
  FlatList,
  Image,
  Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  ChevronLeft,
  Plus,
  Trash2,
  Link2,
  X,
  Shield,
  MousePointerClick,
  ShoppingBag,
  DollarSign,
  Search,
  Package,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text, ArabicTextInput as TextInputArabic } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { confirmAction } from '@/lib/confirm';
import { Button } from '@/components/Button';
import type { AffiliateLink, Product, ProductImage } from '@/lib/supabase';

type AffiliateLinkWithProduct = AffiliateLink & {
  product: Product & { images: ProductImage[] };
};

// Production website URL — affiliate links point directly to the product page
const WEBSITE_URL = 'https://varlostore.com';

export default function PublisherLinksScreen() {
  const { user, isPublisher } = useAuth();
  const [links, setLinks] = useState<AffiliateLinkWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create link modal
  const [createModal, setCreateModal] = useState(false);
  const [allProducts, setAllProducts] = useState<(Product & { images: ProductImage[] })[]>([]);
  const [linkedProductIds, setLinkedProductIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      // تحرير أي أرباح انتهت مدة تجميدها حتى تظهر الأرباح والمشتريات محدَّثة
      await supabase.rpc('release_due_earnings');
      try { await supabase.rpc('release_affiliate_instant', { p_user_id: null }); } catch {}

      const { data, error: fetchErr } = await supabase
        .from('affiliate_links')
        .select('*, product:products(*, images:product_images(*))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;
      setLinks((data as unknown as AffiliateLinkWithProduct[]) ?? []);
    } catch (e: any) {
      setError(e.message || 'Failed to load affiliate links');
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const fmtMoney = (n: number) =>
    `${Math.round(Number(n || 0)).toLocaleString('en-US')} ل.س`;

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  const buildAffiliateUrl = (code: string, productSlug?: string) => {
    if (productSlug) {
      // Direct link to the product page with affiliate tracking code
      return `${WEBSITE_URL}/product/${productSlug}?ref=${code}`;
    }
    // Fallback: website home with ref code
    return `${WEBSITE_URL}?ref=${code}`;
  };

  // ── Create link flow ──────────────────────────────────────────
  const openCreateModal = async () => {
    if (!user) return;
    setSearchQuery('');
    setCreateModal(true);
    setLoadingProducts(true);
    try {
      const [productsRes, linksRes] = await Promise.all([
        supabase
          .from('products')
          .select('*, images:product_images(*)')
          .eq('status', 'active')
          .order('created_at', { ascending: false }),
        supabase
          .from('affiliate_links')
          .select('product_id')
          .eq('user_id', user.id),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (linksRes.error) throw linksRes.error;

      setAllProducts((productsRes.data as unknown as (Product & { images: ProductImage[] })[]) ?? []);
      const linkedIds = new Set<string>(
        ((linksRes.data as any[]) ?? []).map((l) => l.product_id)
      );
      setLinkedProductIds(linkedIds);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load products');
      setCreateModal(false);
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleCreateLink = async (product: Product & { images: ProductImage[] }) => {
    if (!user) return;
    setCreating(true);
    try {
      const affiliateCode = `AFF-${user.id.slice(0, 8)}-${Date.now().toString(36)}`;

      const { data, error: insertErr } = await supabase
        .from('affiliate_links')
        .insert({
          user_id: user.id,
          product_id: product.id,
          affiliate_code: affiliateCode,
        })
        .select('*, product:products(*, images:product_images(*))')
        .single();

      if (insertErr) throw insertErr;

      setLinks((prev) => [data as unknown as AffiliateLinkWithProduct, ...prev]);
      setLinkedProductIds((prev) => new Set(prev).add(product.id));
      Alert.alert(
        'Link Created',
        `Your affiliate link for "${product.name}" has been created.`,
        [{ text: 'OK', onPress: () => setCreateModal(false) }]
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to create affiliate link');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteLink = (link: AffiliateLinkWithProduct) => {
    confirmAction(
      {
        title: 'Delete Affiliate Link',
        message: `Are you sure you want to delete the affiliate link for "${link.product?.name ?? 'this product'}"? This action cannot be undone.`,
      },
      async () => {
        try {
          const { error: delErr } = await supabase
            .from('affiliate_links')
            .delete()
            .eq('id', link.id);
          if (delErr) throw delErr;
          setLinks((prev) => prev.filter((l) => l.id !== link.id));
          setLinkedProductIds((prev) => {
            const next = new Set(prev);
            next.delete(link.product_id);
            return next;
          });
        } catch (e: any) {
          Alert.alert('Error', e.message || 'Failed to delete link');
        }
      }
    );
  };

  const availableProducts = allProducts.filter((p) => !linkedProductIds.has(p.id));
  const filteredProducts = availableProducts.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderItem = ({ item }: { item: AffiliateLinkWithProduct }) => {
    const product = item.product;
    const imageUrl = product?.images?.[0]?.image_url;
    const affiliateUrl = buildAffiliateUrl(item.affiliate_code, product?.slug);

    return (
      <View style={styles.linkCard}>
        {/* Product info */}
        <View style={styles.productRow}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.productImage} />
          ) : (
            <View style={styles.productImagePlaceholder}>
              <Package size={20} color={colors.neutral[400]} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.productName} numberOfLines={2}>
              {product?.name ?? 'Unknown Product'}
            </Text>
            {product?.brand ? (
              <Text style={styles.productBrand}>{product.brand}</Text>
            ) : null}
            <Text style={styles.productPrice}>{fmtMoney(product?.price ?? 0)}</Text>
          </View>
          {item.is_active ? (
            <View style={styles.activeBadge}>
              <View style={styles.activeDot} />
              <Text style={styles.activeText}>Active</Text>
            </View>
          ) : (
            <View style={styles.inactiveBadge}>
              <Text style={styles.inactiveText}>Inactive</Text>
            </View>
          )}
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <MousePointerClick size={14} color={colors.neutral[500]} />
            <Text style={styles.statItemValue}>{item.clicks_count ?? 0}</Text>
            <Text style={styles.statItemLabel}>Clicks</Text>
          </View>
          <View style={styles.statItem}>
            <ShoppingBag size={14} color={colors.neutral[500]} />
            <Text style={styles.statItemValue}>{item.purchases_count ?? 0}</Text>
            <Text style={styles.statItemLabel}>Purchases</Text>
          </View>
          <View style={styles.statItem}>
            <DollarSign size={14} color={colors.neutral[500]} />
            <Text style={styles.statItemValue}>{fmtMoney(item.total_earnings ?? 0)}</Text>
            <Text style={styles.statItemLabel}>Earned</Text>
          </View>
        </View>

        {/* Affiliate URL */}
        <View style={styles.urlBox}>
          <Text style={styles.urlLabel}>Affiliate URL</Text>
          <Text style={styles.urlText} selectable>
            {affiliateUrl}
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.cardFooter}>
          <Text style={styles.dateText}>Created {fmtDate(item.created_at)}</Text>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDeleteLink(item)}
            activeOpacity={0.7}
          >
            <Trash2 size={16} color={colors.error[600]} />
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ── Access guard ──────────────────────────────────────────────
  if (!user || !isPublisher) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Affiliate Links</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.accessGuard}>
          <Shield size={64} color={colors.neutral[300]} />
          <Text style={styles.accessTitle}>Publisher Access Required</Text>
          <Text style={styles.accessMsg}>
            You need publisher privileges to manage affiliate links.
          </Text>
          <View style={{ marginTop: spacing.lg, width: '100%' }}>
            <Button title="Back to Home" onPress={() => router.replace('/(tabs)/index')} fullWidth />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Loading ────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Affiliate Links</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={styles.loadingText}>Loading affiliate links…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ──────────────────────────────────────────────────────
  if (error && links.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Affiliate Links</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMsg}>{error}</Text>
          <View style={{ marginTop: spacing.lg }}>
            <Button title="Retry" onPress={load} variant="outline" />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Affiliate Links</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={openCreateModal}>
          <Plus size={24} color={colors.primary[600]} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={links}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{error}</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Link2 size={56} color={colors.neutral[300]} />
            <Text style={styles.emptyTitle}>No affiliate links yet</Text>
            <Text style={styles.emptyMsg}>
              Create your first affiliate link by selecting a product to promote.
            </Text>
            <View style={{ marginTop: spacing.lg, width: '100%' }}>
              <Button
                title="Create Affiliate Link"
                onPress={openCreateModal}
                fullWidth
              />
            </View>
          </View>
        }
      />

      {/* ── Create Link Modal ────────────────────────────────────── */}
      <Modal
        visible={createModal}
        transparent
        animationType="fade"
        onRequestClose={() => !creating && !loadingProducts && setCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Affiliate Link</Text>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => !creating && !loadingProducts && setCreateModal(false)}
              >
                <X size={20} color={colors.neutral[500]} />
              </TouchableOpacity>
            </View>

            {loadingProducts ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color={colors.primary[600]} />
                <Text style={styles.loadingText}>Loading products…</Text>
              </View>
            ) : availableProducts.length === 0 ? (
              <View style={styles.modalLoading}>
                <Package size={48} color={colors.neutral[300]} />
                <Text style={styles.emptyTitle}>No products available</Text>
                <Text style={styles.emptyMsg}>
                  You've already created affiliate links for all available products.
                </Text>
              </View>
            ) : (
              <>
                {/* Search */}
                <View style={styles.searchBox}>
                  <Search size={18} color={colors.neutral[400]} />
                  <TextInputArabic
                    style={styles.searchInput}
                    placeholder="Search products…"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    editable={!creating}
                  />
                </View>

                <Text style={styles.productCount}>
                  {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''} available
                </Text>

                {/* Product list */}
                <FlatList
                  data={filteredProducts}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => {
                    const imageUrl = item.images?.[0]?.image_url;
                    return (
                      <TouchableOpacity
                        style={styles.productPickCard}
                        onPress={() => handleCreateLink(item)}
                        disabled={creating}
                        activeOpacity={0.7}
                      >
                        {imageUrl ? (
                          <Image source={{ uri: imageUrl }} style={styles.productPickImage} />
                        ) : (
                          <View style={styles.productPickImagePlaceholder}>
                            <Package size={18} color={colors.neutral[400]} />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.productPickName} numberOfLines={2}>
                            {item.name}
                          </Text>
                          {item.brand ? (
                            <Text style={styles.productPickBrand}>{item.brand}</Text>
                          ) : null}
                          <Text style={styles.productPickPrice}>{fmtMoney(item.price)}</Text>
                        </View>
                        {creating ? (
                          <ActivityIndicator size="small" color={colors.primary[600]} />
                        ) : (
                          <View style={styles.pickBtn}>
                            <Plus size={18} color={colors.primary[600]} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  }}
                  showsVerticalScrollIndicator={false}
                  ListEmptyComponent={
                    <View style={{ alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm }}>
                      <Package size={40} color={colors.neutral[300]} />
                      <Text style={styles.emptyMsg}>No products match your search.</Text>
                    </View>
                  }
                />
              </>
            )}
          </View>
        </View>
      </Modal>
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
  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  // Access guard
  accessGuard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  accessTitle: {
    ...typography.h3,
    color: colors.text,
    marginTop: spacing.md,
  },
  accessMsg: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  // Error
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  errorEmoji: { fontSize: 48 },
  errorTitle: {
    ...typography.h3,
    color: colors.text,
  },
  errorMsg: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: colors.error[50],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.error[100],
  },
  errorBannerText: {
    ...typography.bodySmall,
    color: colors.error[700],
  },
  // Empty
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.h4,
    color: colors.text,
  },
  emptyMsg: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  // Link card
  linkCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  productImage: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.neutral[100],
  },
  productImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  productName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  productBrand: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  productPrice: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.primary[700],
    marginTop: 4,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.success[50],
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success[500],
  },
  activeText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.success[700],
  },
  inactiveBadge: {
    backgroundColor: colors.neutral[100],
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  inactiveText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.neutral[500],
  },
  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statItemValue: {
    ...typography.h4,
    fontWeight: '700',
    color: colors.text,
  },
  statItemLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  // URL box
  urlBox: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  urlLabel: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  urlText: {
    ...typography.caption,
    color: colors.primary[700],
    fontFamily: Platform.select({ web: 'monospace', default: undefined }),
  },
  // Footer
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  dateText: {
    ...typography.caption,
    color: colors.neutral[400],
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  deleteText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.error[600],
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  modalTitle: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '700',
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral[100],
  },
  modalLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  // Search
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    marginBottom: spacing.sm,
  },
  searchInput: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    paddingVertical: spacing.xs,
  },
  productCount: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  // Product pick card
  productPickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  productPickImage: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.neutral[100],
  },
  productPickImagePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  productPickName: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  productPickBrand: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  productPickPrice: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primary[700],
    marginTop: 4,
  },
  pickBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
