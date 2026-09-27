import { router } from 'expo-router';
import { SafeAreaView, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ArabicText as Text } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { colors, spacing, radius } from '@/lib/theme';

const links = [
  ['orders.view', 'الطلبات', '/platform/orders'], ['products.view', 'المنتجات', '/platform/products'],
  ['drivers.view', 'السائقون', '/platform/drivers'], ['users.view', 'المستخدمون', '/platform/users'],
  ['companies.view', 'الشركات', '/platform/companies'], ['roles.view', 'الأدوار والصلاحيات', '/platform/roles'],
  ['audit_logs.view', 'سجل التدقيق', '/platform/audit-logs'], ['finance.view', 'المالية', '/platform/finance'],
  ['reports.view', 'التقارير', '/platform/reports'], ['subscriptions.manage', 'الاشتراكات', '/platform/subscriptions'],
  ['settings.manage', 'إعدادات المنصة', '/platform/settings'],
] as const;

export default function PlatformDashboard() {
  const { hasPlatformPermission } = useAuth();
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>لوحة المنصة</Text>
    <Text style={styles.subtitle}>تظهر الأقسام التي تسمح بها صلاحيات المنصة فقط.</Text>
    <View style={styles.grid}>{links.filter(([permission]) => hasPlatformPermission(permission)).map(([permission, label, path]) =>
      <TouchableOpacity key={permission} style={styles.card} onPress={() => router.push(path as never)}><Text style={styles.cardText}>{label}</Text></TouchableOpacity>
    )}</View>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  subtitle: { color: colors.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: { width: '47%', minHeight: 88, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, justifyContent: 'center' },
  cardText: { fontWeight: '700', color: colors.text },
});
