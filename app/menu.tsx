import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import {
  ChevronLeft,
  Home,
  Grid3x3,
  Tag,
  Package,
  Heart,
  User,
  HelpCircle,
  Globe,
  Shield,
  FileText,
  LogOut,
  ChevronRight,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { useAuth } from '@/lib/AuthContext';
import { ArabicText as Text } from '@/components/ArabicText';
import { DeleteAccountButton } from '@/components/DeleteAccountButton';
import { t } from '@/lib/i18n';

export default function MenuScreen() {
  const { user, signOut } = useAuth();

  const menuItems = [
    { icon: Home, label: 'الرئيسية', action: () => router.push('/(tabs)/index') },
    { icon: Grid3x3, label: 'الفئات والأقسام', action: () => router.push('/(tabs)/search') },
    { icon: Tag, label: 'العروض والخصومات', action: () => router.push('/coupons') },
    { icon: Package, label: 'طلباتي', action: () => router.push('/orders') },
    { icon: Heart, label: 'المفضلة', action: () => router.push('/(tabs)/wishlist') },
    { icon: User, label: 'حسابي الشخصي', action: () => router.push('/(tabs)/account') },
    { icon: HelpCircle, label: 'الدعم والمساعدة', action: () => router.push('/support') },
    { icon: Globe, label: 'اللغة: العربية', action: () => {} },
    { icon: Shield, label: 'سياسة الخصوصية', action: () => router.push('/privacy-policy') },
    { icon: FileText, label: 'الشروط والأحكام', action: () => router.push('/terms') },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>القائمة الرئيسية</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        <View style={styles.brandCard}>
          <Image source={require('@/assets/images/varlo-logo.png')} style={styles.brandLogo} />
          <Text style={styles.brandName}>TopDent</Text>
          <Text style={styles.brandTagline}>منصة متخصصة لأدوات وأجهزة طب الأسنان</Text>
        </View>
        <View style={styles.menuContainer}>
          {menuItems.map((item, i) => {
            const Icon = item.icon;
            return (
              <TouchableOpacity
                key={i}
                style={[
                  styles.menuItem,
                  i === menuItems.length - 1 && { borderBottomWidth: 0 },
                ]}
                onPress={item.action}
                activeOpacity={0.7}
              >
                <View style={styles.menuIcon}>
                  <Icon size={20} color={colors.dental} />
                </View>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <ChevronRight size={20} color={colors.neutral[400]} />
              </TouchableOpacity>
            );
          })}
        </View>
        {user ? (
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={() => {
              signOut();
              router.replace('/(tabs)');
            }}
          >
            <View style={[styles.menuIcon, { backgroundColor: colors.error[50] }]}>
              <LogOut size={20} color={colors.error[500]} />
            </View>
            <Text style={[styles.menuLabel, { color: colors.error[500] }]}>تسجيل الخروج</Text>
          </TouchableOpacity>
        ) : null}
        {user ? (
          <DeleteAccountButton style={styles.logoutBtn} />
        ) : (
          <TouchableOpacity
            style={styles.loginBtn}
            onPress={() => router.push('/auth/login')}
          >
            <Text style={styles.loginBtnText}>تسجيل الدخول / إنشاء حساب</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.version}>الإصدار 1.0.0 - TopDent</Text>
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
  brandCard: {
    backgroundColor: colors.dentalLight,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: 4,
    borderWidth: 2,
    borderColor: colors.dental,
  },
  brandLogo: {
    width: 56,
    height: 56,
    borderRadius: 16,
    marginBottom: 4,
  },
  brandName: {
    ...typography.h2,
    fontWeight: '800',
    color: colors.dental,
    letterSpacing: 1,
  },
  brandTagline: {
    ...typography.bodySmall,
    color: colors.dentalDark,
  },
  menuContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    flex: 1,
    ...typography.body,
    color: colors.text,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  loginBtn: {
    backgroundColor: colors.dental,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  loginBtnText: {
    ...typography.button,
    color: colors.white,
  },
  version: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
