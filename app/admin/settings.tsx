import { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import {
  ChevronLeft,
  Settings as SettingsIcon,
  RotateCcw,
  Info,
  Image as ImageIcon,
  Bot,
  LifeBuoy,
  ChevronRight,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text } from '@/components/ArabicText';
import { Button } from '@/components/Button';
import { useAuth } from '@/lib/AuthContext';
import {
  fetchAppSettings,
  saveAppSettings,
  SETTINGS_LABELS,
  DEFAULT_APP_SETTINGS,
  type AppSettings,
} from '@/lib/settings';
type FormState = Record<keyof AppSettings, string>;

const FIELD_ORDER: (keyof AppSettings)[] = [
  'upfront_percentage',
  'affiliate_percentage',
  'merchant_percentage',
  'shipping_flat_cost',
  'tax_rate',
];

function toForm(settings: AppSettings): FormState {
  return FIELD_ORDER.reduce((acc, key) => {
    acc[key] = String(settings[key]);
    return acc;
  }, {} as FormState);
}

export default function AdminGeneralSettingsScreen() {
  const { profile, isAdmin } = useAuth();
  const [saved, setSaved] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [form, setForm] = useState<FormState>(toForm(DEFAULT_APP_SETTINGS));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const settings = await fetchAppSettings();
    setSaved(settings);
    setForm(toForm(settings));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const setField = (key: keyof AppSettings, value: string) => {
    setForm(prev => ({ ...prev, [key]: value.replace(/[^0-9.]/g, '') }));
  };

  const dirty = FIELD_ORDER.some(key => Number(form[key]) !== saved[key]);

  const handleSave = async () => {
    const patch: Partial<AppSettings> = {};
    for (const key of FIELD_ORDER) {
      const value = Number(form[key]);
      if (!Number.isFinite(value) || value < 0) {
        Alert.alert('قيمة غير صالحة', `الرجاء إدخال رقم صحيح في حقل "${SETTINGS_LABELS[key].label}".`);
        return;
      }
      if (key !== 'shipping_flat_cost' && value > 100) {
        Alert.alert('قيمة غير صالحة', `"${SETTINGS_LABELS[key].label}" يجب أن تكون بين 0 و 100.`);
        return;
      }
      patch[key] = value;
    }

    setSaving(true);
    try {
      const next = await saveAppSettings(patch);
      setSaved(next);
      setForm(toForm(next));
      Alert.alert('تم الحفظ', 'تم تحديث الإعدادات العامة بنجاح، وستُطبَّق على الطلبات الجديدة فوراً.');
    } catch (e: any) {
      Alert.alert('خطأ', e?.message ?? 'تعذّر حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  if (profile && !isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>إعدادات عامة</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <Text style={styles.helper}>هذه الصفحة مخصّصة للأدمن فقط.</Text>
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
        <Text style={styles.title}>إعدادات عامة</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary[600]} style={{ flex: 1 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 140 }}>
          <View style={styles.introCard}>
            <SettingsIcon size={20} color={colors.primary[600]} />
            <Text style={styles.introText}>
              تتحكّم هذه الإعدادات بنسبة الدفعة المقدمة المخصومة من محفظة الزبون، ونسب عمولة
              الأفلييت وأرباح التاجر، وكلفة الشحن بالليرة السورية والضريبة. كل المبالغ بالتطبيق
              بالليرة السورية فقط.
            </Text>
          </View>

          {/* إدارة بنرات الموقع والتطبيق */}
          <TouchableOpacity style={styles.navCard} onPress={() => router.push('/admin/banners')}>
            <View style={styles.navIcon}>
              <ImageIcon size={20} color={colors.primary[600]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.navTitle}>البنرات</Text>
              <Text style={styles.navSub}>تحكّم كامل ببنرات الموقع والتطبيق: إضافة، رفع صور، ترتيب وتفعيل</Text>
            </View>
            <ChevronRight size={20} color={colors.textMuted} />
          </TouchableOpacity>

          {/* المساعد الذكي */}
          <TouchableOpacity style={styles.navCard} onPress={() => router.push('/admin/ai-settings')}>
            <View style={styles.navIcon}>
              <Bot size={20} color={colors.primary[600]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.navTitle}>المساعد الذكي (AI)</Text>
              <Text style={styles.navSub}>مفتاح Groq، النموذج، رسالة الترحيب وتعليمات المساعد</Text>
            </View>
            <ChevronRight size={20} color={colors.textMuted} />
          </TouchableOpacity>

          {/* تذاكر الدعم */}
          <TouchableOpacity style={styles.navCard} onPress={() => router.push('/admin/support')}>
            <View style={styles.navIcon}>
              <LifeBuoy size={20} color={colors.primary[600]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.navTitle}>تذاكر الدعم</Text>
              <Text style={styles.navSub}>استقبال تذاكر الزبائن والرد عليها فوراً</Text>
            </View>
            <ChevronRight size={20} color={colors.textMuted} />
          </TouchableOpacity>

          {FIELD_ORDER.map(key => (
            <View key={key} style={styles.fieldCard}>
              <View style={styles.fieldHeader}>
                <Text style={styles.fieldLabel}>{SETTINGS_LABELS[key].label}</Text>
                <Text style={styles.fieldCurrent}>
                  {`الحالي: ${saved[key]}${SETTINGS_LABELS[key].suffix}`}
                </Text>
              </View>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={form[key]}
                  onChangeText={v => setField(key, v)}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                />
                <Text style={styles.suffix}>{SETTINGS_LABELS[key].suffix}</Text>
              </View>
              <View style={styles.hintRow}>
                <Info size={13} color={colors.textMuted} />
                <Text style={styles.hint}>{SETTINGS_LABELS[key].hint}</Text>
              </View>
            </View>
          ))}

          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>مثال توضيحي على منتج بسعر 100,000 ل.س</Text>
            <PreviewRow
              label="سعر المنتج (ما يدخله التاجر)"
              value={`100,000 ل.س`}
            />
            <PreviewRow
              label="السعر المعروض للعميل"
              value={`100,000 ل.س`}
            />
            <Text style={{ ...typography.caption, color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.sm }}>
              ───────────────────
            </Text>
            <PreviewRow
              label="يدفع الزبون الآن من المحفظة"
              value={`${((Number(form.upfront_percentage) || 0)).toFixed(0)}%`}
            />
            <PreviewRow
              label="المتبقي عند الاستلام"
              value={`${(100 - (Number(form.upfront_percentage) || 0)).toFixed(0)}%`}
            />
            <PreviewRow
              label="عمولة الأفلييت"
              value={`${((Number(form.affiliate_percentage) || 0)).toFixed(0)}%`}
            />
            <PreviewRow
              label="أرباح التاجر"
              value={`${((Number(form.merchant_percentage) || 0)).toFixed(0)}%`}
            />
          </View>

          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => setForm(toForm(saved))}
            disabled={!dirty}
          >
            <RotateCcw size={16} color={dirty ? colors.primary[600] : colors.textMuted} />
            <Text style={[styles.resetText, !dirty && { color: colors.textMuted }]}>
              التراجع عن التعديلات
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      <View style={styles.bottomBar}>
        <Button
          title={saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
          onPress={handleSave}
          loading={saving}
          disabled={saving || !dirty || loading}
          fullWidth
          size="lg"
        />
      </View>
    </SafeAreaView>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.previewRow}>
      <Text style={styles.previewLabel}>{label}</Text>
      <Text style={styles.previewValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.surface,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h4, color: colors.text, fontWeight: '700' },
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  navIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary[50],
  },
  navTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  navSub: { ...typography.caption, color: colors.textMuted },
  helper: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  introCard: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    backgroundColor: colors.primary[50], borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md,
  },
  introText: { flex: 1, ...typography.caption, color: colors.primary[700], fontWeight: '600' },
  fieldCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md, ...shadows.sm,
  },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { ...typography.bodySmall, fontWeight: '700', color: colors.text },
  fieldCurrent: { ...typography.caption, color: colors.textMuted },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, backgroundColor: colors.background,
  },
  input: { flex: 1, paddingVertical: spacing.md, ...typography.body, color: colors.text },
  suffix: { ...typography.body, fontWeight: '700', color: colors.primary[600] },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  hint: { flex: 1, ...typography.caption, color: colors.textMuted },
  previewCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md, ...shadows.sm,
  },
  previewTitle: { ...typography.bodySmall, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  previewLabel: { ...typography.caption, color: colors.textSecondary },
  previewValue: { ...typography.caption, fontWeight: '700', color: colors.text },
  resetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.sm },
  resetText: { ...typography.caption, fontWeight: '700', color: colors.primary[600] },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.md,
  },
});
