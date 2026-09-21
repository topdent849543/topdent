import { useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, typography } from '@/lib/theme';
import { ArabicText as Text } from '@/components/ArabicText';

/**
 * صفحة إكمال تسجيل الدخول عبر Google.
 * Supabase يعيد توجيه المستخدم إلى هنا مع كود بالرابط (?code=...)،
 * نستبدله بجلسة حقيقية ثم نرجع المستخدم إلى الصفحة الرئيسية.
 */
export default function AuthCallback() {
  const { code, error: oauthError } = useLocalSearchParams<{ code?: string; error?: string }>();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    (async () => {
      try {
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }
      } catch (e) {
        console.log('[AuthCallback] exchangeCodeForSession failed', e);
      } finally {
        router.replace('/');
      }
    })();
  }, [code]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary[600]} />
      <Text style={styles.text}>
        {oauthError ? 'تعذّر تسجيل الدخول، جارٍ إعادتك...' : 'جارٍ تسجيل الدخول...'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: spacing.md,
  },
  text: { ...typography.bodySmall, color: colors.textSecondary },
});
