import type { ReactNode } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from 'react-native';
import { ShieldX } from 'lucide-react-native';
import { useAuth } from '@/lib/AuthContext';
import { colors, spacing } from '@/lib/theme';
import { ArabicText as Text } from '@/components/ArabicText';

export function RequirePermission({
  permission,
  companyId,
  platformOnly = false,
  children,
}: {
  permission: string;
  companyId?: string | null;
  platformOnly?: boolean;
  children: ReactNode;
}) {
  const { loading, user, hasPermission, hasPlatformPermission } = useAuth();
  if (loading) {
    return <SafeAreaView style={styles.container}><ActivityIndicator color={colors.primary[600]} /></SafeAreaView>;
  }
  if (!user || !(platformOnly ? hasPlatformPermission(permission) : hasPermission(permission, companyId))) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.card}>
          <ShieldX size={42} color={colors.error[500]} />
          <Text style={styles.title}>غير مصرح بالوصول</Text>
          <Text style={styles.message}>هذا القسم غير متاح لحسابك أو نطاق شركتك.</Text>
        </View>
      </SafeAreaView>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: spacing.lg },
  card: { alignItems: 'center', gap: spacing.md, maxWidth: 360 },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  message: { color: colors.textSecondary, textAlign: 'center', lineHeight: 24 },
});
