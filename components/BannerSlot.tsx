import { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text } from '@/components/ArabicText';
import { supabase } from '@/lib/supabase';
import type { Banner } from '@/lib/supabase';

type Props = {
  /** مكان الظهور كما هو معرّف في لوحة الأدمن (banners.placement) */
  placement: string;
  /** أقصى عدد بنرات تُعرض في هذا المكان */
  limit?: number;
  style?: any;
  /**
   * عند تمريرها، يعرض الفتحة بنرات هذا القسم/التصنيف فقط (بالإضافة للبنرات
   * العامة بدون category_id). مفيد لعرض بنرات خاصة بقسم معيّن (مثل إلكترونيات).
   */
  categoryIds?: string[];
};

/**
 * فتحة بنر عامة يتحكم بها الأدمن بالكامل من صفحة «البنرات».
 * تعرض البنرات المفعّلة فقط، وتحترم تاريخ البداية والنهاية.
 */
export function BannerSlot({ placement, limit = 1, style, categoryIds }: Props) {
  const [banners, setBanners] = useState<Banner[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const nowIso = new Date().toISOString();
      const { data } = await supabase
        .from('banners')
        .select('*')
        .eq('placement', placement)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .limit(limit + 8);

      if (cancelled) return;
      const list = ((data as (Banner & { start_date?: string | null; end_date?: string | null })[]) ?? [])
        .filter(b => !b.start_date || b.start_date <= nowIso)
        .filter(b => !b.end_date || b.end_date >= nowIso)
        .filter(b => {
          if (!categoryIds || categoryIds.length === 0) return true;
          // بلا تصنيف = بنر عام يظهر في كل مكان، أو مرتبط بأحد تصنيفات هذا القسم
          return !b.category_id || categoryIds.includes(b.category_id);
        })
        .slice(0, limit);
      setBanners(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [placement, limit, categoryIds?.join(',')]);

  if (banners.length === 0) return null;

  const open = (link: string | null) => {
    if (!link) return;
    try {
      router.push(link as any);
    } catch {
      /* رابط غير صالح — يتم تجاهله */
    }
  };

  return (
    <View style={[styles.wrap, style]}>
      {banners.map(b => (
        <TouchableOpacity
          key={b.id}
          activeOpacity={b.cta_link ? 0.85 : 1}
          onPress={() => open(b.cta_link)}
          style={styles.card}
        >
          <Image source={{ uri: b.image_url }} style={styles.image} resizeMode="cover" />
          {b.title || b.subtitle ? (
            <View style={styles.overlay}>
              {b.title ? <Text style={styles.title}>{b.title}</Text> : null}
              {b.subtitle ? <Text style={styles.subtitle}>{b.subtitle}</Text> : null}
            </View>
          ) : null}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.neutral[100],
    ...shadows.sm,
  },
  image: { width: '100%', height: 120 },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  title: { ...typography.body, color: colors.white, fontWeight: '700' },
  subtitle: { ...typography.caption, color: colors.white },
});
