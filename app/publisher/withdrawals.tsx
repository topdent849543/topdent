import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  ChevronLeft,
  Wallet,
  Shield,
  Clock,
  Check,
  X,
  Banknote,
  Calendar,
  Smartphone,
  Building2,
  Settings,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import type { WithdrawalRequest } from '@/lib/supabase';

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  pending: {
    label: 'Pending Review',
    color: colors.warning[600],
    bg: colors.warning[50],
    icon: <Clock size={12} color={colors.warning[600]} />,
  },
  approved: {
    label: 'Processing',
    color: colors.primary[600],
    bg: colors.primary[50],
    icon: <Check size={12} color={colors.primary[600]} />,
  },
  rejected: {
    label: 'Rejected',
    color: colors.error[600],
    bg: colors.error[50],
    icon: <X size={12} color={colors.error[600]} />,
  },
  paid: {
    label: 'Paid',
    color: colors.success[600],
    bg: colors.success[50],
    icon: <Banknote size={12} color={colors.success[600]} />,
  },
  cancelled: {
    label: 'Cancelled',
    color: colors.neutral[500],
    bg: colors.neutral[100],
    icon: <X size={12} color={colors.neutral[500]} />,
  },
};

const METHOD_LABELS: Record<string, string> = {
  sham_cash: 'شام كاش',
  syriatel_cash: 'سيريتيل كاش',
  bank: 'تحويل بنكي',
};

function parsePaymentInfo(raw: string): { method: string; details: Record<string, string> } {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const { method, ...details } = parsed;
      return { method: method ?? '', details };
    }
  } catch {}
  // Legacy plain-text fallback
  return { method: '', details: { info: raw } };
}

function PaymentMethodDisplay({ raw }: { raw: string }) {
  const { method, details } = parsePaymentInfo(raw);
  const label = METHOD_LABELS[method] ?? method;
  const isBank = method === 'bank';

  return (
    <View style={payStyles.container}>
      <View style={payStyles.methodRow}>
        {isBank ? (
          <Building2 size={14} color={colors.primary[600]} />
        ) : (
          <Smartphone size={14} color={colors.primary[600]} />
        )}
        <Text style={payStyles.methodLabel}>{label || 'Payment Info'}</Text>
      </View>
      {Object.entries(details).map(([key, val]) => (
        <View key={key} style={payStyles.detailRow}>
          <Text style={payStyles.detailKey}>
            {key === 'phone'
              ? 'Phone'
              : key === 'bank_name'
              ? 'Bank'
              : key === 'account_number'
              ? 'Account No.'
              : key === 'account_holder'
              ? 'Account Holder'
              : key === 'info'
              ? 'Info'
              : key}
          </Text>
          <Text style={payStyles.detailVal}>{String(val)}</Text>
        </View>
      ))}
    </View>
  );
}

const payStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  methodLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primary[700],
    textTransform: 'uppercase',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  detailKey: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  detailVal: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
  },
});

