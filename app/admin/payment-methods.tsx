import { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import {
  ChevronLeft,
  Shield,
  CreditCard,
  Smartphone,
  Building2,
  Plus,
  Trash2,
  Check,
  X as XIcon,
  Edit3,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text, ArabicTextInput as TextInputArabic } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { confirmAction } from '@/lib/confirm';
import { Button } from '@/components/Button';

type MethodType = 'mobile_wallet' | 'bank' | 'transfer' | 'cash' | 'other';

type PaymentMethodRecord = {
  id: string;
  name: string;
  type: MethodType;
  provider: string;
  instructions: string | null;
  account_name: string | null;
  account_number: string | null;
  extra_info: string | null;
  logo_url: string | null;
  min_amount: number | null;
  max_amount: number | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

const TYPE_OPTIONS: { key: MethodType; label: string }[] = [
  { key: 'mobile_wallet', label: 'محفظة إلكترونية' },
  { key: 'bank', label: 'حساب بنكي' },
  { key: 'transfer', label: 'حوالة' },
  { key: 'cash', label: 'نقداً' },
  { key: 'other', label: 'أخرى' },
];

const TYPE_ICONS: Record<string, React.ReactNode> = {
  mobile_wallet: <Smartphone size={20} color={colors.primary[600]} />,
  bank: <Building2 size={20} color={colors.primary[600]} />,
  transfer: <CreditCard size={20} color={colors.primary[600]} />,
  cash: <CreditCard size={20} color={colors.primary[600]} />,
  other: <CreditCard size={20} color={colors.primary[600]} />,
};

export default function AdminPaymentMethodsScreen() {
  const { user, isAdmin } = useAuth();
  const [methods, setMethods] = useState<PaymentMethodRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form modal
  const [formModal, setFormModal] = useState(false);
  const [editTarget, setEditTarget] = useState<PaymentMethodRecord | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [type, setType] = useState<MethodType>('mobile_wallet');
  const [provider, setProvider] = useState('');
  const [instructions, setInstructions] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [extraInfo, setExtraInfo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [sortOrder, setSortOrder] = useState('0');

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('payment_methods')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;
      setMethods((data as PaymentMethodRecord[]) ?? []);
    } catch (e: any) {
      setError(e.message || 'Failed to load payment methods');
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openAdd = () => {
    setEditTarget(null);
    setName('');
    setType('mobile_wallet');
    setProvider('');
    setInstructions('');
    setAccountName('');
    setAccountNumber('');
    setExtraInfo('');
    setMinAmount('');
    setMaxAmount('');
    setSortOrder(String(methods.length + 1));
    setFormModal(true);
  };

  const openEdit = (m: PaymentMethodRecord) => {
    setEditTarget(m);
    setName(m.name);
    setType(m.type);
    setProvider(m.provider);
    setInstructions(m.instructions ?? '');
    setAccountName(m.account_name ?? '');
    setAccountNumber(m.account_number ?? '');
    setExtraInfo(m.extra_info ?? '');
    setMinAmount(m.min_amount != null ? String(m.min_amount) : '');
    setMaxAmount(m.max_amount != null ? String(m.max_amount) : '');
    setSortOrder(String(m.sort_order ?? 0));
    setFormModal(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('حقول ناقصة', 'اسم طريقة الدفع مطلوب.');
      return;
    }
    if (!accountNumber.trim()) {
      Alert.alert('حقول ناقصة', 'عنوان الدفع (رقم الحساب / المحفظة) مطلوب.');
      return;
    }
    const parsedMin = minAmount.trim() ? Number(minAmount.replace(',', '.')) : null;
    const parsedMax = maxAmount.trim() ? Number(maxAmount.replace(',', '.')) : null;
    if ((parsedMin != null && Number.isNaN(parsedMin)) || (parsedMax != null && Number.isNaN(parsedMax))) {
      Alert.alert('قيمة غير صحيحة', 'الحد الأدنى والحد الأعلى يجب أن يكونا أرقاماً.');
      return;
    }
    const payload = {
      name: name.trim(),
      type,
      provider: provider.trim(),
      instructions: instructions.trim() || null,
      account_name: accountName.trim() || null,
      account_number: accountNumber.trim(),
      extra_info: extraInfo.trim() || null,
      currency: 'SYP',
      min_amount: parsedMin,
      max_amount: parsedMax,
      sort_order: Number(sortOrder) || 0,
    };
    setSaving(true);
    try {
      if (editTarget) {
        const { error: updateErr } = await supabase
          .from('payment_methods')
          .update(payload)
          .eq('id', editTarget.id);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase
          .from('payment_methods')
          .insert({ ...payload, is_active: true });
        if (insertErr) throw insertErr;
      }
      setFormModal(false);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save payment method');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (m: PaymentMethodRecord) => {
    try {
      const { error: updateErr } = await supabase
        .from('payment_methods')
        .update({ is_active: !m.is_active })
        .eq('id', m.id);
      if (updateErr) throw updateErr;
      setMethods((prev) =>
        prev.map((x) => (x.id === m.id ? { ...x, is_active: !m.is_active } : x))
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleDelete = (m: PaymentMethodRecord) => {
    confirmAction(
      {
        title: 'Delete Payment Method',
        message: `Are you sure you want to delete "${m.name}"? This cannot be undone.`,
      },
      async () => {
        try {
          const { error: deleteErr } = await supabase
            .from('payment_methods')
            .delete()
            .eq('id', m.id);
          if (deleteErr) throw deleteErr;
          setMethods((prev) => prev.filter((x) => x.id !== m.id));
        } catch (e: any) {
          Alert.alert('Error', e.message);
        }
      }
    );
  };

  // ── Access guard ──────────────────────────────────────────────
  if (!user || !isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Payment Methods</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.accessGuard}>
          <Shield size={64} color={colors.neutral[300]} />
          <Text style={styles.accessTitle}>Admin Access Required</Text>
          <Text style={styles.accessMsg}>
            You need administrator privileges to manage payment methods.
          </Text>
          <View style={{ marginTop: spacing.lg, width: '100%' }}>
            <Button title="Back" onPress={() => router.back()} fullWidth />
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
          <Text style={styles.title}>Payment Methods</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={styles.loadingText}>Loading payment methods…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Payment Methods</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Plus size={20} color={colors.primary[600]} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.infoBox}>
          <CreditCard size={16} color={colors.primary[600]} />
          <Text style={styles.infoText}>
أضف طرق شحن المحفظة التي تظهر للعملاء (شام كاش، سيرياتيل كاش، بنك بيمو، حوالة…) مع تعليمات
            الدفع وعنوان الدفع لكل طريقة. الطرق النشطة فقط تظهر للعملاء في صفحة المحفظة.
          </Text>
        </View>

        {methods.length === 0 ? (
          <View style={styles.emptyState}>
            <CreditCard size={56} color={colors.neutral[300]} />
            <Text style={styles.emptyTitle}>No payment methods yet</Text>
            <Text style={styles.emptyMsg}>
              Add payment methods to document the options available to publishers.
            </Text>
            <View style={{ marginTop: spacing.lg, width: '100%' }}>
              <Button title="Add Payment Method" onPress={openAdd} fullWidth />
            </View>
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {methods.map((m) => (
              <View key={m.id} style={[styles.methodCard, !m.is_active && styles.methodCardInactive]}>
                <View style={styles.methodTop}>
                  <View style={styles.methodIconWrap}>
                    {TYPE_ICONS[m.type] ?? <CreditCard size={20} color={colors.primary[600]} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.methodName}>{m.name}</Text>
                    <Text style={styles.methodProvider}>{m.provider}</Text>
                  </View>
                  <View style={[styles.activeTag, { backgroundColor: m.is_active ? colors.success[100] : colors.neutral[100] }]}>
                    <Text style={[styles.activeTagText, { color: m.is_active ? colors.success[700] : colors.neutral[500] }]}>
                      {m.is_active ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                </View>

                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>
                    {TYPE_OPTIONS.find((o) => o.key === m.type)?.label ?? m.type}
                  </Text>
                </View>

                {m.account_number ? (
                  <Text style={styles.methodProvider}>عنوان الدفع: {m.account_number}</Text>
                ) : null}
                {m.account_name ? (
                  <Text style={styles.methodProvider}>باسم: {m.account_name}</Text>
                ) : null}

                {m.instructions ? (
                  <Text style={styles.methodInstructions}>{m.instructions}</Text>
                ) : null}

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => openEdit(m)}
                  >
                    <Edit3 size={15} color={colors.primary[600]} />
                    <Text style={[styles.actionBtnText, { color: colors.primary[600] }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleToggleActive(m)}
                  >
                    {m.is_active ? (
                      <>
                        <XIcon size={15} color={colors.warning[600]} />
                        <Text style={[styles.actionBtnText, { color: colors.warning[600] }]}>Deactivate</Text>
                      </>
                    ) : (
                      <>
                        <Check size={15} color={colors.success[600]} />
                        <Text style={[styles.actionBtnText, { color: colors.success[600] }]}>Activate</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleDelete(m)}
                  >
                    <Trash2 size={15} color={colors.error[600]} />
                    <Text style={[styles.actionBtnText, { color: colors.error[600] }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Add / Edit modal */}
      <Modal
        visible={formModal}
        transparent
        animationType="slide"
        onRequestClose={() => !saving && setFormModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editTarget ? 'Edit Payment Method' : 'Add Payment Method'}
              </Text>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => !saving && setFormModal(false)}
              >
                <XIcon size={20} color={colors.neutral[500]} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Name *</Text>
              <TextInputArabic
                style={styles.input}
                placeholder="e.g. شام كاش"
                value={name}
                onChangeText={setName}
                editable={!saving}
              />

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Type *</Text>
              <View style={styles.typeRow}>
                {TYPE_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.typeBtn, type === opt.key && styles.typeBtnActive]}
                    onPress={() => setType(opt.key)}
                    disabled={saving}
                  >
                    {opt.key === 'bank' ? (
                      <Building2 size={16} color={type === opt.key ? colors.primary[700] : colors.textSecondary} />
                    ) : opt.key === 'mobile_wallet' ? (
                      <Smartphone size={16} color={type === opt.key ? colors.primary[700] : colors.textSecondary} />
                    ) : (
                      <CreditCard size={16} color={type === opt.key ? colors.primary[700] : colors.textSecondary} />
                    )}
                    <Text style={[styles.typeBtnText, type === opt.key && styles.typeBtnTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Provider / Display Name *</Text>
              <TextInputArabic
                style={styles.input}
                placeholder="e.g. SyriaTel Cash, بنك سورية"
                value={provider}
                onChangeText={setProvider}
                editable={!saving}
              />

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Instructions (Optional)</Text>
              <TextInputArabic
                style={[styles.input, styles.textArea]}
                placeholder="Any instructions for publishers using this method…"
                value={instructions}
                onChangeText={setInstructions}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                editable={!saving}
              />

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>عنوان الدفع (رقم الحساب / المحفظة) *</Text>
              <TextInputArabic
                style={styles.input}
                placeholder="مثال: 0999123456 أو SY00 0000 0000"
                value={accountNumber}
                onChangeText={setAccountNumber}
                editable={!saving}
              />

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>اسم صاحب الحساب (اختياري)</Text>
              <TextInputArabic
                style={styles.input}
                placeholder="مثال: إدارة المتجر"
                value={accountName}
                onChangeText={setAccountName}
                editable={!saving}
              />

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>معلومات إضافية (اختياري)</Text>
              <TextInputArabic
                style={styles.input}
                placeholder="مثال: يرجى ذكر رقم هاتفك في ملاحظة التحويل"
                value={extraInfo}
                onChangeText={setExtraInfo}
                editable={!saving}
              />

              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>الحد الأدنى (اختياري)</Text>
                  <TextInputArabic
                    style={styles.input}
                    placeholder="0"
                    value={minAmount}
                    onChangeText={setMinAmount}
                    keyboardType="decimal-pad"
                    editable={!saving}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>الحد الأعلى (اختياري)</Text>
                  <TextInputArabic
                    style={styles.input}
                    placeholder="0"
                    value={maxAmount}
                    onChangeText={setMaxAmount}
                    keyboardType="decimal-pad"
                    editable={!saving}
                  />
                </View>
              </View>

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>ترتيب العرض</Text>
              <TextInputArabic
                style={styles.input}
                placeholder="1"
                value={sortOrder}
                onChangeText={setSortOrder}
                keyboardType="number-pad"
                editable={!saving}
              />

              <View style={styles.modalActions}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Cancel"
                    onPress={() => setFormModal(false)}
                    variant="outline"
                    disabled={saving}
                    fullWidth
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title={editTarget ? 'Save Changes' : 'Add Method'}
                    onPress={handleSave}
                    loading={saving}
                    fullWidth
                  />
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary[50],
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
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.h4,
    color: colors.text,
  },
  emptyMsg: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  // Method card
  methodCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  methodCardInactive: {
    opacity: 0.6,
  },
  methodTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  methodIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  methodProvider: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  activeTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  activeTagText: {
    ...typography.caption,
    fontWeight: '600',
  },
  typeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.neutral[100],
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginTop: spacing.sm,
  },
  typeBadgeText: {
    ...typography.caption,
    color: colors.neutral[600],
    fontWeight: '500',
  },
  methodInstructions: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  actionBtnText: {
    ...typography.caption,
    fontWeight: '600',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    maxHeight: '90%',
    ...shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  modalTitle: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '700',
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral[100],
  },
  fieldLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
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
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  typeBtnActive: {
    borderColor: colors.primary[600],
    backgroundColor: colors.primary[50],
  },
  typeBtnText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  typeBtnTextActive: {
    color: colors.primary[700],
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
});
