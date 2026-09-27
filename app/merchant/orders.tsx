import { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
  FlatList,
  Modal,
  Alert,
  Share,
  Platform,
  Linking,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  ChevronLeft,
  ShoppingBag,
  Shield,
  Package,
  User,
  Calendar,
  DollarSign,
  Download,
  FileText,
  X,
  Truck,
  CreditCard,
  MapPin,
  Phone,
  Mail,
  Clock,
  TrendingUp,
  Search,
  SlidersHorizontal,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text, ArabicTextInput as TextInputArabic } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import { CompanyPicker } from '@/components/CompanyPicker';
import { DriverAssignmentModal } from '@/components/DriverAssignmentModal';
import { allowedOrderTransitions, canTransitionOrderStatus } from '@/lib/orderWorkflow';
import { downloadCSV, buildCSV, exportPDF, buildHTMLTable } from '@/lib/export';
import type { Order, Product, OrderItem } from '@/lib/supabase';

type Customer = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email?: string;
};

type OrderItemWithRelations = OrderItem & {
  created_at?: string;
  merchant_earnings?: number | null;
  affiliate_earnings?: number | null;
  hold_until?: string | null;
  merchant_id?: string | null;
  order: (Order & { customer?: Customer | null }) | null;
  product: Product | null;
};

type StatusHistoryEntry = {
  id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string;
  changer?: { full_name: string | null } | null;
};

const ORDER_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: 'New', color: colors.warning[600], bg: colors.warning[50] },
  under_review: { label: 'Under Review', color: colors.warning[600], bg: colors.warning[50] },
  approved: { label: 'Approved', color: colors.primary[600], bg: colors.primary[50] },
  preparing: { label: 'Preparing', color: colors.primary[600], bg: colors.primary[50] },
  ready_for_delivery: { label: 'Ready for Delivery', color: colors.accent[600], bg: colors.accent[50] },
  waiting_for_driver: { label: 'Waiting for Driver', color: colors.accent[600], bg: colors.accent[50] },
  arrived: { label: 'Driver Arrived', color: colors.accent[600], bg: colors.accent[50] },
  final_review: { label: 'Final Review', color: colors.warning[600], bg: colors.warning[50] },
  delivery_failed: { label: 'Delivery Failed', color: colors.error[600], bg: colors.error[50] },
  archived: { label: 'Archived', color: colors.neutral[500], bg: colors.neutral[100] },
  pending: { label: 'Pending', color: colors.warning[600], bg: colors.warning[50] },
  confirmed: { label: 'Confirmed', color: colors.primary[600], bg: colors.primary[50] },
  processing: { label: 'Processing', color: colors.primary[600], bg: colors.primary[50] },
  shipped: { label: 'Shipped', color: colors.accent[600], bg: colors.accent[50] },
  out_for_delivery: { label: 'Out for Delivery', color: colors.accent[600], bg: colors.accent[50] },
  delivered: { label: 'Delivered', color: colors.success[600], bg: colors.success[50] },
  completed: { label: 'Completed', color: colors.success[700], bg: colors.success[50] },
  cancelled: { label: 'Cancelled', color: colors.error[600], bg: colors.error[50] },
  returned: { label: 'Returned', color: colors.neutral[500], bg: colors.neutral[100] },
  refunded: { label: 'Refunded', color: colors.neutral[500], bg: colors.neutral[100] },
};

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready_for_delivery', label: 'Ready for Delivery' },
  { value: 'waiting_for_driver', label: 'Waiting for Driver' },
  { value: 'arrived', label: 'Driver Arrived' },
  { value: 'final_review', label: 'Final Review' },
  { value: 'completed', label: 'Completed' },
  { value: 'delivery_failed', label: 'Delivery Failed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'archived', label: 'Archived' },
];

