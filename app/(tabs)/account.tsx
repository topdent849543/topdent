import { router } from 'expo-router';
import { View, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Image } from 'react-native';
import {
  User,
  Package,
  MapPin,
  CreditCard,
  Bell,
  HelpCircle,
  LogOut,
  ChevronRight,
  Heart,
  Tag,
  Shield,
  Store,
  Megaphone,
  Wallet,
  ShoppingBag,
  Film,
  Link2,
  Users,
  Banknote,
  Truck,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { useAuth } from '@/lib/AuthContext';
import { ArabicText as Text } from '@/components/ArabicText';
import { DeleteAccountButton } from '@/components/DeleteAccountButton';

export default function AccountScreen() {
  const { user, profile, activeMembership, signOut, isAdmin, isMerchant, isPublisher, hasPermission } = useAuth();

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Account</Text>
        </View>
        <View style={styles.signInPrompt}>
          <User size={64} color={colors.neutral[300]} />
          <Text style={styles.signInTitle}>Welcome to VARLO</Text>
          <Text style={styles.signInMsg}>Sign in to access your account, orders, and wishlist</Text>
          <TouchableOpacity
            style={styles.signInBtn}
            onPress={() => router.push('/auth/login')}
          >
            <Text style={styles.signInBtnText}>Sign In / Sign Up</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const roleLabel = activeMembership?.role.name ?? 'Customer';

  const customerItems = [
    { icon: Package, label: 'My Orders', action: () => router.push('/orders') },
    { icon: Wallet, label: 'My Wallet', action: () => router.push('/wallet') },
    { icon: Heart, label: 'Wishlist', action: () => router.push('/(tabs)/wishlist') },
    { icon: MapPin, label: 'Addresses', action: () => router.push('/addresses') },
    { icon: Tag, label: 'Coupons & Offers', action: () => router.push('/coupons') },
    { icon: Bell, label: 'Notifications', action: () => router.push('/notifications') },
    { icon: CreditCard, label: 'Payment Methods', action: () => {} },
    { icon: Shield, label: 'Privacy & Security', action: () => router.push('/privacy-policy') },
    { icon: HelpCircle, label: 'Help & Support', action: () => router.push('/support') },
  ];

  const merchantItems = [
    { icon: Users, label: 'Company Dashboard', action: () => router.push('/company') },
    { icon: Store, label: 'Merchant Dashboard', action: () => router.push('/merchant') },
    { icon: ShoppingBag, label: 'My Products', action: () => router.push('/merchant/products') },
    { icon: Film, label: 'My Reels', action: () => router.push('/merchant/reels') },
    { icon: Package, label: 'Orders', action: () => router.push('/merchant/orders') },
    { icon: Wallet, label: 'Wallet & Earnings', action: () => router.push('/merchant/wallet') },
    { icon: Banknote, label: 'Withdrawals', action: () => router.push('/merchant/withdrawals') },
  ];

  const publisherItems = [
    { icon: Megaphone, label: 'Publisher Dashboard', action: () => router.push('/publisher') },
    { icon: Link2, label: 'Affiliate Links', action: () => router.push('/publisher/links') },
    { icon: Wallet, label: 'Wallet & Earnings', action: () => router.push('/publisher/wallet') },
    { icon: Banknote, label: 'Withdrawals', action: () => router.push('/publisher/withdrawals') },
  ];

  const adminItems = [
    { icon: Shield, label: 'Admin Dashboard', action: () => router.push('/admin') },
    { icon: Users, label: 'Manage Users', action: () => router.push('/admin/users') },
    { icon: Banknote, label: 'Withdrawal Requests', action: () => router.push('/admin/withdrawals') },
  ];

  const dashboards = [
    ...(isAdmin && ['orders.view','products.view','drivers.view','users.view','companies.view','roles.view','audit_logs.view','finance.view','reports.view'].some((p) => hasPermission(p))
      ? [{ icon: Shield, label: 'Platform Dashboard', action: () => router.push('/platform') }] : []),
    ...(isMerchant && hasPermission('companies.view') ? merchantItems.slice(0, 1) : []),
    ...(isMerchant ? merchantItems.slice(1).filter((item, i) => {
      const perms = ['reports.view', 'products.view', 'products.view', 'orders.view', 'finance.view', 'withdrawals.create'];
      return hasPermission(perms[i] ?? 'companies.view');
    }) : []),
    ...(isPublisher && hasPermission('affiliate.manage_self') ? publisherItems : []),
    ...(hasPermission('drivers.accept_orders') ? [{ icon: Truck, label: 'Driver Dashboard', action: () => router.push('/driver') }] : []),
    ...(isAdmin ? adminItems.filter((_, i) => i === 2 ? hasPermission('finance.manage_withdrawals') : hasPermission(i === 1 ? 'users.view' : 'reports.view')) : []),
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Account</Text>
        <TouchableOpacity onPress={() => router.push('/profile')}>
          <Text style={styles.editBtn}>Edit</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <View style={styles.profileCard}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <User size={32} color={colors.white} />
            </View>
          )}
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{profile?.full_name ?? 'User'}</Text>
            <Text style={styles.profileEmail}>{user.email}</Text>
            {profile?.phone ? <Text style={styles.profilePhone}>{profile.phone}</Text> : null}
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{roleLabel}</Text>
            </View>
          </View>
        </View>

        {dashboards.length > 0 && (
          <View style={styles.menuContainer}>
            <Text style={styles.sectionTitle}>Dashboard</Text>
            {dashboards.map((item, i) => {
              const Icon = item.icon;
              return (
                <TouchableOpacity
                  key={`dash-${i}`}
                  style={styles.menuItem}
                  onPress={item.action}
                  activeOpacity={0.7}
                >
                  <View style={styles.menuLeft}>
                    <View style={[styles.menuIcon, { backgroundColor: colors.primary[50] }]}>
                      <Icon size={20} color={colors.primary[600]} />
                    </View>
                    <Text style={styles.menuLabel}>{item.label}</Text>
                  </View>
                  <ChevronRight size={20} color={colors.neutral[400]} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={styles.menuContainer}>
          <Text style={styles.sectionTitle}>Account</Text>
          {customerItems.map((item, i) => {
            const Icon = item.icon;
            return (
              <TouchableOpacity
                key={`cust-${i}`}
                style={styles.menuItem}
                onPress={item.action}
                activeOpacity={0.7}
              >
                <View style={styles.menuLeft}>
                  <View style={styles.menuIcon}>
                    <Icon size={20} color={colors.primary[600]} />
                  </View>
                  <Text style={styles.menuLabel}>{item.label}</Text>
                </View>
                <ChevronRight size={20} color={colors.neutral[400]} />
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={[styles.menuItem, styles.logoutItem]}
            onPress={() => {
              signOut();
              router.replace('/(tabs)');
            }}
            activeOpacity={0.7}
          >
            <View style={styles.menuLeft}>
              <View style={[styles.menuIcon, { backgroundColor: colors.error[50] }]}>
                <LogOut size={20} color={colors.error[500]} />
              </View>
              <Text style={[styles.menuLabel, { color: colors.error[500] }]}>Sign Out</Text>
            </View>
          </TouchableOpacity>
          <DeleteAccountButton />
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  title: {
    ...typography.h2,
    color: colors.text,
  },
  editBtn: {
    ...typography.bodySmall,
    color: colors.primary[600],
    fontWeight: '600',
  },
  signInPrompt: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  signInTitle: {
    ...typography.h3,
    color: colors.text,
  },
  signInMsg: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  signInBtn: {
    backgroundColor: colors.primary[600],
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  signInBtnText: {
    ...typography.button,
    color: colors.white,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    margin: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadows.sm,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    ...typography.h4,
    color: colors.text,
  },
  profileEmail: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  profilePhone: {
    ...typography.caption,
    color: colors.textMuted,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary[100],
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginTop: 4,
  },
  roleBadgeText: {
    ...typography.caption,
    color: colors.primary[700],
    fontWeight: '700',
  },
  sectionTitle: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.sm,
  },
  menuContainer: {
    margin: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.sm,
    padding: spacing.sm,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    ...typography.body,
    color: colors.text,
  },
  logoutItem: {
    borderBottomWidth: 0,
  },
});
