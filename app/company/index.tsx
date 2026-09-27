import { router } from 'expo-router';
import { ScrollView, SafeAreaView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { BriefcaseBusiness, Package, ShoppingBag, Users, Truck, BarChart3, Settings, Shield } from 'lucide-react-native';
import { RequirePermission } from '@/components/RequirePermission';
import { CompanyPicker } from '@/components/CompanyPicker';
import { ArabicText as Text } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { colors, spacing, radius } from '@/lib/theme';

export default function CompanyDashboard() {
  const { activeCompany, activeMembership, hasPermission } = useAuth();
  const sections = [
    { key: 'products.view', title: 'المنتجات', route: '/merchant/products', icon: Package },
    { key: 'orders.view', title: 'الطلبات', route: '/merchant/orders', icon: ShoppingBag },
    { key: 'users.view', title: 'فريق الشركة', route: '/company/team', icon: Users },
    { key: 'roles.view', title: 'الأدوار والصلاحيات', route: '/admin/roles', icon: Shield },
    { key: 'audit_logs.view', title: 'سجل التدقيق', route: '/admin/audit', icon: Shield },
    { key: 'drivers.view', title: 'السائقون', route: '/company/drivers', icon: Truck },
    { key: 'reports.view', title: 'التقارير', route: '/company/reports', icon: BarChart3 },
    { key: 'settings.manage', title: 'إعدادات الشركة', route: '/company/settings', icon: Settings },
  ];
  return (
    <RequirePermission permission="companies.view" companyId={activeCompany?.id}>
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <BriefcaseBusiness size={28} color={colors.primary[700]} />
            <View style={styles.headerText}>
              <Text style={styles.title}>{activeCompany?.name ?? 'لوحة الشركة'}</Text>
              <Text style={styles.subtitle}>{activeMembership?.role.name ?? 'عضوية الشركة'}</Text>
              <CompanyPicker />
            </View>
          </View>
          {!activeCompany ? <Text style={styles.empty}>لا توجد شركة نشطة مرتبطة بعضويتك.</Text> : null}
          <View style={styles.grid}>
            {sections.filter((section) => hasPermission(section.key, activeCompany?.id)).map((section) => {
              const Icon = section.icon;
              return (
                <TouchableOpacity key={section.key} style={styles.card} onPress={() => router.push(section.route as never)}>
                  <Icon size={24} color={colors.primary[700]} />
                  <Text style={styles.cardText}>{section.title}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    </RequirePermission>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  headerText: { flex: 1 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, marginTop: 4 },
  empty: { color: colors.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: { width: '47%', minHeight: 110, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border },
  cardText: { color: colors.text, fontWeight: '700' },
});
