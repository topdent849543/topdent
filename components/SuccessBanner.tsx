/**
 * شريط نجاح أخضر بسيط وراقٍ — يظهر بانسيابية ويختفي تلقائياً.
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, TouchableOpacity } from 'react-native';
import { CheckCircle2, X } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text } from '@/components/ArabicText';

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string | null;
  onHide?: () => void;
  duration?: number;
};

export function SuccessBanner({ visible, title, subtitle, onHide, duration = 4000 }: Props) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start();
      return;
    }
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
    const timer = setTimeout(() => onHide?.(), duration);
    return () => clearTimeout(timer);
  }, [visible, duration, onHide, anim]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
        },
      ]}
    >
      <View style={styles.banner}>
        <CheckCircle2 size={20} color={colors.success[600]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <TouchableOpacity onPress={onHide} hitSlop={8}>
          <X size={16} color={colors.success[700]} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.success[50],
    borderWidth: 1,
    borderColor: colors.success[200],
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadows.sm,
  },
  title: { ...typography.body, color: colors.success[800], fontWeight: '700' },
  subtitle: { ...typography.caption, color: colors.success[700] },
});
