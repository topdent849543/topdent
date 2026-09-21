/**
 * محرّر صور المنتج — يسمح للتاجر والأدمن برفع أكثر من صورة لكل منتج،
 * وترتيبها، وتحديد الصورة الرئيسية التي تظهر في الصفحة الرئيسية.
 */
import { useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  Plus,
  Star,
  X,
  ChevronRight,
  ChevronLeft,
  ImagePlus,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text } from '@/components/ArabicText';
import { pickAndUploadImage, isCloudinaryConfigured } from '@/lib/cloudinary';
import type { EditableImage } from '@/lib/productImages';

type Props = {
  images: EditableImage[];
  onChange: (images: EditableImage[]) => void;
  disabled?: boolean;
  max?: number;
};

export function ProductImagesEditor({ images, onChange, disabled, max = 10 }: Props) {
  const [uploading, setUploading] = useState(false);

  const ensurePrimary = (list: EditableImage[]): EditableImage[] => {
    if (list.length === 0) return list;
    if (list.some(i => i.isPrimary)) return list;
    return list.map((img, i) => ({ ...img, isPrimary: i === 0 }));
  };

  const addImage = async () => {
    if (disabled || uploading) return;
    if (images.length >= max) {
      Alert.alert('الحد الأقصى', `يمكن رفع ${max} صور كحدّ أقصى لكل منتج.`);
      return;
    }
    setUploading(true);
    try {
      const url = await pickAndUploadImage();
      if (url) {
        if (images.some(i => i.url === url)) {
          Alert.alert('صورة مكرّرة', 'هذه الصورة مضافة مسبقاً لهذا المنتج.');
        } else {
          onChange(ensurePrimary([...images, { url, isPrimary: images.length === 0 }]));
        }
      }
    } catch (e: any) {
      Alert.alert('خطأ في الرفع', e?.message || 'تعذّر رفع الصورة');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (index: number) => {
    const next = images.filter((_, i) => i !== index);
    onChange(ensurePrimary(next));
  };

  const setPrimary = (index: number) => {
    onChange(images.map((img, i) => ({ ...img, isPrimary: i === index })));
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChange(next);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>صور المنتج</Text>
        <Text style={styles.counter}>
          {images.length}/{max}
        </Text>
      </View>
      <Text style={styles.hint}>
        ارفع عدّة صور للمنتج، واختر الصورة الرئيسية التي ستظهر في الصفحة الرئيسية.
        باقي الصور يراها الزبون داخل صفحة المنتج.
      </Text>

      <View style={styles.grid}>
        {images.map((img, index) => (
          <View key={`${img.url}-${index}`} style={styles.tile}>
            <Image source={{ uri: img.url }} style={styles.thumb} resizeMode="cover" />

            {img.isPrimary ? (
              <View style={styles.primaryBadge}>
                <Star size={11} color={colors.white} fill={colors.white} />
                <Text style={styles.primaryBadgeText}>رئيسية</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => removeImage(index)}
              disabled={disabled}
              accessibilityLabel="حذف الصورة"
            >
              <X size={13} color={colors.white} />
            </TouchableOpacity>

            <View style={styles.tileActions}>
              <TouchableOpacity
                style={styles.tileAction}
                onPress={() => move(index, 1)}
                disabled={disabled || index === images.length - 1}
              >
                <ChevronLeft
                  size={15}
                  color={index === images.length - 1 ? colors.neutral[300] : colors.text}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tileAction, styles.tileActionMain, img.isPrimary && styles.tileActionActive]}
                onPress={() => setPrimary(index)}
                disabled={disabled || img.isPrimary}
              >
                <Star
                  size={14}
                  color={img.isPrimary ? colors.white : colors.text}
                  fill={img.isPrimary ? colors.white : 'transparent'}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.tileAction}
                onPress={() => move(index, -1)}
                disabled={disabled || index === 0}
              >
                <ChevronRight size={15} color={index === 0 ? colors.neutral[300] : colors.text} />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {images.length < max ? (
          <TouchableOpacity
            style={[styles.tile, styles.addTile]}
            onPress={addImage}
            disabled={disabled || uploading}
            activeOpacity={0.8}
          >
            {uploading ? (
              <ActivityIndicator color={colors.primary[600]} />
            ) : (
              <>
                {images.length === 0 ? (
                  <ImagePlus size={26} color={colors.primary[600]} />
                ) : (
                  <Plus size={26} color={colors.primary[600]} />
                )}
                <Text style={styles.addText}>
                  {images.length === 0 ? 'أضف أول صورة' : 'أضف صورة'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      {!isCloudinaryConfigured() ? (
        <Text style={styles.warning}>
          الرفع غير مُفعّل: أضف EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME و
          EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET في ملف .env
        </Text>
      ) : null}
    </View>
  );
}

const TILE = 104;

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginTop: spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.bodySmall, fontWeight: '700', color: colors.text },
  counter: { ...typography.caption, color: colors.textSecondary },
  hint: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: TILE,
    height: TILE + 30,
    borderRadius: radius.md,
    backgroundColor: colors.neutral[100],
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  thumb: { width: '100%', height: TILE },
  addTile: {
    height: TILE + 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    borderColor: colors.primary[300],
    backgroundColor: colors.primary[50],
  },
  addText: { ...typography.caption, color: colors.primary[700], fontWeight: '600' },
  primaryBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.success[600],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  primaryBadgeText: { ...typography.caption, fontSize: 10, color: colors.white, fontWeight: '700' },
  removeBtn: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  tileActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    height: 30,
    backgroundColor: colors.surface,
  },
  tileAction: {
    width: 26,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  tileActionMain: { backgroundColor: colors.neutral[100] },
  tileActionActive: { backgroundColor: colors.success[600] },
  warning: { ...typography.caption, color: colors.warning[700] },
});
