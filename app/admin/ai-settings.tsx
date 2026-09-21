/**
 * إعدادات المساعد الذكي (Groq) — يديرها الأدمن بالكامل من لوحة التحكم.
 * المفتاح يُحفظ في قاعدة البيانات ولا يصل إلى المتصفح/التطبيق إطلاقاً.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Switch,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, Bot, KeyRound, Info, CheckCircle2, Eye, EyeOff } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text, ArabicTextInput as TextInput } from '@/components/ArabicText';
import { Button } from '@/components/Button';
import { useAuth } from '@/lib/AuthContext';
import { playFeedback } from '@/lib/sounds';
import {
  AI_MODELS,
  fetchAIAdminSettings,
  saveAISettings,
  sendAIChat,
  type AIAdminSettings,
} from '@/lib/ai';

export default function AdminAISettingsScreen() {
  const { profile, isAdmin } = useAuth();
  const [settings, setSettings] = useState<AIAdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(AI_MODELS[0].id);
  const [welcome, setWelcome] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');

  const load = useCallback(async () => {
    try {
      const s = await fetchAIAdminSettings();
      setSettings(s);
      setEnabled(s.is_enabled);
      setModel(s.model);
      setWelcome(s.welcome_text ?? '');
      setSystemPrompt(s.system_prompt ?? '');
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذّر تحميل إعدادات المساعد');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAISettings({
        is_enabled: enabled,
        model,
        welcome_text: welcome.trim(),
        system_prompt: systemPrompt.trim(),
        ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
      });
      setApiKey('');
      setSaved(true);
      playFeedback('success');
      await load();
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذّر حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const reply = await sendAIChat([{ role: 'user', content: 'مرحباً، اختبار سريع للاتصال. أجب بكلمة واحدة.' }]);
      playFeedback('success');
      Alert.alert('الاتصال ناجح ✅', reply.slice(0, 200));
    } catch (e: any) {
      playFeedback('error');
      Alert.alert('فشل الاتصال', e?.message || 'تعذّر الوصول إلى المساعد الذكي');
    } finally {
      setTesting(false);
    }
  };

  if (profile && !isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <Header />
        <View style={styles.center}>
          <Text style={styles.muted}>هذه الصفحة مخصّصة للأدمن فقط.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header />
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary[600]} style={{ flex: 1 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 140 }}>
          <View style={styles.introCard}>
            <Bot size={20} color={colors.primary[600]} />
            <Text style={styles.introText}>
              المساعد الذكي يظهر كأيقونة عائمة للزبائن، ويعرف كل منتجات المتجر وأسعارها،
              ويساعدهم في اختيار منتج ضمن ميزانية محدّدة. المفتاح يُخزَّن بأمان في قاعدة البيانات
              ولا يظهر أبداً في التطبيق.
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>تفعيل المساعد الذكي</Text>
                <Text style={styles.hint}>عند الإيقاف تختفي الأيقونة العائمة نهائياً.</Text>
              </View>
              <Switch
                value={enabled}
                onValueChange={setEnabled}
                trackColor={{ false: colors.neutral[200], true: colors.primary[200] }}
                thumbColor={enabled ? colors.primary[600] : colors.neutral[400]}
              />
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.label}>مفتاح Groq API</Text>
              <TouchableOpacity onPress={() => setShowKey(v => !v)} hitSlop={8}>
                {showKey ? <EyeOff size={16} color={colors.textMuted} /> : <Eye size={16} color={colors.textMuted} />}
              </TouchableOpacity>
            </View>
            <View style={styles.keyRow}>
              <KeyRound size={16} color={colors.textMuted} />
              <TextInput
                style={styles.input}
                value={apiKey}
                onChangeText={setApiKey}
                placeholder={settings?.has_key ? `المفتاح محفوظ (${settings.key_hint ?? '••••'}) — اتركه فارغاً للإبقاء عليه` : 'gsk_...'}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                secureTextEntry={!showKey}
              />
            </View>
            <View style={styles.hintRow}>
              <Info size={13} color={colors.textMuted} />
              <Text style={styles.hint}>احصل على المفتاح مجاناً من console.groq.com ← API Keys.</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>النموذج</Text>
            {AI_MODELS.map(m => (
              <TouchableOpacity
                key={m.id}
                style={[styles.modelRow, model === m.id && styles.modelRowActive]}
                onPress={() => setModel(m.id)}
              >
                <Text style={[styles.modelText, model === m.id && { color: colors.primary[700], fontWeight: '700' }]}>
                  {m.label}
                </Text>
                {model === m.id ? <CheckCircle2 size={16} color={colors.primary[600]} /> : null}
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>رسالة الترحيب</Text>
            <TextInput
              style={[styles.input, styles.area]}
              value={welcome}
              onChangeText={setWelcome}
              placeholder="أهلاً بك! أنا مساعدك الذكي، كيف أقدر أساعدك اليوم؟"
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>تعليمات المساعد (System Prompt)</Text>
            <TextInput
              style={[styles.input, styles.area, { minHeight: 140 }]}
              value={systemPrompt}
              onChangeText={setSystemPrompt}
              placeholder="اتركه فارغاً لاستخدام التعليمات الافتراضية الاحترافية."
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.hintRow}>
              <Info size={13} color={colors.textMuted} />
              <Text style={styles.hint}>تُضاف تلقائياً قائمة المنتجات والأسعار إلى هذه التعليمات.</Text>
            </View>
          </View>

          {saved ? (
            <View style={styles.savedCard}>
              <CheckCircle2 size={18} color={colors.success[600]} />
              <Text style={styles.savedText}>تم حفظ إعدادات المساعد الذكي بنجاح.</Text>
            </View>
          ) : null}

          <Button
            title={testing ? 'جاري الاختبار…' : 'اختبار الاتصال بالمساعد'}
            onPress={handleTest}
            loading={testing}
            variant="outline"
            fullWidth
          />
        </ScrollView>
      )}

      <View style={styles.bottomBar}>
        <Button
          title={saving ? 'جاري الحفظ…' : 'حفظ الإعدادات'}
          onPress={handleSave}
          loading={saving}
          disabled={saving || loading}
          fullWidth
          size="lg"
        />
      </View>
    </SafeAreaView>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
        <ChevronLeft size={24} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.title}>المساعد الذكي</Text>
      <View style={{ width: 40 }} />
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
  muted: { ...typography.body, color: colors.textMuted },
  introCard: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    backgroundColor: colors.primary[50], borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md,
  },
  introText: { flex: 1, ...typography.caption, color: colors.primary[700], fontWeight: '600' },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.md, ...shadows.sm,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  label: { ...typography.body, color: colors.text, fontWeight: '700', marginBottom: spacing.xs },
  hint: { ...typography.caption, color: colors.textMuted, flex: 1 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1, backgroundColor: colors.inputBg, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.text,
  },
  area: { minHeight: 90 },
  modelRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xs,
  },
  modelRowActive: { borderColor: colors.primary[600], backgroundColor: colors.primary[50] },
  modelText: { ...typography.caption, color: colors.text, fontWeight: '600' },
  savedCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.success[50], borderWidth: 1, borderColor: colors.success[200],
    borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md,
  },
  savedText: { ...typography.caption, color: colors.success[800], fontWeight: '700' },
  bottomBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: spacing.md, backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
});
