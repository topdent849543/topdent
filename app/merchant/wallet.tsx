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
  BarChart3,
  Shield,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  Check,
  TrendingUp,
  Banknote,
  DollarSign,
  ShoppingBag,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import type { Wallet as WalletType, WalletTransaction } from '@/lib/supabase';

const TX_TYPE_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; color: string; bg: string; sign: string }
> = {
  credit: {
    label: 'Credit',
    icon: <ArrowDownCircle size={18} color={colors.success[600]} />,
    color: colors.success[600],
    bg: colors.success[50],
    sign: '+',
  },
  debit: {
    label: 'Debit',
    icon: <ArrowUpCircle size={18} color={colors.error[600]} />,
    color: colors.error[600],
    bg: colors.error[50],
    sign: '-',
  },
  pending_credit: {
    label: 'Pending Sales',
    icon: <Clock size={18} color={colors.warning[600]} />,
    color: colors.warning[600],
    bg: colors.warning[50],
    sign: '+',
  },
  pending_release: {
    label: 'Sales Released',
    icon: <Check size={18} color={colors.success[600]} />,
    color: colors.success[600],
    bg: colors.success[50],
    sign: '+',
  },
  withdrawal: {
    label: 'Withdrawal',
    icon: <Banknote size={18} color={colors.primary[600]} />,
    color: colors.primary[600],
    bg: colors.primary[50],
    sign: '-',
  },
  adjustment: {
    label: 'Adjustment',
    icon: <TrendingUp size={18} color={colors.neutral[600]} />,
    color: colors.neutral[600],
    bg: colors.neutral[100],
    sign: '',
  },
};

const TX_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: colors.warning[600], bg: colors.warning[50] },
  completed: { label: 'Completed', color: colors.success[600], bg: colors.success[50] },
  failed: { label: 'Failed', color: colors.error[600], bg: colors.error[50] },
  cancelled: { label: 'Cancelled', color: colors.neutral[500], bg: colors.neutral[100] },
};

export default function MerchantEarningsScreen() {
  const { user, isMerchant } = useAuth();
  const [wallet, setWallet] = useState<WalletType | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const [walletRes, txRes] = await Promise.all([
        supabase
          .from('wallets')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('wallet_transactions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (walletRes.error) throw walletRes.error;
      if (txRes.error) throw txRes.error;

      setWallet((walletRes.data as WalletType) ?? null);
      setTransactions((txRes.data as WalletTransaction[]) ?? []);
    } catch (e: any) {
      setError(e.message || 'Failed to load sales');
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

  const renderTransaction = ({ item }: { item: WalletTransaction }) => {
    const cfg = TX_TYPE_CONFIG[item.type] ?? TX_TYPE_CONFIG.adjustment;
    const statusCfg = TX_STATUS_CONFIG[item.status] ?? TX_STATUS_CONFIG.completed;
    return (
      <View style={styles.txCard}>
        <View style={[styles.txIcon, { backgroundColor: cfg.bg }]}>{cfg.icon}</View>
        <View style={{ flex: 1 }}>
          <Text style={styles.txType}>{cfg.label}</Text>
          {item.description ? (
            <Text style={styles.txDesc} numberOfLines={1}>
              {item.description}
            </Text>
          ) : null}
          <View style={styles.txMetaRow}>
            <Text style={styles.txDate}>{fmtDate(item.created_at)}</Text>
            <View style={[styles.txStatusBadge, { backgroundColor: statusCfg.bg }]}>
              <Text style={[styles.txStatusText, { color: statusCfg.color }]}>
                {statusCfg.label}
              </Text>
            </View>
          </View>
        </View>
        <Text style={[styles.txAmount, { color: cfg.color }]}>
          {cfg.sign}{fmtMoney(item.amount)}
        </Text>
      </View>
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
          <Text style={styles.title}>Sales</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.accessGuard}>
          <Shield size={64} color={colors.neutral[300]} />
          <Text style={styles.accessTitle}>Merchant Access Required</Text>
          <Text style={styles.accessMsg}>
            You need merchant privileges to view sales.
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
          <Text style={styles.title}>Sales</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={styles.loadingText}>Loading sales…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !wallet) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Sales</Text>
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

  const totalEarned = wallet?.total_earned ?? 0;
  const totalWithdrawn = wallet?.total_withdrawn ?? 0;
  const currentBalance = wallet?.available_balance ?? 0;
  const creditTxCount = transactions.filter(t => t.type === 'credit' || t.type === 'pending_release').length;

  const statsCards = [
    {
      label: 'Total Sales',
      value: fmtMoney(totalEarned),
      icon: <TrendingUp size={20} color={colors.success[700]} />,
      iconBg: colors.success[100],
    },
    {
      label: 'Current Balance',
      value: fmtMoney(currentBalance),
      icon: <DollarSign size={20} color={colors.primary[700]} />,
      iconBg: colors.primary[100],
    },
    {
      label: 'Total Paid Out',
      value: fmtMoney(totalWithdrawn),
      icon: <Banknote size={20} color={colors.neutral[600]} />,
      iconBg: colors.neutral[100],
    },
    {
      label: 'Sales Events',
      value: String(creditTxCount),
      icon: <ShoppingBag size={20} color={colors.accent[600]} />,
      iconBg: colors.accent[100],
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Sales</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={renderTransaction}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View>
            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            ) : null}

            {/* Earnings hero */}
            <View style={styles.heroCard}>
              <View style={styles.heroIconWrap}>
                <BarChart3 size={28} color={colors.white} />
              </View>
              <Text style={styles.heroLabel}>EARNINGS OVERVIEW</Text>
              <Text style={styles.heroValue}>{fmtMoney(totalEarned)}</Text>
              <Text style={styles.heroSub}>Lifetime sales revenue</Text>
            </View>

            {/* Stats grid */}
            <View style={styles.statsGrid}>
              {statsCards.map((card, idx) => (
                <View key={idx} style={styles.statCard}>
                  <View style={[styles.statIcon, { backgroundColor: card.iconBg }]}>
                    {card.icon}
                  </View>
                  <Text style={styles.statValue}>{card.value}</Text>
                  <Text style={styles.statLabel}>{card.label}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Transaction History</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <BarChart3 size={56} color={colors.neutral[300]} />
            <Text style={styles.emptyTitle}>No transactions yet</Text>
            <Text style={styles.emptyMsg}>
              Your product sales will appear here.
            </Text>
          </View>
        }
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
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.error[100],
  },
  errorBannerText: {
    ...typography.bodySmall,
    color: colors.error[700],
  },
  // Hero card
  heroCard: {
    backgroundColor: colors.primary[600],
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.md,
    alignItems: 'center',
    ...shadows.md,
  },
  heroIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  heroLabel: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: spacing.xs ?? 4,
  },
  heroValue: {
    ...typography.h1,
    color: colors.white,
    fontWeight: '700',
  },
  heroSub: {
    ...typography.bodySmall,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statValue: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '700',
  },
  statLabel: {
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
  // Transaction card
  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  txIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txType: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  txDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  txMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 4,
  },
  txDate: {
    ...typography.caption,
    color: colors.neutral[400],
  },
  txStatusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  txStatusText: {
    ...typography.caption,
    fontWeight: '600',
  },
  txAmount: {
    ...typography.h4,
    fontWeight: '700',
  },
});
