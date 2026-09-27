import { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Mail, Lock, Eye, EyeOff } from 'lucide-react-native';
import { GoogleSign } from '@/components/GoogleSign';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/Button';
import { ArabicText as Text, ArabicTextInput as TextInput } from '@/components/ArabicText';
import { t } from '@/lib/i18n';

export default function LoginScreen() {
  const { signIn, signInWithGoogle } = useAuth();
  // أبعاد النافذة: تُستخدم لجعل الصفحة متوافقة مع الكمبيوتر والهاتف
  const { width: winWidth } = useWindowDimensions();
  const isWide = winWidth >= 700;
  // مسار العودة بعد تسجيل الدخول (يُستخدم عند الضغط على "شراء الآن" كزائر)
  const { redirect, intent, ref } = useLocalSearchParams<{
    redirect?: string;
    intent?: string;
    ref?: string;
  }>();
  const redirectTo = typeof redirect === 'string' && redirect.startsWith('/') ? redirect : null;
  const signupHref =
    '/auth/signup' +
    (redirectTo
      ? `?redirect=${encodeURIComponent(redirectTo)}` +
        (intent ? `&intent=${encodeURIComponent(String(intent))}` : '') +
        (ref ? `&ref=${encodeURIComponent(String(ref))}` : '')
      : '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError(t('Please enter email and password'));
      return;
    }
    setLoading(true);
    setError('');
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) {
      setError(error);
      return;
    }
    router.replace((redirectTo ?? '/(tabs)/account') as any);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.scrollContent,
            isWide && styles.scrollContentWide,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
        >
        <View style={[styles.content, isWide && styles.contentWide]}>
          <Text style={styles.title}>مرحباً في TopDent</Text>
          <Text style={styles.subtitle}>
            {redirectTo
              ? 'سجّل دخولك أو أنشئ حساباً لإكمال عملية الشراء'
              : 'سجّل دخولك إلى حسابك في منصة أدوات طب الأسنان المتخصصة'}
          </Text>
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputWrap}>
              <Mail size={20} color={colors.neutral[400]} />
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
              />
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrap}>
              <Lock size={20} color={colors.neutral[400]} />
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff size={20} color={colors.neutral[400]} /> : <Eye size={20} color={colors.neutral[400]} />}
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity
            style={styles.forgotBtn}
            onPress={() => Alert.alert(t('Reset Password'), t('Contact support to reset your password.'))}
          >
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </TouchableOpacity>
          <Button title={loading ? 'Signing In...' : 'Sign In'} onPress={handleLogin} loading={loading} fullWidth size="lg" />
          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.divider} />
          </View>
          <GoogleSign onPress={signInWithGoogle} />
          <View style={{ height: spacing.md }} />
          <TouchableOpacity
            style={styles.signupBtn}
            onPress={() => router.push(signupHref as any)}
          >
            <Text style={styles.signupText}>
              Don&apos;t have an account? <Text style={styles.signupLink}>Sign Up</Text>
            </Text>
          </TouchableOpacity>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.xxl,
  },
  scrollContentWide: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexGrow: 1,
    padding: spacing.lg,
    width: '100%',
  },
  contentWide: {
    maxWidth: 520,
    alignSelf: 'center',
    flexGrow: 0,
  },
  title: {
    ...typography.h1,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  errorBox: {
    backgroundColor: colors.error[50],
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.error[700],
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginBottom: spacing.lg,
  },
  forgotText: {
    ...typography.bodySmall,
    color: colors.primary[600],
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
    gap: spacing.md,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  signupBtn: {
    alignItems: 'center',
    padding: spacing.md,
  },
  signupText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  signupLink: {
    color: colors.primary[600],
    fontWeight: '700',
  },
});