const MERCHANT_API_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/merchant-api`;

export default function MerchantOrdersScreen() {
  const { user, isMerchant, activeCompany, hasPermission } = useAuth();
  const [orderItems, setOrderItems] = useState<OrderItemWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Search & filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');

  // Detail modal
  const [detailItem, setDetailItem] = useState<OrderItemWithRelations | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [assignmentVisible, setAssignmentVisible] = useState(false);

  const companyManagedTransitions = useMemo(() => {
    const current = detailItem?.order?.status ?? '';
    const driverOnly = new Set(['out_for_delivery', 'arrived', 'delivered', 'delivery_failed']);
    const permissionByStatus: Record<string, string> = {
      under_review: 'orders.review', approved: 'orders.approve', rejected: 'orders.reject', cancelled: 'orders.cancel',
      preparing: 'orders.prepare', ready_for_delivery: 'orders.mark_ready', waiting_for_driver: 'orders.assign_driver',
      final_review: 'orders.review', completed: 'orders.approve', archived: 'orders.archive',
    };
    return allowedOrderTransitions(current).filter((status) => !driverOnly.has(status) &&
      !!activeCompany?.id && hasPermission(permissionByStatus[status] ?? 'orders.change_status', activeCompany.id));
  }, [detailItem, activeCompany?.id, hasPermission]);

  const getAuthHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    };
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${MERCHANT_API_BASE}/orders?company_id=${encodeURIComponent(activeCompany?.id ?? '')}`, { headers });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Request failed (${response.status})`);
      }
      const data = await response.json();
      setOrderItems(data.items ?? []);
    } catch (e: any) {
      setError(e.message || 'Failed to load orders');
    }
  }, [user, activeCompany?.id, getAuthHeaders]);

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

  const fetchHistory = useCallback(async (orderId: string) => {
    setHistoryLoading(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${MERCHANT_API_BASE}/orders/${orderId}/history?company_id=${encodeURIComponent(activeCompany?.id ?? '')}`, { headers });
      if (response.ok) {
        const data = await response.json();
        setHistory(data.history ?? []);
      }
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }, [getAuthHeaders, activeCompany?.id]);

  const openDetail = useCallback((item: OrderItemWithRelations) => {
    setDetailItem(item);
    setDetailVisible(true);
    if (item.order?.id) {
      fetchHistory(item.order.id);
    }
  }, [fetchHistory]);

  const openStatusModal = useCallback(() => {
    const currentStatus = detailItem?.order?.status ?? 'new';
    setSelectedStatus(allowedOrderTransitions(currentStatus)[0] ?? '');
    setStatusNote('');
    setStatusModalVisible(true);
  }, [detailItem]);

  const handleStatusUpdate = useCallback(async () => {
    if (!detailItem?.order?.id || !selectedStatus) return;
    if (!canTransitionOrderStatus(detailItem.order.status, selectedStatus)) {
      Alert.alert('Invalid transition', 'This order cannot move to the selected status.');
      return;
    }
    if (['cancelled', 'rejected', 'delivery_failed'].includes(selectedStatus) && !statusNote.trim()) {
      Alert.alert('Reason required', 'Enter a reason before cancelling, rejecting, or failing an order.');
      return;
    }
    setUpdatingStatus(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${MERCHANT_API_BASE}/orders/${detailItem.order.id}/status`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ status: selectedStatus, note: statusNote.trim() || null, company_id: activeCompany?.id }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update status');
      }
      Alert.alert('Success', `Order status updated to ${ORDER_STATUS_CONFIG[selectedStatus]?.label ?? selectedStatus}`);
      setStatusModalVisible(false);
      await load();
      if (detailItem.order.id) {
        fetchHistory(detailItem.order.id);
      }
      // Update the detail item's order status
      if (detailItem) {
        setDetailItem({
          ...detailItem,
          order: detailItem.order ? { ...detailItem.order, status: selectedStatus } : null,
        });
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  }, [detailItem, selectedStatus, statusNote, getAuthHeaders, load, fetchHistory, activeCompany?.id]);

  const activeFilterCount = [
    statusFilter !== 'all',
    paymentFilter !== 'all',
    dateFilter !== 'all',
    priceMin.trim() !== '',
    priceMax.trim() !== '',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setStatusFilter('all');
    setPaymentFilter('all');
    setDateFilter('all');
    setPriceMin('');
    setPriceMax('');
  };

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const min = priceMin.trim() ? Number(priceMin) : null;
    const max = priceMax.trim() ? Number(priceMax) : null;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return orderItems.filter((item) => {
      const o = item.order;
      if (q) {
        const haystack = [
          o?.order_number,
          o?.customer?.full_name,
          o?.customer?.phone,
          o?.customer?.email,
          item.product_name,
          o?.tracking_number,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (statusFilter !== 'all' && o?.status !== statusFilter) return false;
      if (paymentFilter !== 'all' && o?.payment_status !== paymentFilter) return false;
      if (dateFilter !== 'all') {
        const created = new Date(item.created_at ?? o?.created_at ?? 0);
        if (dateFilter === 'today' && created < startOfToday) return false;
        if (dateFilter === 'week' && created < startOfWeek) return false;
        if (dateFilter === 'month' && created < startOfMonth) return false;
      }
      if (min !== null && item.subtotal < min) return false;
      if (max !== null && item.subtotal > max) return false;
      return true;
    });
  }, [orderItems, searchQuery, statusFilter, paymentFilter, dateFilter, priceMin, priceMax]);

  const handleExportCSV = useCallback(async () => {
    if (filteredItems.length === 0) {
      Alert.alert('No Data', 'No orders to export.');
      return;
    }
    setExporting(true);
    try {
      const headers = ['Order Number', 'Date', 'Status', 'Customer Name', 'Customer Phone', 'Customer Email', 'Product Name', 'Quantity', 'Unit Price', 'Subtotal', 'Merchant Sales', 'Payment Status', 'Payment Method', 'Tracking Number'];
      const rows = filteredItems.map((item) => {
        const o = item.order;
        const cust = o?.customer;
        return [
          o?.order_number ?? 'N/A',
          o ? new Date(o.created_at).toLocaleDateString() : '',
          o?.status ?? '',
          cust?.full_name ?? '',
          cust?.phone ?? '',
          cust?.email ?? '',
          item.product_name,
          item.quantity,
          item.unit_price,
          item.subtotal,
          item.merchant_earnings ?? 0,
          o?.payment_status ?? '',
          o?.payment_method ?? '',
          o?.tracking_number ?? '',
        ];
      });
      const csv = buildCSV(headers, rows);
      await downloadCSV(csv, `merchant-orders-${Date.now()}`);
    } catch (e: any) {
      Alert.alert('Export Error', e.message || 'Failed to export CSV');
    } finally {
      setExporting(false);
    }
  }, [filteredItems]);

  const handleExportPDF = useCallback(async () => {
    if (filteredItems.length === 0) {
      Alert.alert('No Data', 'No orders to export.');
      return;
    }
    setExporting(true);
    try {
      const headers = ['Order #', 'Date', 'Status', 'Customer', 'Product', 'Qty', 'Price', 'Sales'];
      const rows = filteredItems.map((item) => {
        const o = item.order;
        return [
          o?.order_number ?? 'N/A',
          o ? new Date(o.created_at).toLocaleDateString() : '',
          ORDER_STATUS_CONFIG[o?.status ?? 'pending']?.label ?? o?.status ?? '',
          o?.customer?.full_name ?? 'N/A',
          item.product_name,
          item.quantity,
          `${Math.round(Number(item.unit_price || 0)).toLocaleString('en-US')} ل.س`,
          `${Math.round(Number(item.merchant_earnings || 0)).toLocaleString('en-US')} ل.س`,
        ];
      });
      const totalEarnings = filteredItems.reduce((sum, i) => sum + (i.merchant_earnings ?? 0), 0);
      const html = buildHTMLTable(
        'Merchant Orders Report',
        `${filteredItems.length} order items`,
        headers,
        rows
      ) + `
      <div style="margin-top:24px">
        <div class="summary-card">
          <div class="label">Total Sales</div>
          <div class="value">${Math.round(totalEarnings).toLocaleString('en-US')} ل.س</div>
        </div>
      </div>`;
      await exportPDF(html, 'Merchant Orders Report');
    } catch (e: any) {
      Alert.alert('Export Error', e.message || 'Failed to export PDF');
    } finally {
      setExporting(false);
    }
  }, [filteredItems]);

  const fmtMoney = (n: number) =>
    `${Math.round(Number(n || 0)).toLocaleString('en-US')} ل.س`;

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const renderItem = ({ item }: { item: OrderItemWithRelations }) => {
    const order = item.order;
    const statusCfg = order
      ? ORDER_STATUS_CONFIG[order.status] ?? ORDER_STATUS_CONFIG.pending
      : ORDER_STATUS_CONFIG.pending;
    const earnings = item.merchant_earnings ?? 0;
    const isPending = item.hold_until && new Date(item.hold_until) > new Date();

    return (
      <TouchableOpacity
        style={styles.orderCard}
        onPress={() => openDetail(item)}
        activeOpacity={0.7}
      >
        <View style={styles.orderHeader}>
          <View style={styles.orderNumWrap}>
            <Text style={styles.orderNumber}>
              {order?.order_number ?? 'N/A'}
            </Text>
            <View style={styles.orderDateRow}>
              <Calendar size={11} color={colors.neutral[400]} />
              <Text style={styles.orderDate}>{fmtDate(item.created_at ?? item.order?.created_at ?? new Date().toISOString())}</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
            <Text style={[styles.statusText, { color: statusCfg.color }]}>
              {statusCfg.label}
            </Text>
          </View>
        </View>

        <View style={styles.productSection}>
          <View style={styles.productThumb}>
            <Package size={20} color={colors.neutral[400]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.productName} numberOfLines={2}>
              {item.product_name}
            </Text>
            <Text style={styles.productQty}>
              Qty: {item.quantity} × {fmtMoney(item.unit_price)}
            </Text>
            {item.size || item.color ? (
              <Text style={styles.productVariant}>
                {[item.size, item.color].filter(Boolean).join(' • ')}
              </Text>
            ) : null}
          </View>
        </View>

        {order?.customer ? (
          <View style={styles.customerBox}>
            <View style={styles.customerRow}>
              <User size={12} color={colors.neutral[500]} />
              <Text style={styles.customerLabel}>Customer</Text>
            </View>
            <Text style={styles.customerValue} numberOfLines={1}>
              {order.customer.full_name || 'N/A'}
            </Text>
            {order.customer.phone ? (
              <Text style={styles.customerSub}>{order.customer.phone}</Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.earningsBox}>
          <View style={styles.earningsLeft}>
            <View style={styles.earningsIcon}>
              <DollarSign size={14} color={colors.white} />
            </View>
            <View>
              <Text style={styles.earningsLabel}>Your Sales (75%)</Text>
              {isPending ? (
                <Text style={styles.earningsPending}>Pending confirmation</Text>
              ) : (
                <Text style={styles.earningsReleased}>Released</Text>
              )}
            </View>
          </View>
          <Text style={styles.earningsValue}>{fmtMoney(earnings)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ── Access guard ──────────────────────────────────────────────
  if (!user || !isMerchant) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Orders</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.accessGuard}>
          <Shield size={64} color={colors.neutral[300]} />
          <Text style={styles.accessTitle}>Merchant Access Required</Text>
          <Text style={styles.accessMsg}>
            You need merchant privileges to view orders.
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
          <Text style={styles.title}>Orders</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={styles.loadingText}>Loading orders…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ──────────────────────────────────────────────────────
  if (error && orderItems.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Orders</Text>
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

  const totalEarnings = filteredItems.reduce((sum, i) => sum + (i.merchant_earnings ?? 0), 0);
  const pendingEarnings = filteredItems
    .filter((i) => i.hold_until && new Date(i.hold_until) > new Date())
    .reduce((sum, i) => sum + (i.merchant_earnings ?? 0), 0);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Orders</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleExportCSV}
            disabled={exporting || filteredItems.length === 0}
          >
            <Download size={20} color={colors.primary[600]} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleExportPDF}
            disabled={exporting || filteredItems.length === 0}
          >
            <FileText size={20} color={colors.primary[600]} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ paddingHorizontal: spacing.md }}><CompanyPicker /></View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      {/* Search bar */}
      <View style={styles.searchBarRow}>
        <View style={styles.searchInputWrap}>
          <Search size={18} color={colors.neutral[400]} />
          <TextInputArabic
            style={styles.searchInput}
            placeholder="Search order #, customer, product…"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={16} color={colors.neutral[400]} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={[styles.filterToggleBtn, activeFilterCount > 0 && styles.filterToggleBtnActive]}
          onPress={() => setFiltersVisible((v) => !v)}
        >
          <SlidersHorizontal size={18} color={activeFilterCount > 0 ? colors.white : colors.primary[600]} />
          {activeFilterCount > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      {/* Filter panel */}
      {filtersVisible ? (
        <View style={styles.filterPanel}>
          <Text style={styles.filterGroupLabel}>Order Status</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipRow}>
            <TouchableOpacity
              style={[styles.filterChip, statusFilter === 'all' && styles.filterChipActive]}
              onPress={() => setStatusFilter('all')}
            >
              <Text style={[styles.filterChipText, statusFilter === 'all' && styles.filterChipTextActive]}>All</Text>
            </TouchableOpacity>
            {STATUS_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.filterChip, statusFilter === opt.value && styles.filterChipActive]}
                onPress={() => setStatusFilter(opt.value)}
              >
                <Text style={[styles.filterChipText, statusFilter === opt.value && styles.filterChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.filterGroupLabel}>Payment Status</Text>
          <View style={styles.filterChipRow}>
            {['all', 'paid', 'pending', 'failed', 'refunded'].map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.filterChip, paymentFilter === p && styles.filterChipActive]}
                onPress={() => setPaymentFilter(p)}
              >
                <Text style={[styles.filterChipText, paymentFilter === p && styles.filterChipTextActive]}>
                  {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.filterGroupLabel}>Date</Text>
          <View style={styles.filterChipRow}>
            {(['all', 'today', 'week', 'month'] as const).map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.filterChip, dateFilter === d && styles.filterChipActive]}
                onPress={() => setDateFilter(d)}
              >
                <Text style={[styles.filterChipText, dateFilter === d && styles.filterChipTextActive]}>
                  {d === 'all' ? 'All Time' : d === 'today' ? 'Today' : d === 'week' ? 'This Week' : 'This Month'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.filterGroupLabel}>Item Subtotal Range</Text>
          <View style={styles.priceRangeRow}>
            <TextInputArabic
              style={styles.priceInput}
              placeholder="Min"
              value={priceMin}
              onChangeText={setPriceMin}
              keyboardType="decimal-pad"
            />
            <Text style={styles.priceRangeDash}>—</Text>
            <TextInputArabic
              style={styles.priceInput}
              placeholder="Max"
              value={priceMax}
              onChangeText={setPriceMax}
              keyboardType="decimal-pad"
            />
          </View>

          {activeFilterCount > 0 ? (
            <TouchableOpacity style={styles.clearFiltersBtn} onPress={clearFilters}>
              <Text style={styles.clearFiltersText}>Clear all filters</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          orderItems.length > 0 ? (
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{filteredItems.length}</Text>
                <Text style={styles.summaryLabel}>Showing</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{fmtMoney(totalEarnings)}</Text>
                <Text style={styles.summaryLabel}>Total Sales</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{fmtMoney(pendingEarnings)}</Text>
                <Text style={styles.summaryLabel}>Pending Sales</Text>
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          orderItems.length === 0 ? (
            <View style={styles.emptyState}>
              <ShoppingBag size={56} color={colors.neutral[300]} />
              <Text style={styles.emptyTitle}>No orders yet</Text>
              <Text style={styles.emptyMsg}>
                Orders containing your products will appear here.
              </Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Search size={56} color={colors.neutral[300]} />
              <Text style={styles.emptyTitle}>No matching orders</Text>
              <Text style={styles.emptyMsg}>
                Try adjusting your search or filters.
              </Text>
              <TouchableOpacity style={{ marginTop: spacing.lg }} onPress={() => { setSearchQuery(''); clearFilters(); }}>
                <Text style={{ color: colors.primary[600], fontWeight: '600' }}>Clear search & filters</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />

      {/* ── Order Detail Modal ──────────────────────────────────── */}
      <Modal
        visible={detailVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Order Details</Text>
              <TouchableOpacity style={styles.modalClose} onPress={() => setDetailVisible(false)}>
                <X size={20} color={colors.neutral[500]} />
              </TouchableOpacity>
            </View>

            {detailItem ? (
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                {/* Order header */}
                <View style={styles.detailSection}>
                  <View style={styles.detailOrderHeader}>
                    <View>
                      <Text style={styles.detailOrderNumber}>
                        {detailItem.order?.order_number ?? 'N/A'}
                      </Text>
                      <Text style={styles.detailOrderDate}>
                        {detailItem.order ? fmtDate(detailItem.order.created_at) : ''}
                      </Text>
                    </View>
                    <View style={[
                      styles.statusBadge,
                      { backgroundColor: (ORDER_STATUS_CONFIG[detailItem.order?.status ?? 'pending'] ?? ORDER_STATUS_CONFIG.pending).bg },
                    ]}>
                      <Text style={[
                        styles.statusText,
                        { color: (ORDER_STATUS_CONFIG[detailItem.order?.status ?? 'pending'] ?? ORDER_STATUS_CONFIG.pending).color },
                      ]}>
                        {(ORDER_STATUS_CONFIG[detailItem.order?.status ?? 'pending'] ?? ORDER_STATUS_CONFIG.pending).label}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Customer info */}
                {detailItem.order?.customer ? (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Customer Information</Text>
                    <View style={styles.detailRow}>
                      <User size={16} color={colors.neutral[400]} />
                      <Text style={styles.detailText}>
                        {detailItem.order.customer.full_name || 'N/A'}
                      </Text>
                    </View>
                    {detailItem.order.customer.phone ? (
                      <View style={styles.detailRow}>
                        <Phone size={16} color={colors.neutral[400]} />
                        <Text style={styles.detailText}>{detailItem.order.customer.phone}</Text>
                      </View>
                    ) : null}
                    {detailItem.order.customer.email ? (
                      <View style={styles.detailRow}>
                        <Mail size={16} color={colors.neutral[400]} />
                        <Text style={styles.detailText}>{detailItem.order.customer.email}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {/* Product info */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Product</Text>
                  <View style={styles.detailProductCard}>
                    <View style={styles.productThumb}>
                      <Package size={24} color={colors.neutral[400]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailProductName}>{detailItem.product_name}</Text>
                      <Text style={styles.detailProductMeta}>
                        Qty: {detailItem.quantity} × {fmtMoney(detailItem.unit_price)}
                      </Text>
                      {detailItem.size || detailItem.color ? (
                        <Text style={styles.detailProductMeta}>
                          {[detailItem.size, detailItem.color].filter(Boolean).join(' • ')}
                        </Text>
                      ) : null}
                      <Text style={styles.detailProductSubtotal}>
                        Subtotal: {fmtMoney(detailItem.subtotal)}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Payment & shipping */}
                {detailItem.order ? (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Payment & Shipping</Text>
                    <View style={styles.detailRow}>
                      <CreditCard size={16} color={colors.neutral[400]} />
                      <Text style={styles.detailLabel}>Payment:</Text>
                      <Text style={styles.detailValue}>
                        {detailItem.order.payment_method} ({detailItem.order.payment_status})
                      </Text>
                    </View>
                    {detailItem.order.tracking_number ? (
                      <View style={styles.detailRow}>
                        <Truck size={16} color={colors.neutral[400]} />
                        <Text style={styles.detailLabel}>Tracking:</Text>
                        <Text style={styles.detailValue}>{detailItem.order.tracking_number}</Text>
                      </View>
                    ) : null}
                    {detailItem.order.carrier ? (
                      <View style={styles.detailRow}>
                        <Truck size={16} color={colors.neutral[400]} />
                        <Text style={styles.detailLabel}>Carrier:</Text>
                        <Text style={styles.detailValue}>{detailItem.order.carrier}</Text>
                      </View>
                    ) : null}
                    {detailItem.order.shipping_address ? (
                      <View style={styles.detailRow}>
                        <MapPin size={16} color={colors.neutral[400]} />
                        <Text style={styles.detailLabel}>Address:</Text>
                        <Text style={styles.detailValue}>
                          {typeof detailItem.order.shipping_address === 'object'
                            ? JSON.stringify(detailItem.order.shipping_address)
                            : String(detailItem.order.shipping_address)}
                        </Text>
                      </View>
                    ) : null}
                    {detailItem.order.total != null ? (
                      <View style={styles.detailRow}>
                        <DollarSign size={16} color={colors.neutral[400]} />
                        <Text style={styles.detailLabel}>Order Total:</Text>
                        <Text style={styles.detailValue}>{fmtMoney(detailItem.order.total)}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {/* Earnings */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Your Sales</Text>
                  <View style={styles.earningsBox}>
                    <View style={styles.earningsLeft}>
                      <View style={styles.earningsIcon}>
                        <DollarSign size={14} color={colors.white} />
                      </View>
                      <View>
                        <Text style={styles.earningsLabel}>Sales (75%)</Text>
                        {detailItem.hold_until && new Date(detailItem.hold_until) > new Date() ? (
                          <Text style={styles.earningsPending}>
                            Held until {fmtDate(detailItem.hold_until)}
                          </Text>
                        ) : (
                          <Text style={styles.earningsReleased}>Released</Text>
                        )}
                      </View>
                    </View>
                    <Text style={styles.earningsValue}>
                      {fmtMoney(detailItem.merchant_earnings ?? 0)}
                    </Text>
                  </View>
                </View>

                {/* Status history */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Status History</Text>
                  {historyLoading ? (
                    <ActivityIndicator size="small" color={colors.primary[600]} />
                  ) : history.length === 0 ? (
                    <Text style={styles.detailEmptyText}>No status changes recorded yet.</Text>
                  ) : (
                    history.map((h) => (
                      <View key={h.id} style={styles.historyRow}>
                        <View style={styles.historyDot} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.historyText}>
                            {(h.from_status ? ORDER_STATUS_CONFIG[h.from_status]?.label ?? h.from_status : '—')} →{' '}
                            {(ORDER_STATUS_CONFIG[h.to_status]?.label ?? h.to_status)}
                          </Text>
                          <Text style={styles.historyMeta}>
                            {h.changer?.full_name ?? 'System'} • {fmtDate(h.created_at)}
                          </Text>
                          {h.note ? (
                            <Text style={styles.historyNote}>{h.note}</Text>
                          ) : null}
                        </View>
                      </View>
                    ))
                  )}
                </View>

                {/* Company-scoped order actions */}
                <View style={{ marginTop: spacing.md, marginBottom: spacing.xl, gap: spacing.sm }}>
                  {companyManagedTransitions.length ? <Button title="Update Order Status" onPress={openStatusModal} fullWidth /> : null}
                  {detailItem.order?.status === 'waiting_for_driver' && activeCompany?.id && hasPermission('drivers.assign_orders', activeCompany.id)
                    ? <Button title="Assign Driver" onPress={() => setAssignmentVisible(true)} variant="outline" fullWidth /> : null}
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {detailItem?.order?.id && activeCompany?.id ? <DriverAssignmentModal
        visible={assignmentVisible}
        orderId={detailItem.order.id}
        companyId={activeCompany.id}
        onClose={() => setAssignmentVisible(false)}
        onAssigned={() => { load(); if (detailItem.order?.id) fetchHistory(detailItem.order.id); }}
      /> : null}

      {/* ── Status Update Modal ─────────────────────────────────── */}
      <Modal
        visible={statusModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !updatingStatus && setStatusModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.statusModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Update Order Status</Text>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => !updatingStatus && setStatusModalVisible(false)}
              >
                <X size={20} color={colors.neutral[500]} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Select New Status</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.statusChipRow}
            >
              {STATUS_OPTIONS.filter((opt) => companyManagedTransitions.includes(opt.value as never)).map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.statusChip,
                    selectedStatus === opt.value && styles.statusChipActive,
                  ]}
                  onPress={() => setSelectedStatus(opt.value)}
                  disabled={updatingStatus}
                >
                  <Text
                    style={[
                      styles.statusChipText,
                      selectedStatus === opt.value && styles.statusChipTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>Note (optional)</Text>
            <TextInputArabic
              style={[styles.input, styles.textArea]}
              placeholder="Add a note about this status change…"
              value={statusNote}
              onChangeText={setStatusNote}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              editable={!updatingStatus}
            />

            <View style={styles.modalActions}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Cancel"
                  onPress={() => setStatusModalVisible(false)}
                  variant="outline"
                  disabled={updatingStatus}
                  fullWidth
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Update Status"
                  onPress={handleStatusUpdate}
                  loading={updatingStatus}
                  fullWidth
                />
              </View>
            </View>
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
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { ...typography.body, color: colors.textSecondary },
  accessGuard: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  accessTitle: { ...typography.h3, color: colors.text, marginTop: spacing.md },
  accessMsg: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  errorEmoji: { fontSize: 48 },
  errorTitle: { ...typography.h3, color: colors.text },
  errorMsg: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  errorBanner: {
    backgroundColor: colors.error[50], borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, margin: spacing.md,
    borderWidth: 1, borderColor: colors.error[100],
  },
  errorBannerText: { ...typography.bodySmall, color: colors.error[700] },
  // Search & filters
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: { flex: 1, ...typography.body, color: colors.text },
  filterToggleBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterToggleBtnActive: { backgroundColor: colors.primary[600], borderColor: colors.primary[600] },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.error[600],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterBadgeText: { fontSize: 10, color: colors.white, fontWeight: '700' },
  filterPanel: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  filterGroupLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  filterChipRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: colors.neutral[100],
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primary[600], borderColor: colors.primary[600] },
  filterChipText: { ...typography.bodySmall, color: colors.textSecondary },
  filterChipTextActive: { color: colors.white, fontWeight: '600' },
  priceRangeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  priceInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.background,
  },
  priceRangeDash: { ...typography.body, color: colors.neutral[400] },
  clearFiltersBtn: { marginTop: spacing.md, alignItems: 'center' },
  clearFiltersText: { ...typography.bodySmall, color: colors.error[600], fontWeight: '600' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { ...typography.h4, color: colors.text },
  emptyMsg: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  summaryRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  summaryCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, ...shadows.sm,
  },
  summaryValue: { ...typography.h3, color: colors.primary[700], fontWeight: '700' },
  summaryLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  orderCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md, ...shadows.sm,
  },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  orderNumWrap: { flex: 1 },
  orderNumber: { ...typography.body, fontWeight: '700', color: colors.text },
  orderDateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  orderDate: { ...typography.caption, color: colors.neutral[400] },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm },
  statusText: { ...typography.caption, fontWeight: '600' },
  productSection: {
    flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md,
  },
  productThumb: {
    width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.neutral[100],
    alignItems: 'center', justifyContent: 'center',
  },
  productName: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  productQty: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  productVariant: { ...typography.caption, color: colors.neutral[500], marginTop: 2 },
  customerBox: { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  customerLabel: { ...typography.caption, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase' },
  customerValue: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  customerSub: { ...typography.caption, color: colors.neutral[500], marginTop: 2 },
  earningsBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.primary[600], borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm,
  },
  earningsLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  earningsIcon: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  earningsLabel: { ...typography.caption, color: colors.primary[100], fontWeight: '600' },
  earningsPending: { ...typography.caption, color: colors.warning[500], fontWeight: '500' },
  earningsReleased: { ...typography.caption, color: colors.success[500], fontWeight: '500' },
  earningsValue: { ...typography.h4, color: colors.white, fontWeight: '700' },
  // Detail modal
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  modalContent: { width: '100%', maxWidth: 480, maxHeight: '90%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, ...shadows.lg },
  statusModalContent: { width: '100%', maxWidth: 440, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, ...shadows.lg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  modalTitle: { ...typography.h4, color: colors.text, fontWeight: '700' },
  modalClose: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.neutral[100] },
  detailSection: { marginBottom: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailOrderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  detailOrderNumber: { ...typography.h4, fontWeight: '700', color: colors.text },
  detailOrderDate: { ...typography.caption, color: colors.neutral[400], marginTop: 2 },
  detailSectionTitle: { ...typography.bodySmall, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 6 },
  detailText: { ...typography.bodySmall, color: colors.text },
  detailLabel: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  detailValue: { ...typography.bodySmall, color: colors.text, flex: 1 },
  detailProductCard: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md },
  detailProductName: { ...typography.body, fontWeight: '600', color: colors.text },
  detailProductMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  detailProductSubtotal: { ...typography.bodySmall, fontWeight: '600', color: colors.primary[700], marginTop: 4 },
  detailEmptyText: { ...typography.caption, color: colors.neutral[400], fontStyle: 'italic' },
  historyRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  historyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary[600], marginTop: 6 },
  historyText: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  historyMeta: { ...typography.caption, color: colors.neutral[400], marginTop: 2 },
  historyNote: { ...typography.caption, color: colors.textSecondary, marginTop: 2, fontStyle: 'italic' },
  // Status modal
  fieldLabel: { ...typography.bodySmall, fontWeight: '600', color: colors.text, marginBottom: spacing.sm, marginTop: spacing.sm },
  input: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    ...typography.body, color: colors.text, backgroundColor: colors.background, marginBottom: spacing.sm,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  statusChipRow: { flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.sm, flexWrap: 'wrap' },
  statusChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full,
    backgroundColor: colors.neutral[100], borderWidth: 1, borderColor: colors.border,
  },
  statusChipActive: { backgroundColor: colors.primary[600], borderColor: colors.primary[600] },
  statusChipText: { ...typography.bodySmall, color: colors.textSecondary },
  statusChipTextActive: { color: colors.white, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
});
