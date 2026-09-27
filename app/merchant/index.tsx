import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  ChevronLeft,
  Package,
  Video,
  ShoppingBag,
  BarChart3,
  Store,
  ArrowRight,
  Shield,
  TrendingUp,
  DollarSign,
  MessageCircle,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import type { Wallet as WalletType } from '@/lib/supabase';

type Stats = {
  totalProducts: number;
  totalReels: number;
  totalOrders: number;
  wallet: WalletType | null;
};

export default function MerchantDashboardScreen() {
  const { user, profile, isMerchant, signOut, activeCompany } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !activeCompany?.id) return;
    setError(null);
    try {
      const [productsRes, reelsRes, ordersRes, walletRes] = await Promise.all([
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', activeCompany.id),
        supabase
          .from('reels')
          .select('id', { count: 'exact', head: true })
          .eq('merchant_id', user.id),
        supabase
          .from('order_items')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', activeCompany.id),
        supabase
          .from('wallets')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (reelsRes.error) throw reelsRes.error;
      if (ordersRes.error) throw ordersRes.error;
      if (walletRes.error) throw walletRes.error;

      setStats({
        totalProducts: productsRes.count ?? 0,
        totalReels: reelsRes.count ?? 0,
        totalOrders: ordersRes.count ?? 0,
        wallet: (walletRes.data as WalletType) ?? null,
      });
    } catch (e: any) {
      setError(e.message || 'Failed to load dashboard');
    }
  }, [user, activeCompany?.id]);

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

  // ── Access guard ──────────────────────────────────────────────
  if (!user || !isMerchant) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Merchant</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.accessGuard}>
          <Shield size={64} color={colors.neutral[300]} />
          <Text style={styles.accessTitle}>Merchant Access Required</Text>
          <Text style={styles.accessMsg}>
            You need merchant privileges to view this dashboard.
          </Text>
          <View style={{ marginTop: spacing.lg, width: '100%' }}>
            <Button
              title="Back to Home"
              onPress={() => router.replace('/(tabs)')}
              fullWidth
            />
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
          <Text style={styles.title}>Merchant Dashboard</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={styles.loadingText}>Loading dashboard…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ──────────────────────────────────────────────────────
  if (error && !stats) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Merchant Dashboard</Text>
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

  const wallet = stats?.wallet;
  const totalEarned = wallet?.total_earned ?? 0;
  const totalWithdrawn = wallet?.total_withdrawn ?? 0;
  const currentBalance = wallet?.available_balance ?? 0;

  const statCards = [
    {
      label: 'Total Products',
      value: stats ? String(stats.totalProducts) : '—',
      icon: <Package size={22} color={colors.primary[700]} />,
      iconBg: colors.primary[100],
    },
    {
      label: 'Total Reels',
      value: stats ? String(stats.totalReels) : '—',
      icon: <Video size={22} color={colors.accent[600]} />,
      iconBg: colors.accent[100],
    },
    {
      label: 'Total Orders',
      value: stats ? String(stats.totalOrders) : '—',
      icon: <ShoppingBag size={22} color={colors.success[700]} />,
      iconBg: colors.success[100],
    },
    {
      label: 'Current Balance',
      value: fmtMoney(currentBalance),
      icon: <DollarSign size={22} color={colors.warning[600]} />,
      iconBg: colors.warning[100],
    },
  ];

  const quickLinks = [
    {
      label: 'Manage Products',
      description: 'Add, edit, and manage your product catalog',
      icon: <Package size={24} color={colors.primary[600]} />,
      onPress: () => router.push('/merchant/products'),
    },
    {
      label: 'Manage Reels',
      description: 'Create and manage product showcase reels',
      icon: <Video size={24} color={colors.primary[600]} />,
      onPress: () => router.push('/merchant/reels'),
    },
    {
      label: 'View Orders',
      description: 'Search, filter, and export orders containing your products',
      icon: <ShoppingBag size={24} color={colors.primary[600]} />,
      onPress: () => router.push('/merchant/orders'),
    },
    {
      label: 'الرسائل',
      description: 'محادثات الزبائن حول منتجاتك (هوية الزبون مخفية)',
      icon: <MessageCircle size={24} color={colors.primary[600]} />,
      onPress: () => router.push('/merchant/chats'),
    },
    {
      label: 'Sales & Transactions',
      description: 'View your sales and transaction history',
      icon: <BarChart3 size={24} color={colors.primary[600]} />,
      onPress: () => router.push('/merchant/wallet'),
    },
    {
      label: 'Withdrawals',
      description: 'Request and track payouts from your wallet balance',
      icon: <DollarSign size={24} color={colors.primary[600]} />,
      onPress: () => router.push('/merchant/withdrawals'),
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Merchant Dashboard</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Welcome banner */}
        <View style={styles.welcomeBanner}>
          <View style={styles.welcomeLeft}>
            <Text style={styles.welcomeGreeting}>Welcome back,</Text>
            <Text style={styles.welcomeName}>{profile?.full_name || 'Merchant'}</Text>
          </View>
          <View style={styles.welcomeIcon}>
            <Store size={28} color={colors.primary[600]} />
          </View>
        </View>

        {/* Error banner (non-blocking when stats exist) */}
        {error && stats ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        {/* Earnings summary card */}
        <View style={styles.earningsCard}>
          <View style={styles.earningsHeader}>
            <View style={styles.earningsIconWrap}>
              <BarChart3 size={20} color={colors.white} />
            </View>
            <Text style={styles.earningsTitle}>Sales Summary</Text>
          </View>
          <Text style={styles.earningsTotal}>{fmtMoney(totalEarned)}</Text>
          <Text style={styles.earningsSub}>Lifetime sales revenue</Text>
          <View style={styles.earningsSplit}>
            <View style={styles.earningsSplitItem}>
              <TrendingUp size={14} color={colors.success[600]} />
              <Text style={styles.earningsSplitLabel}>Total Sales</Text>
              <Text style={styles.earningsSplitValue}>{fmtMoney(totalEarned)}</Text>
            </View>
            <View style={styles.earningsSplitDivider} />
            <View style={styles.earningsSplitItem}>
              <DollarSign size={14} color={colors.primary[600]} />
              <Text style={styles.earningsSplitLabel}>Paid Out</Text>
              <Text style={styles.earningsSplitValue}>{fmtMoney(totalWithdrawn)}</Text>
            </View>
          </View>
        </View>

        {/* Stats grid */}
        <Text style={styles.sectionTitle}>Overview</Text>
        <View style={styles.statsGrid}>
          {statCards.map((card, idx) => (
            <View key={idx} style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: card.iconBg }]}>
                {card.icon}
              </View>
              <Text style={styles.statValue}>{card.value}</Text>
              <Text style={styles.statLabel}>{card.label}</Text>
            </View>
          ))}
        </View>

        {/* Quick links */}
        <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Quick Actions</Text>
        {quickLinks.map((link, idx) => (
          <TouchableOpacity
            key={idx}
            style={styles.quickLinkCard}
            onPress={link.onPress}
            activeOpacity={0.7}
          >
            <View style={styles.quickLinkIcon}>{link.icon}</View>
            <View style={{ flex: 1 }}>
              <Text style={styles.quickLinkLabel}>{link.label}</Text>
              <Text style={styles.quickLinkDesc}>{link.description}</Text>
            </View>
            <ArrowRight size={20} color={colors.neutral[400]} />
          </TouchableOpacity>
        ))}

        {/* Sign out */}
        <View style={{ marginTop: spacing.xl }}>
          <Button
            title="Sign Out"
            onPress={() => {
              signOut();
              router.replace('/(tabs)');
            }}
            variant="outline"
            fullWidth
          />
        </View>
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
  // Welcome banner
  welcomeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary[600],
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.md,
  },
  welcomeLeft: { flex: 1 },
  welcomeGreeting: {
    ...typography.bodySmall,
    color: colors.primary[100],
  },
  welcomeName: {
    ...typography.h3,
    color: colors.white,
    fontWeight: '700',
  },
  welcomeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Earnings card
  earningsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  earningsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  earningsIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.success[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  earningsTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  earningsTotal: {
    ...typography.h1,
    color: colors.text,
    fontWeight: '700',
    marginBottom: 4,
  },
  earningsSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  earningsSplit: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  earningsSplitItem: {
    flex: 1,
    gap: 4,
    alignItems: 'flex-start',
  },
  earningsSplitDivider: {
    width: 1,
    height: 44,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  earningsSplitLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  earningsSplitValue: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '700',
  },
  // Section
  sectionTitle: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statValue: {
    ...typography.h2,
    color: colors.text,
    fontWeight: '700',
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  // Quick links
  quickLinkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  quickLinkIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLinkLabel: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  quickLinkDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
