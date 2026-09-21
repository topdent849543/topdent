import { useState, useEffect, useCallback, useMemo } from 'react';
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
  Layers,
  Plus,
  Trash2,
  Edit3,
  X as XIcon,
  Upload,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  FolderTree,
  ChevronDown,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text, ArabicTextInput as TextInputArabic } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { confirmAction } from '@/lib/confirm';
import { Button } from '@/components/Button';
import { pickImage, uploadToCloudinary } from '@/lib/cloudinary';

type CategoryRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

const emptyForm = {
  name: '',
  slug: '',
  slugTouched: false,
  description: '',
  imageUrl: '',
  parentId: null as string | null,
  sortOrder: '0',
  isActive: true,
};

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

export default function AdminCategoriesScreen() {
  const { profile, isAdmin } = useAuth();
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'top' | 'sub'>('all');

  const [formModal, setFormModal] = useState(false);
  const [editTarget, setEditTarget] = useState<CategoryRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [form, setForm] = useState({ ...emptyForm });
  const [parentPickerOpen, setParentPickerOpen] = useState(false);

  const setField = <K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (fetchErr) throw fetchErr;
      setCategories((data as CategoryRecord[]) ?? []);
    } catch (e: any) {
      setError(e.message || 'تعذّر تحميل التصنيفات');
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

  const nameById = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach(c => { map[c.id] = c.name; });
    return map;
  }, [categories]);

  const parentOptions = useMemo(
    () => categories.filter(c => !editTarget || c.id !== editTarget.id),
    [categories, editTarget]
  );

  const openCreate = (parentId: string | null = null) => {
    setEditTarget(null);
    setForm({ ...emptyForm, parentId });
    setFormModal(true);
  };

  const openEdit = (c: CategoryRecord) => {
    setEditTarget(c);
    setForm({
      name: c.name ?? '',
      slug: c.slug ?? '',
      slugTouched: true,
      description: c.description ?? '',
      imageUrl: c.image_url ?? '',
      parentId: c.parent_id,
      sortOrder: String(c.sort_order ?? 0),
      isActive: c.is_active,
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
      Alert.alert('تعذّر رفع الصورة', e?.message ?? 'حدث خطأ أثناء رفع أيقونة التصنيف.');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      Alert.alert('بيانات ناقصة', 'الرجاء إدخال اسم التصنيف.');
      return;
    }
    const finalSlug = slugify(form.slug || trimmedName);
    if (!finalSlug) {
      Alert.alert('بيانات ناقصة', 'تعذّر إنشاء رابط (slug) صالح لهذا الاسم، الرجاء إدخال رابط يدوياً.');
      return;
    }
    if (form.parentId && form.parentId === editTarget?.id) {
      Alert.alert('خطأ', 'لا يمكن اختيار نفس التصنيف كتصنيف أب.');
      return;
    }

    const payload: Record<string, any> = {
      name: trimmedName,
      slug: finalSlug,
      description: form.description.trim() || null,
      image_url: form.imageUrl.trim() || null,
      parent_id: form.parentId,
      sort_order: Number(form.sortOrder) || 0,
      is_active: form.isActive,
    };

    setSaving(true);
    try {
      if (editTarget) {
        const { error: upErr } = await supabase.from('categories').update(payload).eq('id', editTarget.id);
        if (upErr) throw upErr;
      } else {
        const { error: insErr } = await supabase.from('categories').insert(payload);
        if (insErr) throw insErr;
      }
      setFormModal(false);
      setEditTarget(null);
      setForm({ ...emptyForm });
      await load();
    } catch (e: any) {
      if (e?.code === '23505') {
        Alert.alert('خطأ', 'يوجد تصنيف آخر بنفس الرابط (slug)، الرجاء اختيار رابط مختلف.');
      } else {
        Alert.alert('خطأ', e?.message ?? 'تعذّر حفظ التصنيف');
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: CategoryRecord) => {
    const { error: upErr } = await supabase
      .from('categories')
      .update({ is_active: !c.is_active })
      .eq('id', c.id);
    if (upErr) {
      Alert.alert('خطأ', upErr.message);
      return;
    }
    setCategories(prev => prev.map(x => (x.id === c.id ? { ...x, is_active: !x.is_active } : x)));
  };

  const move = async (c: CategoryRecord, dir: -1 | 1) => {
    const next = Math.max(0, (c.sort_order ?? 0) + dir);
    const { error: upErr } = await supabase.from('categories').update({ sort_order: next }).eq('id', c.id);
    if (upErr) {
      Alert.alert('خطأ', upErr.message);
      return;
    }
    await load();
  };

  const remove = (c: CategoryRecord) => {
    const hasChildren = categories.some(x => x.parent_id === c.id);
    confirmAction(
      {
        title: 'حذف التصنيف',
        message: hasChildren
          ? `تصنيف «${c.name}» يحتوي على تصنيفات فرعية، سيتم فك ارتباطها به. هل تريد المتابعة وحذف التصنيف نهائياً؟`
          : `سيتم حذف تصنيف «${c.name}» نهائياً. هل أنت متأكد؟`,
        confirmText: 'حذف',
        cancelText: 'إلغاء',
        destructive: true,
      },
      async () => {
        const { error: delErr } = await supabase.from('categories').delete().eq('id', c.id);
        if (delErr) {
          Alert.alert('خطأ', delErr.message || 'تعذّر حذف التصنيف، تأكد من عدم ارتباط منتجات به.');
          return;
        }
        await load();
      }
    );
  };

  if (profile && !isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="التصنيفات" />
        <View style={styles.center}>
          <Text style={styles.helper}>هذه الصفحة مخصّصة للأدمن فقط.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const topLevel = categories.filter(c => !c.parent_id);
  const visible =
    filter === 'all' ? categories : filter === 'top' ? topLevel : categories.filter(c => c.parent_id);
  const activeCount = categories.filter(c => c.is_active).length;

  return (
    <SafeAreaView style={styles.container}>
      <Header title="التصنيفات" onAdd={() => openCreate(null)} />

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
            <Layers size={20} color={colors.primary[600]} />
            <Text style={styles.introText}>
              تحكّم كامل بتصنيفات المتجر: أضف تصنيفات رئيسية وفرعية، ارفع أيقونة لكل تصنيف، رتّبها،
              وفعّل أو أوقف ظهورها في التطبيق.
            </Text>
          </View>

          <View style={styles.statsRow}>
            <StatBox label="إجمالي التصنيفات" value={String(categories.length)} />
            <StatBox label="رئيسية" value={String(topLevel.length)} />
            <StatBox label="مفعّلة" value={String(activeCount)} />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
            <Chip label="الكل" active={filter === 'all'} onPress={() => setFilter('all')} />
            <Chip label="رئيسية فقط" active={filter === 'top'} onPress={() => setFilter('top')} />
            <Chip label="فرعية فقط" active={filter === 'sub'} onPress={() => setFilter('sub')} />
          </ScrollView>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {visible.length === 0 ? (
            <View style={styles.emptyCard}>
              <Layers size={40} color={colors.neutral[300]} />
              <Text style={styles.emptyTitle}>لا توجد تصنيفات هنا</Text>
              <Text style={styles.emptyText}>اضغط زر الإضافة بالأعلى لإنشاء تصنيف جديد.</Text>
            </View>
          ) : (
            visible.map(c => (
              <View key={c.id} style={styles.card}>
                <View style={styles.cardRow}>
                  {c.image_url ? (
                    <Image source={{ uri: c.image_url }} style={styles.cardImage} resizeMode="cover" />
                  ) : (
                    <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
                      <Layers size={22} color={colors.neutral[400]} />
                    </View>
                  )}
                  <View style={styles.cardBody}>
                    <View style={styles.cardTopRow}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{c.name}</Text>
                      <View style={[styles.badge, c.is_active ? styles.badgeOn : styles.badgeOff]}>
                        <Text style={[styles.badgeText, { color: c.is_active ? colors.success[700] : colors.neutral[600] }]}>
                          {c.is_active ? 'مفعّل' : 'موقوف'}
                        </Text>
                      </View>
                    </View>
                    {c.description ? (
                      <Text style={styles.cardSub} numberOfLines={2}>{c.description}</Text>
                    ) : null}
                    <View style={styles.metaRow}>
                      <Text style={styles.metaText}>{`/${c.slug}`}</Text>
                      <Text style={styles.metaDot}>•</Text>
                      <Text style={styles.metaText}>{`الترتيب: ${c.sort_order}`}</Text>
                    </View>
                    {c.parent_id ? (
                      <View style={styles.metaRow}>
                        <FolderTree size={12} color={colors.textMuted} />
                        <Text style={styles.metaText} numberOfLines={1}>
                          {`تابع لـ: ${nameById[c.parent_id] ?? '—'}`}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={styles.actionsRow}>
                  <IconBtn onPress={() => openCreate(c.id)}>
                    <Plus size={17} color={colors.success[600]} />
                  </IconBtn>
                  <IconBtn onPress={() => openEdit(c)}>
                    <Edit3 size={17} color={colors.primary[600]} />
                  </IconBtn>
                  <IconBtn onPress={() => toggleActive(c)}>
                    {c.is_active ? (
                      <EyeOff size={17} color={colors.warning[600]} />
                    ) : (
                      <Eye size={17} color={colors.success[600]} />
                    )}
                  </IconBtn>
                  <IconBtn onPress={() => move(c, -1)}>
                    <ArrowUp size={17} color={colors.neutral[600]} />
                  </IconBtn>
                  <IconBtn onPress={() => move(c, 1)}>
                    <ArrowDown size={17} color={colors.neutral[600]} />
                  </IconBtn>
                  <IconBtn onPress={() => remove(c)}>
                    <Trash2 size={17} color={colors.error[600]} />
                  </IconBtn>
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
              <Text style={styles.modalTitle}>{editTarget ? 'تعديل تصنيف' : 'تصنيف جديد'}</Text>
              <TouchableOpacity style={styles.iconBtn} onPress={() => setFormModal(false)}>
                <XIcon size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}>
              <Text style={styles.fieldLabel}>أيقونة / صورة التصنيف</Text>
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
                      {form.imageUrl ? 'تغيير الصورة' : 'رفع أيقونة من الجهاز'}
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

              <Text style={styles.fieldLabel}>اسم التصنيف *</Text>
              <TextInputArabic
                style={styles.input}
                value={form.name}
                onChangeText={v =>
                  setForm(prev => ({
                    ...prev,
                    name: v,
                    slug: prev.slugTouched ? prev.slug : slugify(v),
                  }))
                }
                placeholder="مثال: إلكترونيات"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.fieldLabel}>الرابط (slug)</Text>
              <TextInputArabic
                style={styles.input}
                value={form.slug}
                onChangeText={v => setForm(prev => ({ ...prev, slug: v, slugTouched: true }))}
                placeholder="electronics"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
              />
              <Text style={styles.hint}>يُستخدم في رابط صفحة التصنيف، يُنشأ تلقائياً من الاسم ويمكن تعديله.</Text>

              <Text style={styles.fieldLabel}>الوصف</Text>
              <TextInputArabic
                style={[styles.input, styles.inputMultiline]}
                value={form.description}
                onChangeText={v => setField('description', v)}
                placeholder="وصف مختصر للتصنيف (اختياري)"
                placeholderTextColor={colors.textMuted}
                multiline
              />

              <Text style={styles.fieldLabel}>التصنيف الأب</Text>
              <TouchableOpacity style={styles.selectBox} onPress={() => setParentPickerOpen(true)}>
                <Text style={styles.selectBoxText}>
                  {form.parentId ? (nameById[form.parentId] ?? '—') : 'بدون (تصنيف رئيسي)'}
                </Text>
                <ChevronDown size={18} color={colors.textMuted} />
              </TouchableOpacity>
              <Text style={styles.hint}>اختر تصنيفاً أباً لجعل هذا تصنيفاً فرعياً، أو اتركه بدون لجعله رئيسياً.</Text>

              <Text style={styles.fieldLabel}>الترتيب</Text>
              <TextInputArabic
                style={styles.input}
                value={form.sortOrder}
                onChangeText={v => setField('sortOrder', v.replace(/[^0-9]/g, ''))}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
              />

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
                title={saving ? 'جاري الحفظ...' : editTarget ? 'حفظ التعديلات' : 'إضافة التصنيف'}
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

      <Modal visible={parentPickerOpen} animationType="fade" transparent onRequestClose={() => setParentPickerOpen(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setParentPickerOpen(false)}>
          <View style={styles.pickerCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>اختر التصنيف الأب</Text>
              <TouchableOpacity style={styles.iconBtn} onPress={() => setParentPickerOpen(false)}>
                <XIcon size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              <TouchableOpacity
                style={styles.pickerOption}
                onPress={() => {
                  setField('parentId', null);
                  setParentPickerOpen(false);
                }}
              >
                <Text style={[styles.pickerOptionText, !form.parentId && styles.pickerOptionTextActive]}>
                  بدون (تصنيف رئيسي)
                </Text>
              </TouchableOpacity>
              {parentOptions.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.pickerOption}
                  onPress={() => {
                    setField('parentId', c.id);
                    setParentPickerOpen(false);
                  }}
                >
                  <Text style={[styles.pickerOptionText, form.parentId === c.id && styles.pickerOptionTextActive]}>
                    {c.parent_id ? `— ${c.name}` : c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {!loading ? (
        <TouchableOpacity style={styles.fab} onPress={() => openCreate(null)} activeOpacity={0.85}>
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
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  cardRow: { flexDirection: 'row', gap: spacing.md },
  cardImage: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.neutral[100] },
  cardImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, gap: spacing.xs },
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
  hint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
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
  selectBoxText: { ...typography.body, color: colors.text },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: spacing.md,
  },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  pickerCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.lg,
  },
  pickerOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerOptionText: { ...typography.body, color: colors.text },
  pickerOptionTextActive: { color: colors.primary[600], fontWeight: '700' },

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
