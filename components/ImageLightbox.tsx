/**
 * عارض الصور بالحجم الكامل — يفتح صور المنتج بشاشة كاملة
 * مع إمكانية التنقّل بينها بالسحب أو بالأسهم، وعدّاد أنيق للصور.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Image,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { X, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@/lib/theme';
import { ArabicText as Text } from '@/components/ArabicText';

type Props = {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
};

export function ImageLightbox({ visible, images, initialIndex = 0, onClose }: Props) {
  const { width, height } = Dimensions.get('window');
  const listRef = useRef<FlatList<string>>(null);
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (visible) setIndex(Math.min(initialIndex, Math.max(images.length - 1, 0)));
  }, [visible, initialIndex, images.length]);

  const goTo = (next: number) => {
    if (next < 0 || next >= images.length) return;
    setIndex(next);
    listRef.current?.scrollToOffset({ offset: next * width, animated: true });
  };

  if (!visible || images.length === 0) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="إغلاق">
            <X size={22} color={colors.white} />
          </TouchableOpacity>
          {images.length > 1 ? (
            <View style={styles.counter}>
              <Text style={styles.counterText}>
                {index + 1} / {images.length}
              </Text>
            </View>
          ) : (
            <View style={{ width: 44 }} />
          )}
        </View>

        <FlatList
          ref={listRef}
          data={images}
          horizontal
          pagingEnabled
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item, i) => `${item}-${i}`}
          onMomentumScrollEnd={e => {
            setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
          }}
          renderItem={({ item }) => (
            <View style={{ width, height: height * 0.72, alignItems: 'center', justifyContent: 'center' }}>
              <Image
                source={{ uri: item }}
                style={{ width: width - spacing.md * 2, height: height * 0.7 }}
                resizeMode="contain"
              />
            </View>
          )}
        />

        {images.length > 1 ? (
          <>
            {Platform.OS === 'web' ? (
              <>
                <TouchableOpacity style={[styles.navBtn, { right: spacing.md }]} onPress={() => goTo(index - 1)}>
                  <ChevronRight size={26} color={colors.white} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.navBtn, { left: spacing.md }]} onPress={() => goTo(index + 1)}>
                  <ChevronLeft size={26} color={colors.white} />
                </TouchableOpacity>
              </>
            ) : null}

            <View style={styles.thumbRow}>
              <FlatList
                data={images}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item, i) => `t-${item}-${i}`}
                contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.md }}
                renderItem={({ item, index: i }) => (
                  <TouchableOpacity onPress={() => goTo(i)} activeOpacity={0.8}>
                    <Image
                      source={{ uri: item }}
                      style={[styles.thumb, i === index && styles.thumbActive]}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                )}
              />
            </View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', justifyContent: 'center' },
  topBar: {
    position: 'absolute',
    top: Platform.OS === 'web' ? spacing.md : spacing.xl + spacing.sm,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 5,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  counter: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  counterText: { ...typography.caption, color: colors.white, fontWeight: '700' },
  navBtn: {
    position: 'absolute',
    top: '48%',
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  thumbRow: { position: 'absolute', bottom: spacing.xl, left: 0, right: 0 },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    opacity: 0.5,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbActive: { opacity: 1, borderColor: colors.white },
});
