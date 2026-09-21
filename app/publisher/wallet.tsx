import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  ChevronLeft,
  Wallet,
  Shield,
  TrendingUp,
  Banknote,
  Settings,
  Check,
  Smartphone,
  Building2,
  DollarSign,
  Info,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text, ArabicTextInput as TextInputArabic } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import type { Wallet as WalletType, WithdrawalSettings } from '@/lib/supabase';

type PaymentMethod = 'sham_cash' | 'syriatel_cash' | 'bank';

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  {
    value: 'sham_cash',
    label: 'شام كاش',
    icon: <Smartphone size={20} color={colors.primary[600]} />,
  },
  {
    value: 'syriatel_cash',
    label: 'سيريتيل كاش',
    icon: <Smartphone size={20} color={colors.primary[600]} />,
  },
  {
    value: 'bank',
    label: 'تحويل بنكي',
    icon: <Building2 size={20} color={colors.primary[600]} />,
  },
];

const MIN_THRESHOLD = 1000; // ل.س — الحد الأدنى لعتبة السحب

export default function PublisherWithdrawalSettingsScreen() {
  const { user, isPublisher } = useAuth();
  const [wallet, setWallet] = useState<WalletType | null>(null);
  const [settings, setSettings] = useState<WithdrawalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [threshold, setThreshold] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('sham_cash');
  const [phone, setPhone] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');

  const populateForm = (s: WithdrawalSettings) => {
    setThreshold(String(s.min_threshold));
    setMethod(s.payment_method as PaymentMethod);
    const details = s.account_details ?? {};
    setPhone(details.phone ?? '');
    setBankName(details.bank_name ?? '');
    setAccountNumber(details.account_number ?? '');
    setAccountHolder(details.account_holder ?? '');
  };

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      // تحرير الأرباح المستحقة أولاً حتى يعكس الرصيد المتاح الواقع الفعلي
      await supabase.rpc('release_due_earnings');
      try { await supabase.rpc('release_affiliate_instant', { p_user_id: null }); } catch {}

      const [walletRes, settingsRes] = await Promise.all([
        supabase
          .from('wallets')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('withdrawal_settings')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      if (walletRes.error) throw walletRes.error;
      if (settingsRes.error && settingsRes.error.code !== 'PGRST116') throw settingsRes.error;

      setWallet((walletRes.data as WalletType) ?? null);
      const s = settingsRes.data as WithdrawalSettings | null;
      setSettings(s);
      if (s) populateForm(s);
    } catch (e: any) {
      setError(e.message || 'Failed to load withdrawal settings');
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

  const buildAccountDetails = (): Record<string, string> => {
    if (method === 'bank') {
      return {
        bank_name: bankName.trim(),
        account_number: accountNumber.trim(),
        account_holder: accountHolder.trim(),
      };
    }
    return { phone: phone.trim() };
  };

  const handleSave = async () => {
    if (!user) return;
    setSaveSuccess(false);
    setFormError(null);

    const thresholdNum = parseFloat(threshold);
    if (isNaN(thresholdNum) || thresholdNum <= MIN_THRESHOLD) {
      const msg = `يجب أن يكون الحد الأدنى للسحب أكبر من ${MIN_THRESHOLD.toLocaleString('en-US')} ل.س. الرجاء إدخال مبلغ أعلى.`;
      setFormError(msg);
      Alert.alert('Invalid Threshold', msg);
      return;
    }

    if (method === 'bank') {
      if (!bankName.trim() || !accountNumber.trim() || !accountHolder.trim()) {
        const msg = 'الرجاء تعبئة كل بيانات الحساب البنكي.';
        setFormError(msg);
        Alert.alert('Missing Info', msg);
        return;
      }
    } else {
      if (!phone.trim()) {
        const msg = 'الرجاء إدخال رقم الهاتف الخاص بالمحفظة.';
        setFormError(msg);
        Alert.alert('Missing Phone', msg);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        min_threshold: thresholdNum,
        payment_method: method,
        account_details: buildAccountDetails(),
        updated_at: new Date().toISOString(),
      };

      const { error: upsertErr } = await supabase
        .from('withdrawal_settings')
        .upsert(payload, { onConflict: 'user_id' });

      if (upsertErr) throw upsertErr;

      setSaveSuccess(true);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save withdrawal settings.');
    } finally {
      setSaving(false);
    }
  };

  // ── Access guard ──────────────────────────────────────────────
  if (!user || !isPublisher) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Withdrawal Settings</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.accessGuard}>
          <Shield size={64} color={colors.neutral[300]} />
          <Text style={styles.accessTitle}>Publisher Access Required</Text>
          <Text style={styles.accessMsg}>
            You need publisher privileges to configure withdrawal settings.
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
          <Text style={styles.title}>Withdrawal Settings</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={styles.loadingText}>Loading settings…</Text>
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
          <Text style={styles.title}>Withdrawal Settings</Text>
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Withdrawal Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          keyboardShouldPersistTaps="handled"
        >
          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{error}</Text>
            </View>
          ) : null}

          {/* Earnings stats */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: colors.success[100] }]}>
                <TrendingUp size={18} color={colors.success[700]} />
              </View>
              <Text style={styles.statValue}>{fmtMoney(totalEarned)}</Text>
              <Text style={styles.statLabel}>Total Earned</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: colors.primary[100] }]}>
                <DollarSign size={18} color={colors.primary[700]} />
              </View>
              <Text style={styles.statValue}>{fmtMoney(currentBalance)}</Text>
              <Text style={styles.statLabel}>Current Balance</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: colors.neutral[100] }]}>
                <Banknote size={18} color={colors.neutral[600]} />
              </View>
              <Text style={styles.statValue}>{fmtMoney(totalWithdrawn)}</Text>
              <Text style={styles.statLabel}>Paid Out</Text>
            </View>
          </View>

          {/* Info box */}
          <View style={styles.infoBox}>
            <Info size={16} color={colors.primary[600]} />
            <Text style={styles.infoText}>
              Set your minimum balance threshold and payment method. When your balance reaches the
              threshold, the admin team will process your payment automatically. No manual request
              needed.
            </Text>
          </View>

          {saveSuccess ? (
            <View style={styles.successBanner}>
              <Check size={16} color={colors.success[700]} />
              <Text style={styles.successText}>Settings saved successfully!</Text>
            </View>
          ) : null}

          {/* Settings form */}
          <View style={styles.formCard}>
            <View style={styles.formHeaderRow}>
              <View style={styles.formHeaderIcon}>
                <Settings size={18} color={colors.white} />
              </View>
              <Text style={styles.formHeaderTitle}>Withdrawal Configuration</Text>
            </View>

            {/* Minimum threshold */}
            <Text style={styles.fieldLabel}>Minimum Threshold (ل.س) *</Text>
            <Text style={styles.fieldHint}>
              Must be greater than {MIN_THRESHOLD.toLocaleString('en-US')} SYP. Admin will process payment once your balance
              reaches this amount.
            </Text>
            <TextInputArabic
              style={[styles.input, formError && styles.inputError]}
              placeholder={`e.g. 50000 (minimum > ${MIN_THRESHOLD})`}
              value={threshold}
              onChangeText={(v) => {
                setThreshold(v);
                if (formError) setFormError(null);
              }}
              keyboardType="decimal-pad"
              editable={!saving}
            />
            {formError ? (
              <View style={styles.formErrorBox}>
                <Text style={styles.formErrorText}>{formError}</Text>
              </View>
            ) : null}

            {/* Payment method selector */}
            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Payment Method *</Text>
            <View style={styles.methodRow}>
              {PAYMENT_METHODS.map((m) => (
                <TouchableOpacity
                  key={m.value}
                  style={[
                    styles.methodBtn,
                    method === m.value && styles.methodBtnActive,
                  ]}
                  onPress={() => setMethod(m.value)}
                  disabled={saving}
                  activeOpacity={0.7}
                >
                  {m.icon}
                  <Text
                    style={[
                      styles.methodBtnText,
                      method === m.value && styles.methodBtnTextActive,
                    ]}
                  >
                    {m.label}
                  </Text>
                  {method === m.value ? (
                    <View style={styles.methodCheck}>
                      <Check size={12} color={colors.white} />
                    </View>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>

            {/* Account details — dynamic based on method */}
            {method === 'bank' ? (
              <View style={styles.detailsGroup}>
                <Text style={styles.fieldLabel}>Bank Name *</Text>
                <TextInputArabic
                  style={styles.input}
                  placeholder="e.g. بنك سورية الدولي الإسلامي"
                  value={bankName}
                  onChangeText={setBankName}
                  editable={!saving}
                />
                <Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>Account Number *</Text>
                <TextInputArabic
                  style={styles.input}
                  placeholder="رقم الحساب"
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  keyboardType="number-pad"
                  editable={!saving}
                />
                <Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>Account Holder Name *</Text>
                <TextInputArabic
                  style={styles.input}
                  placeholder="اسم صاحب الحساب"
                  value={accountHolder}
                  onChangeText={setAccountHolder}
                  editable={!saving}
                />
              </View>
            ) : (
              <View style={styles.detailsGroup}>
                <Text style={styles.fieldLabel}>
                  {method === 'sham_cash' ? 'شام كاش' : 'سيريتيل كاش'} Phone Number *
                </Text>
                <TextInputArabic
                  style={styles.input}
                  placeholder="09XXXXXXXX"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  editable={!saving}
                />
              </View>
            )}

            {/* Current saved settings preview */}
            {settings ? (
              <View style={styles.currentSettingsBox}>
                <Text style={styles.currentSettingsTitle}>Current Saved Settings</Text>
                <View style={styles.currentRow}>
                  <Text style={styles.currentLabel}>Threshold</Text>
                  <Text style={styles.currentValue}>{fmtMoney(settings.min_threshold)}</Text>
                </View>
                <View style={styles.currentRow}>
                  <Text style={styles.currentLabel}>Method</Text>
                  <Text style={styles.currentValue}>
                    {PAYMENT_METHODS.find(m => m.value === settings.payment_method)?.label ?? settings.payment_method}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={{ marginTop: spacing.lg }}>
              <Button
                title={settings ? 'Update Settings' : 'Save Settings'}
                onPress={handleSave}
                loading={saving}
                fullWidth
              />
            </View>
          </View>

          {/* View payment history */}
          <TouchableOpacity
            style={styles.historyLink}
            onPress={() => router.push('/publisher/withdrawals')}
            activeOpacity={0.7}
          >
            <Wallet size={20} color={colors.primary[600]} />
            <Text style={styles.historyLinkText}>View Payment History</Text>
            <ChevronLeft
              size={18}
              color={colors.primary[600]}
              style={{ transform: [{ rotate: '180deg' }] }}
            />
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.success[50],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.success[200],
  },
  successText: {
    ...typography.bodySmall,
    color: colors.success[700],
    fontWeight: '600',
  },
  inputError: {
    borderColor: colors.error[600],
  },
  formErrorBox: {
    backgroundColor: colors.error[50],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.error[200],
  },
  formErrorText: {
    ...typography.bodySmall,
    color: colors.error[700],
    fontWeight: '600',
    textAlign: 'right',
  },
  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statValue: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '700',
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  // Info box
  infoBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.primary[50],
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary[100],
    alignItems: 'flex-start',
  },
  infoText: {
    ...typography.caption,
    color: colors.primary[700],
    flex: 1,
    lineHeight: 18,
  },
  // Form card
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.md,
  },
  formHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  formHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  formHeaderTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  fieldLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  fieldHint: {
    ...typography.caption,
    color: colors.neutral[500],
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.background,
  },
  // Method selector
  methodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  methodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    position: 'relative',
  },
  methodBtnActive: {
    borderColor: colors.primary[600],
    backgroundColor: colors.primary[50],
  },
  methodBtnText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  methodBtnTextActive: {
    color: colors.primary[700],
    fontWeight: '700',
  },
  methodCheck: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsGroup: {
    gap: 4,
  },
  // Current settings
  currentSettingsBox: {
    backgroundColor: colors.neutral[50],
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  currentSettingsTitle: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  currentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  currentLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  currentValue: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
  },
  // History link
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  historyLinkText: {
    ...typography.body,
    color: colors.primary[600],
    fontWeight: '600',
    flex: 1,
  },
});