export default function PublisherPaymentHistoryScreen() {
  const { user, isPublisher } = useAuth();
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;
      setWithdrawals((data as WithdrawalRequest[]) ?? []);
    } catch (e: any) {
      setError(e.message || 'Failed to load payment history');
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

  const renderItem = ({ item }: { item: WithdrawalRequest }) => {
    const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pending;
    return (
      <View style={styles.withdrawalCard}>
        {/* Top row: amount + status */}
        <View style={styles.cardTop}>
          <View style={styles.cardTopLeft}>
            <View style={styles.amountIcon}>
              <Banknote size={18} color={colors.primary[600]} />
            </View>
            <View>
              <Text style={styles.amountText}>{fmtMoney(item.amount)}</Text>
              <View style={styles.dateRow}>
                <Calendar size={10} color={colors.neutral[400]} />
                <Text style={styles.dateText}>{fmtDate(item.created_at)}</Text>
              </View>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
            {cfg.icon}
            <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>

        {/* Invoice number */}
        {item.invoice_number ? (
          <View style={styles.invoiceRow}>
            <Text style={styles.invoiceLabel}>Invoice</Text>
            <Text style={styles.invoiceValue}>{item.invoice_number}</Text>
          </View>
        ) : null}

        {/* Secure QR invoice */}
        <TouchableOpacity
          style={styles.qrInvoiceBtn}
          onPress={() => router.push(`/invoice/${item.id}?kind=withdrawal`)}
        >
          <Text style={styles.qrInvoiceBtnText}>عرض الفاتورة الكاملة (QR / PDF)</Text>
        </TouchableOpacity>

        {/* Payment method display */}
        {item.payment_info ? (
          <>
            <Text style={styles.paymentInfoTitle}>Payment Method</Text>
            <PaymentMethodDisplay raw={item.payment_info} />
          </>
        ) : null}

        {/* Admin notes */}
        {item.admin_notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Note from Admin</Text>
            <Text style={styles.notesValue}>{item.admin_notes}</Text>
          </View>
        ) : null}

        {/* Processed date */}
        {item.processed_at ? (
          <Text style={styles.processedText}>
            Processed on {fmtDate(item.processed_at)}
          </Text>
        ) : null}
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
          <Text style={styles.title}>Payment History</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.accessGuard}>
          <Shield size={64} color={colors.neutral[300]} />
          <Text style={styles.accessTitle}>Publisher Access Required</Text>
          <Text style={styles.accessMsg}>
            You need publisher privileges to view payment history.
          </Text>
          <View style={{ marginTop: spacing.lg, width: '100%' }}>
            <Button title="Back to Home" onPress={() => router.replace('/(tabs)/index')} fullWidth />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Payment History</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={styles.loadingText}>Loading payment history…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && withdrawals.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Payment History</Text>
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

  const totalPaid = withdrawals
    .filter((w) => w.status === 'paid')
    .reduce((sum, w) => sum + w.amount, 0);
  const totalInProcess = withdrawals
    .filter((w) => w.status === 'pending' || w.status === 'approved')
    .reduce((sum, w) => sum + w.amount, 0);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Payment History</Text>
        <View style={{ width: 40 }} />
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={withdrawals}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View>
            {withdrawals.length > 0 ? (
              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <View style={[styles.summaryIcon, { backgroundColor: colors.warning[100] }]}>
                    <Clock size={18} color={colors.warning[600]} />
                  </View>
                  <Text style={styles.summaryValue}>{fmtMoney(totalInProcess)}</Text>
                  <Text style={styles.summaryLabel}>In Process</Text>
                </View>
                <View style={styles.summaryCard}>
                  <View style={[styles.summaryIcon, { backgroundColor: colors.success[100] }]}>
                    <Check size={18} color={colors.success[700]} />
                  </View>
                  <Text style={styles.summaryValue}>{fmtMoney(totalPaid)}</Text>
                  <Text style={styles.summaryLabel}>Total Paid</Text>
                </View>
              </View>
            ) : null}
            <Text style={styles.sectionTitle}>All Payments</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Wallet size={56} color={colors.neutral[300]} />
            <Text style={styles.emptyTitle}>No payments yet</Text>
            <Text style={styles.emptyMsg}>
              Payments will appear here once the admin processes your withdrawal based on your
              configured settings.
            </Text>
            <View style={{ marginTop: spacing.lg, width: '100%' }}>
              <Button
                title="Configure Withdrawal Settings"
                onPress={() => router.push('/publisher/wallet')}
                fullWidth
              />
            </View>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  qrInvoiceBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.neutral[900],
    borderRadius: radius.md,
    paddingVertical: 11,
    alignItems: 'center',
  },
  qrInvoiceBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.neutral[900],
  },
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
    margin: spacing.md,
    borderWidth: 1,
    borderColor: colors.error[100],
  },
  errorBannerText: {
    ...typography.bodySmall,
    color: colors.error[700],
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  summaryValue: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '700',
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
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
  withdrawalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTopLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  amountIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountText: {
    ...typography.h3,
    fontWeight: '700',
    color: colors.text,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  dateText: {
    ...typography.caption,
    color: colors.neutral[400],
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '600',
  },
  invoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.neutral[50],
    borderRadius: radius.sm,
  },
  invoiceLabel: {
    ...typography.caption,
    color: colors.neutral[500],
    fontWeight: '500',
  },
  invoiceValue: {
    ...typography.caption,
    color: colors.neutral[700],
    fontWeight: '600',
  },
  paymentInfoTitle: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
    marginBottom: 2,
  },
  notesBox: {
    backgroundColor: colors.neutral[50],
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  notesLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  notesValue: {
    ...typography.bodySmall,
    color: colors.text,
  },
  processedText: {
    ...typography.caption,
    color: colors.neutral[400],
    fontStyle: 'italic',
    marginTop: spacing.sm,
  },
});
