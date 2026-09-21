import { useMemo, useState } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, FlatList, Image } from 'react-native';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Check,
  Layers,
  Store,
  X as XIcon,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text, ArabicTextInput as TextInputArabic } from '@/components/ArabicText';
import type { Category } from '@/lib/supabase';
import { getChildren, getCategoryPathLabel, flattenTree, hasChildren } from '@/lib/categories';

type Props = {
  visible: boolean;
  categories: Category[];
  /** المعرّف المختار حالياً (أو null إن لم يُختر شيء) */
  value: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
  title?: string;
  /** نص خيار "بدون تصنيف" — يُخفى تماماً إن كانت القيمة false */
  noneLabel?: string | false;
};

/**
 * منتقي أقسام/تصنيفات هرمي: يعرض الأقسام الرئيسية أولاً، وعند اختيار قسم
 * يعرض تصنيفاته الفرعية (وهكذا بعمق غير محدود)، مع إمكانية البحث المباشر
 * عبر كل الشجرة والاختيار في أي مستوى (قسم كامل أو تصنيف فرعي دقيق).
 */
export function CategoryPickerModal({
  visible,
  categories,
  value,
  onSelect,
  onClose,
  title = 'اختر القسم / التصنيف',
  noneLabel = 'بدون تصنيف',
}: Props) {
  const [stack, setStack] = useState<(string | null)[]>([null]);
  const [query, setQuery] = useState('');

  const currentParent = stack[stack.length - 1];
  const items = useMemo(() => getChildren(categories, currentParent), [categories, currentParent]);
  const flat = useMemo(() => flattenTree(categories), [categories]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return flat.filter(({ category }) => category.name.toLowerCase().includes(q)).slice(0, 40);
  }, [flat, query]);

  const breadcrumbLabel =
    currentParent == null ? 'كل الأقسام' : getCategoryPathLabel(categories, currentParent);

  const reset = () => {
    setStack([null]);
    setQuery('');
  };

  const close = () => {
    reset();
    onClose();
  };

  const choose = (id: string | null) => {
    onSelect(id);
    close();
  };

  const drillInto = (id: string) => setStack((s) => [...s, id]);
  const goBack = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{title}</Text>
            <TouchableOpacity style={styles.iconBtn} onPress={close}>
              <XIcon size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchRow}>
            <Search size={16} color={colors.textMuted} />
            <TextInputArabic
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="ابحث عن قسم أو تصنيف..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />
          </View>

          {query.trim() ? (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.category.id}
              contentContainerStyle={{ paddingBottom: spacing.lg }}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>لا توجد نتائج مطابقة</Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => choose(item.category.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.rowIconWrap}>
                    {item.category.image_url ? (
                      <Image source={{ uri: item.category.image_url }} style={styles.rowIcon} />
                    ) : (
                      <Layers size={16} color={colors.primary[500]} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{item.category.name}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {getCategoryPathLabel(categories, item.category.id)}
                    </Text>
                  </View>
                  {value === item.category.id ? (
                    <Check size={18} color={colors.primary[600]} />
                  ) : null}
                </TouchableOpacity>
              )}
            />
          ) : (
            <>
              <View style={styles.breadcrumbRow}>
                {stack.length > 1 ? (
                  <TouchableOpacity style={styles.backChip} onPress={goBack}>
                    <ChevronRight size={16} color={colors.primary[600]} />
                    <Text style={styles.backChipText}>رجوع</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.backChipPlaceholder} />
                )}
                <Text style={styles.breadcrumbText} numberOfLines={1}>
                  {breadcrumbLabel}
                </Text>
              </View>

              <FlatList
                data={items}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingBottom: spacing.lg }}
                ListHeaderComponent={
                  currentParent != null ? (
                    <TouchableOpacity
                      style={[styles.row, styles.selectParentRow]}
                      onPress={() => choose(currentParent)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.rowIconWrap}>
                        <Store size={16} color={colors.primary[600]} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>
                          اختر «{categories.find((c) => c.id === currentParent)?.name}» كاملاً
                        </Text>
                        <Text style={styles.rowSub}>بدون تحديد تصنيف فرعي دقيق</Text>
                      </View>
                      {value === currentParent ? <Check size={18} color={colors.primary[600]} /> : null}
                    </TouchableOpacity>
                  ) : noneLabel !== false ? (
                    <TouchableOpacity
                      style={styles.row}
                      onPress={() => choose(null)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.rowIconWrap}>
                        <Layers size={16} color={colors.neutral[400]} />
                      </View>
                      <Text style={[styles.rowTitle, { flex: 1 }]}>{noneLabel}</Text>
                      {value === null ? <Check size={18} color={colors.primary[600]} /> : null}
                    </TouchableOpacity>
                  ) : null
                }
                ListEmptyComponent={
                  <View style={styles.emptyWrap}>
                    <Text style={styles.emptyText}>لا توجد تصنيفات فرعية هنا</Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const childCount = hasChildren(categories, item.id);
                  return (
                    <TouchableOpacity
                      style={styles.row}
                      onPress={() => (childCount ? drillInto(item.id) : choose(item.id))}
                      activeOpacity={0.7}
                    >
                      <View style={styles.rowIconWrap}>
                        {item.image_url ? (
                          <Image source={{ uri: item.image_url }} style={styles.rowIcon} />
                        ) : (
                          <Layers size={16} color={colors.primary[500]} />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{item.name}</Text>
                        {childCount ? (
                          <Text style={styles.rowSub}>يحتوي على تصنيفات فرعية</Text>
                        ) : null}
                      </View>
                      {value === item.id ? <Check size={18} color={colors.primary[600]} /> : null}
                      {childCount ? <ChevronLeft size={18} color={colors.textMuted} /> : null}
                    </TouchableOpacity>
                  );
                }}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  card: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '85%',
    minHeight: '55%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { ...typography.h4, color: colors.text, fontWeight: '700' },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  searchInput: { flex: 1, ...typography.body, color: colors.text, padding: 0 },
  breadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  backChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.primary[50],
  },
  backChipPlaceholder: { width: 4 },
  backChipText: { ...typography.caption, color: colors.primary[600], fontWeight: '700' },
  breadcrumbText: { ...typography.caption, color: colors.textMuted, flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  selectParentRow: { backgroundColor: colors.primary[50] },
  rowIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rowIcon: { width: '100%', height: '100%' },
  rowTitle: { ...typography.body, color: colors.text, fontWeight: '600' },
  rowSub: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  emptyWrap: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { ...typography.caption, color: colors.textMuted },
});
