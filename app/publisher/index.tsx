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
  Link2,
  MousePointerClick,
  ShoppingBag,
  DollarSign,
  Wallet,
  Megaphone,
  ArrowRight,
  Shield,
  TrendingUp,
  Clock,
  Banknote,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import type { Wallet as WalletType } from '@/lib/supabase';

type Stats = {
  totalLinks: number;
  totalClicks: number;
  totalPurchases: number;
  totalEarnings: number;
  wallet: WalletType | null;
};

export default function PublisherDashboardScreen() {
  const { user, profile, isPublisher, signOut } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      // Release any matured pending earnings first
      try { await supabase.rpc('release_pending_earnings'); } catch {}
      try { await supabase.rpc('release_affiliate_instant', { p_user_id: null }); } catch {}

      const [linksRes, walletRes] = await Promise.all([
        supabase
          .from('affiliate_links')
          .select('clicks_count, purchases_count, total_earnings')
          .eq('user_id', user.id),
        supabase
          .from('wallets')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      if (linksRes.error) throw linksRes.error;
      if (walletRes.error) throw walletRes.error;

      const links = linksRes.data ?? [];
      const totalClicks = links.reduce((sum, l: any) => sum + (l.clicks_count ?? 0), 0);
      const totalPurchases = links.reduce((sum, l: any) => sum + (l.purchases_count ?? 0), 0);
      const totalEarnings = links.reduce((sum, l: any) => sum + (l.total_earnings ?? 0), 0);

      setStats({
        totalLinks: links.length,
        totalClicks,
        totalPurchases,
        totalEarnings,
        wallet: (walletRes.data as WalletType) ?? null,
      });
    } catch (e: any) {
      setError(e.message || 'Failed to load dashboard');
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

  // ── Access guard ──────────────────────────────────────────────
  if (!user || !isPublisher) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Publisher</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.accessGuard}>
          <Shield size={64} color={colors.neutral[300]} />
          <Text style={styles.accessTitle}>Publisher Access Required</Text>
          <Text style={styles.accessMsg}>
            You need publisher privileges to view this dashboard.
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
          <Text style={styles.title}>Publisher Dashboard</Text>
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
          <Text style={styles.title}>Publisher Dashboard</Text>
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
  const available = wallet?.available_balance ?? 0;
  const pending = wallet?.pending_balance ?? 0;

  const statCards: {
    label: string;
    value: string;
    icon: React.ReactNode;
    iconBg: string;
  }[] = [
    {
      label: 'Affiliate Links',
      value: stats ? String(stats.totalLinks) : '—',
      icon: <Link2 size={22} color={colors.primary[700]} />,
      iconBg: colors.primary[100],
    },
    {
      label: 'Total Clicks',
      value: stats ? String(stats.totalClicks) : '—',
      icon: <MousePointerClick size={22} color={colors.accent[600]} />,
      iconBg: colors.accent[100],
    },
    {
      label: 'Total Purchases',
      value: stats ? String(stats.totalPurchases) : '—',
      icon: <ShoppingBag size={22} color={colors.success[700]} />,
      iconBg: colors.success[100],
    },
    {
      label: 'Total Earnings',
      value: stats ? fmtMoney(stats.totalEarnings) : '—',
      icon: <DollarSign size={22} color={colors.warning[600]} />,
      iconBg: colors.warning[100],
    },
  ];

  const quickLinks = [
    {
      label: 'Affiliate Links',
      description: 'Create and manage your affiliate links',
      icon: <Link2 size={24} color={colors.primary[600]} />,
      onPress: () => router.push('/publisher/links'),
    },
    {
      label: 'Wallet & Earnings',
      description: 'View balance, transactions, and request withdrawals',
      icon: <Wallet size={24} color={colors.primary[600]} />,
      onPress: () => router.push('/publisher/wallet'),
    },
    {
      label: 'Withdrawal History',
      description: 'View status of your withdrawal requests',
      icon: <Clock size={24} color={colors.primary[600]} />,
      onPress: () => router.push('/publisher/withdrawals'),
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Publisher Dashboard</Text>
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
            <Text style={styles.welcomeName}>{profile?.full_name || 'Publisher'}</Text>
          </View>
          <View style={styles.welcomeIcon}>
            <Megaphone size={28} color={colors.primary[600]} />
          </View>
        </View>

        {/* Error banner (non-blocking when stats exist) */}
        {error && stats ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        {/* Wallet summary card */}
        <View style={styles.walletCard}>
          <View style={styles.walletHeader}>
            <View style={styles.walletIconWrap}>
              <Wallet size={20} color={colors.white} />
            </View>
            <Text style={styles.walletTitle}>Wallet Balance</Text>
          </View>
          <Text style={styles.walletTotal}>{fmtMoney(available + pending)}</Text>
          <View style={styles.walletSplit}>
            <View style={styles.walletSplitItem}>
              <View style={[styles.walletDot, { backgroundColor: colors.success[500] }]} />
              <Text style={styles.walletSplitLabel}>Available</Text>
              <Text style={styles.walletSplitValue}>{fmtMoney(available)}</Text>
            </View>
            <View style={styles.walletSplitDivider} />
            <View style={styles.walletSplitItem}>
              <View style={[styles.walletDot, { backgroundColor: colors.warning[500] }]} />
              <Text style={styles.walletSplitLabel}>Pending</Text>
              <Text style={styles.walletSplitValue}>{fmtMoney(pending)}</Text>
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
  // Wallet card
  walletCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  walletIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  walletTotal: {
    ...typography.h1,
    color: colors.text,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  walletSplit: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  walletSplitItem: { flex: 1, gap: 4 },
  walletSplitDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  walletDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  walletSplitLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  walletSplitValue: {
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
