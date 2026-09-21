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
  Image,
  Switch,
} from 'react-native';
import { router } from 'expo-router';
import {
  ChevronLeft,
  Image as ImageIcon,
  Plus,
  Trash2,
  Edit3,
  X as XIcon,
  Upload,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Link as LinkIcon,
  Copy,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text, ArabicTextInput as TextInputArabic } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { confirmAction } from '@/lib/confirm';
import { Button } from '@/components/Button';
import { pickImage, uploadToCloudinary } from '@/lib/cloudinary';
import { CategoryPickerModal } from '@/components/CategoryPickerModal';
import { getCategoryPathLabel } from '@/lib/categories';
import type { Category } from '@/lib/supabase';

type Placement =
  | 'home_slider'
  | 'home_secondary'
  | 'category'
  | 'promo'
  | 'search'
  | 'cart'
  | 'reels'
  | 'account'
  | 'app_top';

type BannerRecord = {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string;
  cta_text: string | null;
  cta_link: string | null;
  placement: Placement;
  category_id: string | null;
  sort_order: number;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
};

const PLACEMENTS: { key: Placement; label: string; hint: string }[] = [
  { key: 'home_slider', label: 'سلايدر الرئيسية', hint: 'البنر الكبير المتحرك أعلى الصفحة الرئيسية' },
  { key: 'home_secondary', label: 'بنر ثانوي بالرئيسية', hint: 'بنر إضافي أسفل أقسام الرئيسية' },
  { key: 'category', label: 'صفحات الأقسام', hint: 'يظهر داخل صفحات التصنيفات' },
  { key: 'promo', label: 'عروض وتخفيضات', hint: 'بنرات العروض الترويجية' },
  { key: 'search', label: 'صفحة البحث', hint: 'يظهر أعلى نتائج البحث' },
  { key: 'cart', label: 'سلة المشتريات', hint: 'يظهر داخل صفحة السلة' },
  { key: 'reels', label: 'الريلز', hint: 'يظهر بين مقاطع الريلز' },
  { key: 'account', label: 'صفحة الحساب', hint: 'يظهر في صفحة حسابي' },
  { key: 'app_top', label: 'شريط أعلى التطبيق', hint: 'شريط إعلاني رقيق أعلى كل الصفحات' },
];

const placementLabel = (p: string) => PLACEMENTS.find(x => x.key === p)?.label ?? p;

const emptyForm = {
  title: '',
  subtitle: '',
  imageUrl: '',
  ctaText: '',
  ctaLink: '',
  placement: 'home_slider' as Placement,
  categoryId: null as string | null,
  sortOrder: '0',
  isActive: true,
  startDate: '',
  endDate: '',
};

