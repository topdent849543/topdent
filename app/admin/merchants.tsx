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
  FlatList,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  ChevronLeft,
  Store,
  Search,
  X,
  X as XIcon,
  Package,
  ShoppingBag,
  DollarSign,
  Wallet,
  Video,
  Download,
  FileText,
  TrendingUp,
  ArrowRight,
  Shield,
  Ban,
  CheckCircle,
  User,
  Phone,
  Calendar,
  Award,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text, ArabicTextInput as TextInputArabic } from '@/components/ArabicText';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import { downloadCSV, buildCSV, exportPDF, buildHTMLTable } from '@/lib/export';

const ADMIN_API_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/admin-api`;

type Merchant = {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  is_banned: boolean;
  created_at: string;
  product_count: number;
  order_count: number;
  total_sales: string;
  total_earnings: string;
  pending_earnings: string;
  available_balance: string;
};

type MerchantDetail = {
  merchant: {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    is_active: boolean;
    is_banned: boolean;
    created_at: string;
    admin_notes: string | null;
  };
  wallet: {
    available_balance: string;
    pending_balance: string;
    total_earned: string;
    total_withdrawn: string;
  } | null;
  products: any[];
  orderItems: any[];
  reels: any[];
  restrictions: any | null;
  stats: {
    product_count: number;
    order_count: number;
    reel_count: number;
    total_sales: string;
    total_earnings: string;
    pending_earnings: string;
    available_balance: string;
    pending_balance: string;
  };
};

export default function AdminMerchantsScreen() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  // Detail
  const [detailData, setDetailData] = useState<MerchantDetail | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const getAuthHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    };
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${ADMIN_API_BASE}/merchants`, { headers });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load merchants');
      }
      const data = await response.json();
      setMerchants(data.merchants || []);
    } catch (e: any) {
      setError(e.message);
    }
  }, [getAuthHeaders]);

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

  const openDetail = useCallback(async (merchantId: string) => {
    setDetailVisible(true);
    setDetailLoading(true);
    setDetailData(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${ADMIN_API_BASE}/merchants/${merchantId}`, { headers });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load merchant details');
      }
      const data = await response.json();
      setDetailData(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDetailLoading(false);
    }
  }, [getAuthHeaders]);

  const handleExportCSV = useCallback(async () => {
    if (merchants.length === 0) return;
    setExporting(true);
    try {
      const headers = ['Merchant Name', 'Email', 'Products', 'Orders', 'Total Sales', 'Total Earnings', 'Pending Earnings', 'Available Balance', 'Active', 'Banned', 'Created At'];
      const rows = merchants.map((m) => [
        m.full_name,
        m.email,
        m.product_count,
        m.order_count,
        m.total_sales,
        m.total_earnings,
        m.pending_earnings,
        m.available_balance,
        m.is_active ? 'Yes' : 'No',
        m.is_banned ? 'Yes' : 'No',
        new Date(m.created_at).toLocaleDateString(),
      ]);
      const csv = buildCSV(headers, rows);
      await downloadCSV(csv, `admin-merchants-${Date.now()}`);
    } catch {
      // ignore
    } finally {
      setExporting(false);
    }
  }, [merchants]);

  const handleExportPDF = useCallback(async () => {
    if (merchants.length === 0) return;
    setExporting(true);
    try {
      const headers = ['Merchant', 'Email', 'Products', 'Orders', 'Total Sales', 'Earnings', 'Available'];
      const rows = merchants.map((m) => [
        m.full_name,
        m.email,
        m.product_count,
        m.order_count,
        `${Math.round(Number(m.total_sales)).toLocaleString('en-US')} ل.س`,
        `${Math.round(Number(m.total_earnings)).toLocaleString('en-US')} ل.س`,
        `${Math.round(Number(m.available_balance)).toLocaleString('en-US')} ل.س`,
      ]);
      const html = buildHTMLTable(
        'Merchants Report',
        `${merchants.length} merchants`,
        headers,
        rows
      );
      await exportPDF(html, 'Merchants Report');
    } catch {
      // ignore
    } finally {
      setExporting(false);
    }
  }, [merchants]);

  const filteredMerchants = merchants.filter((m) => {
    if (search) {
      const q = search.toLowerCase();
      if (!m.full_name.toLowerCase().includes(q) && !m.email.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const fmt = (v: string) => `${Math.round(Number(v || 0)).toLocaleString('en-US')} ل.س`;
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const topSellers = [...merchants].sort((a, b) => parseFloat(b.total_sales) - parseFloat(a.total_sales)).slice(0, 3);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Merchants</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={styles.loadingText}>Loading merchants…</Text>
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
        <Text style={styles.title}>Merchants</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleExportCSV}
            disabled={exporting || merchants.length === 0}
          >
            <Download size={20} color={colors.primary[600]} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleExportPDF}
            disabled={exporting || merchants.length === 0}
          >
            <FileText size={20} color={colors.primary[600]} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchInput}>
          <Search size={18} color={colors.neutral[400]} />
          <TextInputArabic
            style={styles.searchField}
            placeholder="Search by name or email…"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <XIcon size={16} color={colors.neutral[400]} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Top sellers */}
        {topSellers.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Top Sellers</Text>
            {topSellers.map((m, idx) => (
              <TouchableOpacity
                key={m.id}
                style={styles.topSellerCard}
                onPress={() => openDetail(m.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.topSellerRank, { backgroundColor: idx === 0 ? colors.warning[500] : idx === 1 ? colors.neutral[400] : colors.accent[400] }]}>
                  <Text style={styles.topSellerRankText}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.topSellerName}>{m.full_name || 'Unknown'}</Text>
                  <Text style={styles.topSellerEmail} numberOfLines={1}>{m.email}</Text>
                </View>
                <View style={styles.topSellerSales}>
                  <Text style={styles.topSellerSalesValue}>{fmt(m.total_sales)}</Text>
                  <Text style={styles.topSellerSalesLabel}>Sales</Text>
                </View>
                <ArrowRight size={18} color={colors.neutral[400]} />
              </TouchableOpacity>
            ))}
          </>
        ) : null}

        {/* All merchants */}
        <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>All Merchants ({filteredMerchants.length})</Text>
        {filteredMerchants.length === 0 ? (
          <View style={styles.emptyState}>
            <Store size={48} color={colors.neutral[300]} />
            <Text style={styles.emptyTitle}>No merchants found</Text>
            <Text style={styles.emptyMsg}>Try adjusting your search.</Text>
          </View>
        ) : (
          filteredMerchants.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={styles.merchantCard}
              onPress={() => openDetail(m.id)}
              activeOpacity={0.7}
            >
              <View style={styles.merchantHeader}>
                <View style={styles.merchantAvatar}>
                  <Store size={22} color={colors.primary[600]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.merchantName}>{m.full_name || 'Unknown'}</Text>
                  <Text style={styles.merchantEmail} numberOfLines={1}>{m.email}</Text>
                  <View style={styles.merchantMetaRow}>
                    {m.is_banned ? (
                      <View style={[styles.metaBadge, { backgroundColor: colors.error[50] }]}>
                        <Ban size={10} color={colors.error[600]} />
                        <Text style={[styles.metaBadgeText, { color: colors.error[600] }]}>Banned</Text>
                      </View>
                    ) : m.is_active ? (
                      <View style={[styles.metaBadge, { backgroundColor: colors.success[50] }]}>
                        <CheckCircle size={10} color={colors.success[600]} />
                        <Text style={[styles.metaBadgeText, { color: colors.success[600] }]}>Active</Text>
                      </View>
                    ) : (
                      <View style={[styles.metaBadge, { backgroundColor: colors.neutral[100] }]}>
                        <Text style={[styles.metaBadgeText, { color: colors.neutral[500] }]}>Inactive</Text>
                      </View>
                    )}
                    <Text style={styles.merchantDate}>{fmtDate(m.created_at)}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.merchantStatsRow}>
                <View style={styles.merchantStatItem}>
                  <Package size={14} color={colors.neutral[400]} />
                  <Text style={styles.merchantStatValue}>{m.product_count}</Text>
                  <Text style={styles.merchantStatLabel}>Products</Text>
                </View>
                <View style={styles.merchantStatItem}>
                  <ShoppingBag size={14} color={colors.neutral[400]} />
                  <Text style={styles.merchantStatValue}>{m.order_count}</Text>
                  <Text style={styles.merchantStatLabel}>Orders</Text>
                </View>
                <View style={styles.merchantStatItem}>
                  <DollarSign size={14} color={colors.neutral[400]} />
                  <Text style={styles.merchantStatValue}>{fmt(m.total_sales)}</Text>
                  <Text style={styles.merchantStatLabel}>Sales</Text>
                </View>
                <View style={styles.merchantStatItem}>
                  <Wallet size={14} color={colors.neutral[400]} />
                  <Text style={styles.merchantStatValue}>{fmt(m.available_balance)}</Text>
                  <Text style={styles.merchantStatLabel}>Balance</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* ── Merchant Detail Modal ──────────────────────────────── */}
      <Modal visible={detailVisible} transparent animationType="slide" onRequestClose={() => setDetailVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Merchant Details</Text>
              <TouchableOpacity style={styles.modalClose} onPress={() => setDetailVisible(false)}>
                <X size={20} color={colors.neutral[500]} />
              </TouchableOpacity>
            </View>

            {detailLoading ? (
              <View style={styles.detailLoading}>
                <ActivityIndicator size="large" color={colors.primary[600]} />
                <Text style={styles.loadingText}>Loading merchant details…</Text>
              </View>
            ) : detailData ? (
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                {/* Merchant info */}
                <View style={styles.detailSection}>
                  <View style={styles.detailMerchantHeader}>
                    <View style={styles.detailAvatar}>
                      <Store size={28} color={colors.primary[600]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailName}>{detailData.merchant.full_name || 'Unknown'}</Text>
                      <Text style={styles.detailEmail}>{detailData.merchant.email}</Text>
                      {detailData.merchant.phone ? (
                        <View style={styles.detailRow}>
                          <Phone size={12} color={colors.neutral[400]} />
                          <Text style={styles.detailSubText}>{detailData.merchant.phone}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.detailMetaRow}>
                    {detailData.merchant.is_banned ? (
                      <View style={[styles.metaBadge, { backgroundColor: colors.error[50] }]}>
                        <Ban size={10} color={colors.error[600]} />
                        <Text style={[styles.metaBadgeText, { color: colors.error[600] }]}>Banned</Text>
                      </View>
                    ) : detailData.merchant.is_active ? (
                      <View style={[styles.metaBadge, { backgroundColor: colors.success[50] }]}>
                        <CheckCircle size={10} color={colors.success[600]} />
                        <Text style={[styles.metaBadgeText, { color: colors.success[600] }]}>Active</Text>
                      </View>
                    ) : null}
                    <View style={styles.detailRow}>
                      <Calendar size={12} color={colors.neutral[400]} />
                      <Text style={styles.detailSubText}>Joined {fmtDate(detailData.merchant.created_at)}</Text>
                    </View>
                  </View>
                </View>

                {/* Stats */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Statistics</Text>
                  <View style={styles.detailStatsGrid}>
                    <View style={styles.detailStatCard}>
                      <Package size={18} color={colors.primary[600]} />
                      <Text style={styles.detailStatValue}>{detailData.stats.product_count}</Text>
                      <Text style={styles.detailStatLabel}>Products</Text>
                    </View>
                    <View style={styles.detailStatCard}>
                      <ShoppingBag size={18} color={colors.success[600]} />
                      <Text style={styles.detailStatValue}>{detailData.stats.order_count}</Text>
                      <Text style={styles.detailStatLabel}>Orders</Text>
                    </View>
                    <View style={styles.detailStatCard}>
                      <Video size={18} color={colors.accent[600]} />
                      <Text style={styles.detailStatValue}>{detailData.stats.reel_count}</Text>
                      <Text style={styles.detailStatLabel}>Reels</Text>
                    </View>
                    <View style={styles.detailStatCard}>
                      <DollarSign size={18} color={colors.warning[600]} />
                      <Text style={styles.detailStatValue}>{fmt(detailData.stats.total_sales)}</Text>
                      <Text style={styles.detailStatLabel}>Total Sales</Text>
                    </View>
                    <View style={styles.detailStatCard}>
                      <TrendingUp size={18} color={colors.success[600]} />
                      <Text style={styles.detailStatValue}>{fmt(detailData.stats.total_earnings)}</Text>
                      <Text style={styles.detailStatLabel}>Earnings</Text>
                    </View>
                    <View style={styles.detailStatCard}>
                      <Wallet size={18} color={colors.primary[600]} />
                      <Text style={styles.detailStatValue}>{fmt(detailData.stats.available_balance)}</Text>
                      <Text style={styles.detailStatLabel}>Available</Text>
                    </View>
                  </View>
                </View>

                {/* Products */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Products ({detailData.products.length})</Text>
                  {detailData.products.length === 0 ? (
                    <Text style={styles.detailEmptyText}>No products published.</Text>
                  ) : (
                    detailData.products.slice(0, 10).map((p) => (
                      <View key={p.id} style={styles.detailProductRow}>
                        <View style={styles.detailProductThumb}>
                          <Package size={16} color={colors.neutral[400]} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.detailProductName} numberOfLines={1}>{p.name}</Text>
                          <Text style={styles.detailProductPrice}>{fmt(p.price)}</Text>
                        </View>
                        <View style={[styles.metaBadge, p.status === 'active' ? { backgroundColor: colors.success[50] } : { backgroundColor: colors.neutral[100] }]}>
                          <Text style={[styles.metaBadgeText, p.status === 'active' ? { color: colors.success[600] } : { color: colors.neutral[500] }]}>
                            {p.status}
                          </Text>
                        </View>
                      </View>
                    ))
                  )}
                  {detailData.products.length > 10 ? (
                    <Text style={styles.detailMoreText}>+{detailData.products.length - 10} more products…</Text>
                  ) : null}
                </View>

                {/* Recent orders */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Recent Orders ({detailData.orderItems.length})</Text>
                  {detailData.orderItems.length === 0 ? (
                    <Text style={styles.detailEmptyText}>No orders yet.</Text>
                  ) : (
                    detailData.orderItems.slice(0, 10).map((oi) => (
                      <View key={oi.id} style={styles.detailOrderRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.detailOrderNum}>{oi.order?.order_number ?? 'N/A'}</Text>
                          <Text style={styles.detailOrderProduct} numberOfLines={1}>{oi.product_name}</Text>
                          <Text style={styles.detailOrderMeta}>
                            Qty: {oi.quantity} • {fmt(oi.subtotal)}
                          </Text>
                          {oi.order?.customer?.full_name ? (
                            <Text style={styles.detailOrderCustomer}>
                              {oi.order.customer.full_name}
                            </Text>
                          ) : null}
                        </View>
                        <View style={[styles.metaBadge, { backgroundColor: colors.neutral[100] }]}>
                          <Text style={[styles.metaBadgeText, { color: colors.neutral[600] }]}>
                            {oi.order?.status ?? 'pending'}
                          </Text>
                        </View>
                      </View>
                    ))
                  )}
                  {detailData.orderItems.length > 10 ? (
                    <Text style={styles.detailMoreText}>+{detailData.orderItems.length - 10} more orders…</Text>
                  ) : null}
                </View>

                {/* Restrictions */}
                {detailData.restrictions ? (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Restrictions</Text>
                    <View style={styles.restrictionBox}>
                      <Text style={styles.restrictionText}>
                        Upload Products: {detailData.restrictions.can_upload_products ? 'Allowed' : 'Blocked'}
                      </Text>
                      <Text style={styles.restrictionText}>
                        Upload Reels: {detailData.restrictions.can_upload_reels ? 'Allowed' : 'Blocked'}
                      </Text>
                      <Text style={styles.restrictionText}>
                        Edit Products: {detailData.restrictions.can_edit_products ? 'Allowed' : 'Blocked'}
                      </Text>
                      <Text style={styles.restrictionText}>
                        Delete Products: {detailData.restrictions.can_delete_products ? 'Allowed' : 'Blocked'}
                      </Text>
                      {detailData.restrictions.restricted_notes ? (
                        <Text style={styles.restrictionNote}>
                          Notes: {detailData.restrictions.restricted_notes}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.surface,
  },
  headerRight: { flexDirection: 'row', gap: 4 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h4, color: colors.text, fontWeight: '700' },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { ...typography.body, color: colors.textSecondary },
  searchRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  searchInput: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.background, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  searchField: { flex: 1, ...typography.body, color: colors.text },
  errorBanner: {
    backgroundColor: colors.error[50], borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, margin: spacing.md,
    borderWidth: 1, borderColor: colors.error[100],
  },
  errorBannerText: { ...typography.bodySmall, color: colors.error[700] },
  sectionTitle: { ...typography.h4, color: colors.text, fontWeight: '700', marginBottom: spacing.md },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { ...typography.h4, color: colors.text },
  emptyMsg: { ...typography.bodySmall, color: colors.textSecondary },
  topSellerCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.sm, ...shadows.sm,
  },
  topSellerRank: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  },
  topSellerRankText: { ...typography.h4, color: colors.white, fontWeight: '700' },
  topSellerName: { ...typography.body, fontWeight: '600', color: colors.text },
  topSellerEmail: { ...typography.caption, color: colors.neutral[400] },
  topSellerSales: { alignItems: 'flex-end' },
  topSellerSalesValue: { ...typography.h4, color: colors.primary[700], fontWeight: '700' },
  topSellerSalesLabel: { ...typography.caption, color: colors.neutral[400] },
  merchantCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.md, ...shadows.sm,
  },
  merchantHeader: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  merchantAvatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary[50],
    alignItems: 'center', justifyContent: 'center',
  },
  merchantName: { ...typography.body, fontWeight: '600', color: colors.text },
  merchantEmail: { ...typography.caption, color: colors.neutral[400], marginTop: 2 },
  merchantMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  merchantDate: { ...typography.caption, color: colors.neutral[400] },
  metaBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm,
  },
  metaBadgeText: { ...typography.caption, fontWeight: '600' },
  merchantStatsRow: {
    flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  merchantStatItem: { flex: 1, alignItems: 'center', gap: 2 },
  merchantStatValue: { ...typography.bodySmall, fontWeight: '700', color: colors.text },
  merchantStatLabel: { ...typography.caption, color: colors.neutral[400] },
  // Detail modal
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  modalContent: { width: '100%', maxWidth: 480, maxHeight: '90%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, ...shadows.lg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  modalTitle: { ...typography.h4, color: colors.text, fontWeight: '700' },
  modalClose: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.neutral[100] },
  detailLoading: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  detailSection: { marginBottom: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailMerchantHeader: { flexDirection: 'row', gap: spacing.md },
  detailAvatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary[50],
    alignItems: 'center', justifyContent: 'center',
  },
  detailName: { ...typography.h4, fontWeight: '700', color: colors.text },
  detailEmail: { ...typography.bodySmall, color: colors.neutral[400] },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  detailSubText: { ...typography.caption, color: colors.neutral[400] },
  detailMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  detailSectionTitle: { ...typography.bodySmall, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  detailStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  detailStatCard: {
    width: '31%', flexGrow: 1, backgroundColor: colors.background, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center', gap: 4,
  },
  detailStatValue: { ...typography.h4, fontWeight: '700', color: colors.text },
  detailStatLabel: { ...typography.caption, color: colors.neutral[400] },
  detailProductRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm,
  },
  detailProductThumb: {
    width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.neutral[100],
    alignItems: 'center', justifyContent: 'center',
  },
  detailProductName: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  detailProductPrice: { ...typography.caption, color: colors.primary[700], fontWeight: '600' },
  detailEmptyText: { ...typography.caption, color: colors.neutral[400], fontStyle: 'italic' },
  detailMoreText: { ...typography.caption, color: colors.primary[600], fontWeight: '600', marginTop: spacing.sm },
  detailOrderRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm,
    backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md,
  },
  detailOrderNum: { ...typography.bodySmall, fontWeight: '700', color: colors.text },
  detailOrderProduct: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  detailOrderMeta: { ...typography.caption, color: colors.neutral[400], marginTop: 2 },
  detailOrderCustomer: { ...typography.caption, color: colors.primary[600], fontWeight: '600', marginTop: 2 },
  restrictionBox: { backgroundColor: colors.warning[50], borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.warning[100] },
  restrictionText: { ...typography.bodySmall, color: colors.warning[600], marginBottom: 4 },
  restrictionNote: { ...typography.bodySmall, color: colors.warning[600], marginTop: spacing.sm, fontStyle: 'italic' },
});