export default function AdminBannersScreen() {
  const { profile, isAdmin } = useAuth();
  const [banners, setBanners] = useState<BannerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Placement>('all');

  const [formModal, setFormModal] = useState(false);
  const [editTarget, setEditTarget] = useState<BannerRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [form, setForm] = useState({ ...emptyForm });
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  const setField = <K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const load = useCallback(async () => {
    setError(null);
    try {
      const [{ data, error: fetchErr }, categoriesRes] = await Promise.all([
        supabase
          .from('banners')
          .select('*')
          .order('placement', { ascending: true })
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false }),
        supabase.from('categories').select('*').order('sort_order', { ascending: true }),
      ]);
      if (fetchErr) throw fetchErr;
      setBanners((data as BannerRecord[]) ?? []);
      setCategories((categoriesRes.data as Category[]) ?? []);
    } catch (e: any) {
      setError(e.message || 'تعذّر تحميل البنرات');
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

  const openCreate = () => {
    setEditTarget(null);
    setForm({ ...emptyForm, placement: filter === 'all' ? 'home_slider' : filter });
    setFormModal(true);
  };

  const openEdit = (b: BannerRecord) => {
    setEditTarget(b);
    setForm({
      title: b.title ?? '',
      subtitle: b.subtitle ?? '',
      imageUrl: b.image_url ?? '',
      ctaText: b.cta_text ?? '',
      ctaLink: b.cta_link ?? '',
      placement: b.placement,
      categoryId: b.category_id ?? null,
      sortOrder: String(b.sort_order ?? 0),
      isActive: b.is_active,
      startDate: b.start_date ? b.start_date.slice(0, 10) : '',
      endDate: b.end_date ? b.end_date.slice(0, 10) : '',
    });
    setFormModal(true);
  };

  const handlePickAndUpload = async () => {
    try {
      const uri = await pickImage();
      if (!uri) return;
      setUploading(true);
      setUploadPct(0);
      const res = await uploadToCloudinary(uri, 'image', p => setUploadPct(p));
      setField('imageUrl', res.secure_url);
    } catch (e: any) {
      Alert.alert('تعذّر رفع الصورة', e?.message ?? 'حدث خطأ أثناء رفع صورة البنر.');
    } finally {
      setUploading(false);
    }
  };

  const parseDate = (value: string) => {
    const v = value.trim();
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      Alert.alert('بيانات ناقصة', 'الرجاء إدخال عنوان البنر.');
      return;
    }
    if (!form.imageUrl.trim()) {
      Alert.alert('بيانات ناقصة', 'الرجاء رفع صورة البنر أو إدخال رابط صورة.');
      return;
    }

    const payload: Record<string, any> = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      image_url: form.imageUrl.trim(),
      cta_text: form.ctaText.trim() || null,
      cta_link: form.ctaLink.trim() || null,
      placement: form.placement,
      category_id: form.categoryId,
      sort_order: Number(form.sortOrder) || 0,
      is_active: form.isActive,
      start_date: parseDate(form.startDate),
      end_date: parseDate(form.endDate),
    };

    setSaving(true);
    try {
      if (editTarget) {
        const { error: upErr } = await supabase.from('banners').update(payload).eq('id', editTarget.id);
        if (upErr) throw upErr;
      } else {
        const { error: insErr } = await supabase.from('banners').insert(payload);
        if (insErr) throw insErr;
      }
      setFormModal(false);
      setEditTarget(null);
      setForm({ ...emptyForm });
      await load();
    } catch (e: any) {
      Alert.alert('خطأ', e?.message ?? 'تعذّر حفظ البنر');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (b: BannerRecord) => {
    const { error: upErr } = await supabase
      .from('banners')
      .update({ is_active: !b.is_active })
      .eq('id', b.id);
    if (upErr) {
      Alert.alert('خطأ', upErr.message);
      return;
    }
    setBanners(prev => prev.map(x => (x.id === b.id ? { ...x, is_active: !x.is_active } : x)));
  };

  const move = async (b: BannerRecord, dir: -1 | 1) => {
    const next = Math.max(0, (b.sort_order ?? 0) + dir);
    const { error: upErr } = await supabase.from('banners').update({ sort_order: next }).eq('id', b.id);
    if (upErr) {
      Alert.alert('خطأ', upErr.message);
      return;
    }
    await load();
  };

  const duplicate = async (b: BannerRecord) => {
    const { error: insErr } = await supabase.from('banners').insert({
      title: `${b.title} (نسخة)`,
      subtitle: b.subtitle,
      image_url: b.image_url,
      cta_text: b.cta_text,
      cta_link: b.cta_link,
      placement: b.placement,
      sort_order: (b.sort_order ?? 0) + 1,
      is_active: false,
      start_date: b.start_date,
      end_date: b.end_date,
    });
    if (insErr) {
      Alert.alert('خطأ', insErr.message);
      return;
    }
    await load();
  };

  const remove = (b: BannerRecord) => {
    confirmAction(
      {
        title: 'حذف البنر',
        message: `سيتم حذف البنر «${b.title}» نهائياً. هل أنت متأكد؟`,
        confirmText: 'حذف',
        cancelText: 'إلغاء',
        destructive: true,
      },
      async () => {
        const { error: delErr } = await supabase.from('banners').delete().eq('id', b.id);
        if (delErr) {
          Alert.alert('خطأ', delErr.message);
          return;
        }
        setBanners(prev => prev.filter(x => x.id !== b.id));
      }
    );
  };

  if (profile && !isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="البنرات" />
        <View style={styles.center}>
          <Text style={styles.helper}>هذه الصفحة مخصّصة للأدمن فقط.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const visible = filter === 'all' ? banners : banners.filter(b => b.placement === filter);
  const activeCount = banners.filter(b => b.is_active).length;

  return (
    <SafeAreaView style={styles.container}>
      <Header title="البنرات" onAdd={openCreate} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.introCard}>
            <ImageIcon size={20} color={colors.primary[600]} />
            <Text style={styles.introText}>
              تحكّم كامل ببنرات الموقع والتطبيق: أضف، ارفع صورة، عدّل، رتّب، فعّل أو أوقف، وحدّد مكان
              الظهور وتاريخ البداية والنهاية لكل بنر.
            </Text>
          </View>

          <View style={styles.statsRow}>
            <StatBox label="إجمالي البنرات" value={String(banners.length)} />
            <StatBox label="بنرات مفعّلة" value={String(activeCount)} />
            <StatBox label="أماكن الظهور" value={String(PLACEMENTS.length)} />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
            <Chip label="الكل" active={filter === 'all'} onPress={() => setFilter('all')} />
            {PLACEMENTS.map(p => (
              <Chip
                key={p.key}
                label={p.label}
                active={filter === p.key}
                onPress={() => setFilter(p.key)}
              />
            ))}
          </ScrollView>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {visible.length === 0 ? (
            <View style={styles.emptyCard}>
              <ImageIcon size={40} color={colors.neutral[300]} />
              <Text style={styles.emptyTitle}>لا توجد بنرات هنا</Text>
              <Text style={styles.emptyText}>اضغط زر الإضافة بالأعلى لإنشاء بنر جديد.</Text>
            </View>
          ) : (
            visible.map(b => (
              <View key={b.id} style={styles.card}>
                <Image source={{ uri: b.image_url }} style={styles.cardImage} resizeMode="cover" />
                <View style={styles.cardBody}>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{b.title}</Text>
                    <View style={[styles.badge, b.is_active ? styles.badgeOn : styles.badgeOff]}>
                      <Text style={[styles.badgeText, { color: b.is_active ? colors.success[700] : colors.neutral[600] }]}>
                        {b.is_active ? 'مفعّل' : 'موقوف'}
                      </Text>
                    </View>
                  </View>
                  {b.subtitle ? <Text style={styles.cardSub} numberOfLines={2}>{b.subtitle}</Text> : null}
                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>{placementLabel(b.placement)}</Text>
                    <Text style={styles.metaDot}>•</Text>
                    <Text style={styles.metaText}>{`الترتيب: ${b.sort_order}`}</Text>
                  </View>
                  {b.cta_link ? (
                    <View style={styles.metaRow}>
                      <LinkIcon size={12} color={colors.textMuted} />
                      <Text style={styles.metaText} numberOfLines={1}>{b.cta_link}</Text>
                    </View>
                  ) : null}
                  {b.category_id ? (
                    <View style={styles.metaRow}>
                      <LinkIcon size={12} color={colors.primary[500]} />
                      <Text style={[styles.metaText, { color: colors.primary[600], fontWeight: '700' }]} numberOfLines={1}>
                        {`قسم: ${getCategoryPathLabel(categories, b.category_id) || 'غير معروف'}`}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.actionsRow}>
                    <IconBtn onPress={() => openEdit(b)}>
                      <Edit3 size={17} color={colors.primary[600]} />
                    </IconBtn>
                    <IconBtn onPress={() => toggleActive(b)}>
                      {b.is_active ? (
                        <EyeOff size={17} color={colors.warning[600]} />
                      ) : (
                        <Eye size={17} color={colors.success[600]} />
                      )}
                    </IconBtn>
                    <IconBtn onPress={() => move(b, -1)}>
                      <ArrowUp size={17} color={colors.neutral[600]} />
                    </IconBtn>
                    <IconBtn onPress={() => move(b, 1)}>
                      <ArrowDown size={17} color={colors.neutral[600]} />
                    </IconBtn>
                    <IconBtn onPress={() => duplicate(b)}>
                      <Copy size={17} color={colors.neutral[600]} />
                    </IconBtn>
                    <IconBtn onPress={() => remove(b)}>
                      <Trash2 size={17} color={colors.error[600]} />
                    </IconBtn>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={formModal} animationType="slide" transparent onRequestClose={() => setFormModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editTarget ? 'تعديل بنر' : 'بنر جديد'}</Text>
              <TouchableOpacity style={styles.iconBtn} onPress={() => setFormModal(false)}>
                <XIcon size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}>
              <Text style={styles.fieldLabel}>صورة البنر *</Text>
              {form.imageUrl ? (
                <Image source={{ uri: form.imageUrl }} style={styles.preview} resizeMode="cover" />
              ) : null}
              <TouchableOpacity
                style={styles.uploadBtn}
                onPress={handlePickAndUpload}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <ActivityIndicator size="small" color={colors.primary[600]} />
                    <Text style={styles.uploadText}>{`جاري الرفع… ${uploadPct}%`}</Text>
                  </>
                ) : (
                  <>
                    <Upload size={18} color={colors.primary[600]} />
                    <Text style={styles.uploadText}>
                      {form.imageUrl ? 'تغيير الصورة' : 'رفع صورة من الجهاز'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              <TextInputArabic
                style={styles.input}
                value={form.imageUrl}
                onChangeText={v => setField('imageUrl', v)}
                placeholder="أو الصق رابط صورة (https://…)"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
              />

              <Text style={styles.fieldLabel}>العنوان *</Text>
              <TextInputArabic
                style={styles.input}
                value={form.title}
                onChangeText={v => setField('title', v)}
                placeholder="مثال: تخفيضات الموسم"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.fieldLabel}>النص الفرعي</Text>
              <TextInputArabic
                style={[styles.input, styles.inputMultiline]}
                value={form.subtitle}
                onChangeText={v => setField('subtitle', v)}
                placeholder="وصف قصير يظهر تحت العنوان"
                placeholderTextColor={colors.textMuted}
                multiline
              />

              <Text style={styles.fieldLabel}>مكان الظهور</Text>
              <View style={styles.optionsWrap}>
                {PLACEMENTS.map(p => (
                  <TouchableOpacity
                    key={p.key}
                    style={[styles.option, form.placement === p.key && styles.optionActive]}
                    onPress={() => setField('placement', p.key)}
                  >
                    <Text
                      style={[styles.optionText, form.placement === p.key && styles.optionTextActive]}
                    >
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.hint}>
                {PLACEMENTS.find(p => p.key === form.placement)?.hint ?? ''}
              </Text>

              <Text style={styles.fieldLabel}>ربط بقسم / تصنيف (اختياري)</Text>
              <TouchableOpacity style={styles.selectBox} onPress={() => setCategoryPickerOpen(true)}>
                <Text style={styles.selectBoxText}>
                  {form.categoryId ? getCategoryPathLabel(categories, form.categoryId) : 'بنر عام (يظهر في كل مكان)'}
                </Text>
                <LinkIcon size={16} color={colors.textMuted} />
              </TouchableOpacity>
              <Text style={styles.hint}>
                اربط هذا البنر بقسم معيّن (مثل «إلكترونيات») ليظهر فقط عند تصفح ذلك القسم، أو
                اتركه بدون ربط ليظهر بشكل عام في كل مكان مطابق لـ«مكان الظهور» أعلاه.
              </Text>

              <Text style={styles.fieldLabel}>نص الزر</Text>
              <TextInputArabic
                style={styles.input}
                value={form.ctaText}
                onChangeText={v => setField('ctaText', v)}
                placeholder="مثال: تسوّق الآن"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.fieldLabel}>رابط الزر</Text>
              <TextInputArabic
                style={styles.input}
                value={form.ctaLink}
                onChangeText={v => setField('ctaLink', v)}
                placeholder="/category/electronics أو https://…"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
              />

              <Text style={styles.fieldLabel}>الترتيب</Text>
              <TextInputArabic
                style={styles.input}
                value={form.sortOrder}
                onChangeText={v => setField('sortOrder', v.replace(/[^0-9]/g, ''))}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
              />

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>تاريخ البداية</Text>
                  <TextInputArabic
                    style={styles.input}
                    value={form.startDate}
                    onChangeText={v => setField('startDate', v)}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>تاريخ النهاية</Text>
                  <TextInputArabic
                    style={styles.input}
                    value={form.endDate}
                    onChangeText={v => setField('endDate', v)}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.fieldLabel}>مفعّل</Text>
                <Switch
                  value={form.isActive}
                  onValueChange={v => setField('isActive', v)}
                  trackColor={{ true: colors.primary[300], false: colors.neutral[200] }}
                  thumbColor={form.isActive ? colors.primary[600] : colors.neutral[400]}
                />
              </View>

              <Button
                title={saving ? 'جاري الحفظ...' : editTarget ? 'حفظ التعديلات' : 'إضافة البنر'}
                onPress={handleSave}
                loading={saving}
                disabled={saving || uploading}
                fullWidth
                size="lg"
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <CategoryPickerModal
        visible={categoryPickerOpen}
        categories={categories}
        value={form.categoryId}
        onSelect={(id) => setField('categoryId', id)}
        onClose={() => setCategoryPickerOpen(false)}
        title="اربط البنر بقسم / تصنيف"
        noneLabel="بنر عام (بدون ربط)"
      />

      {!loading ? (
        <TouchableOpacity style={styles.fab} onPress={openCreate} activeOpacity={0.85}>
          <Plus size={24} color={colors.white} />
        </TouchableOpacity>
      ) : null}
    </SafeAreaView>
  );
}

function Header({ title, onAdd }: { title: string; onAdd?: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
        <ChevronLeft size={24} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.title}>{title}</Text>
      {onAdd ? (
        <TouchableOpacity style={styles.iconBtn} onPress={onAdd}>
          <Plus size={22} color={colors.primary[600]} />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 40 }} />
      )}
    </View>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function IconBtn({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.7}>
      {children}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h4, color: colors.text, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  helper: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  errorText: { ...typography.caption, color: colors.error[600], marginBottom: spacing.sm },

  introCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.primary[50],
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  introText: { ...typography.caption, color: colors.primary[800], flex: 1, lineHeight: 20 },

  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    ...shadows.sm,
  },
  statValue: { ...typography.h4, color: colors.text, fontWeight: '700' },
  statLabel: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },

  chipsRow: { marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginEnd: spacing.xs,
  },
  chipActive: { backgroundColor: colors.primary[600], borderColor: colors.primary[600] },
  chipText: { ...typography.caption, color: colors.text, fontWeight: '600' },
  chipTextActive: { color: colors.white },

  emptyCard: {
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    ...shadows.sm,
  },
  emptyTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  emptyText: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  cardImage: { width: '100%', height: 140, backgroundColor: colors.neutral[100] },
  cardBody: { padding: spacing.md, gap: spacing.xs },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { ...typography.body, color: colors.text, fontWeight: '700', flex: 1 },
  cardSub: { ...typography.caption, color: colors.textMuted },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  badgeOn: { backgroundColor: colors.success[50] },
  badgeOff: { backgroundColor: colors.neutral[100] },
  badgeText: { ...typography.caption, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { ...typography.caption, color: colors.textMuted },
  metaDot: { ...typography.caption, color: colors.neutral[300] },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral[50],
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '92%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { ...typography.h4, color: colors.text, fontWeight: '700' },

  fieldLabel: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '700',
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    backgroundColor: colors.background,
  },
  inputMultiline: { minHeight: 76, textAlignVertical: 'top' },
  row2: { flexDirection: 'row', gap: spacing.sm },
  hint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  selectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  },
  selectBoxText: { ...typography.body, color: colors.text, flex: 1 },
  preview: {
    width: '100%',
    height: 150,
    borderRadius: radius.md,
    backgroundColor: colors.neutral[100],
    marginBottom: spacing.sm,
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary[300],
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.primary[50],
  },
  uploadText: { ...typography.caption, color: colors.primary[700], fontWeight: '700' },
  optionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  option: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  optionActive: { backgroundColor: colors.primary[600], borderColor: colors.primary[600] },
  optionText: { ...typography.caption, color: colors.text, fontWeight: '600' },
  optionTextActive: { color: colors.white },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: spacing.md,
  },

  fab: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary[600],
    ...shadows.md,
  },
});
