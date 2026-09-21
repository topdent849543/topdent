/**
 * نافذة الإشعار المنبثقة (شبيهة بإشعارات واتساب) — تظهر أعلى الشاشة
 * فوق أي صفحة، مع حركة انزلاق ناعمة وإمكانية الضغط للانتقال.
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View, Platform } from 'react-native';
import { Bell, MessageCircle, Package, Wallet, X } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text } from '@/components/ArabicText';

export type ToastPayload = {
  id: string;
  title: string;
  body?: string | null;
  type?: string | null;
  onPress?: () => void;
};

function iconFor(type?: string | null) {
  switch (type) {
    case 'chat':
      return <MessageCircle size={20} color={colors.white} />;
    case 'order':
      return <Package size={20} color={colors.white} />;
    case 'wallet':
    case 'payment':
      return <Wallet size={20} color={colors.white} />;
    default:
      return <Bell size={20} color={colors.white} />;
  }
}

export function NotificationToast({
  toast,
  onDismiss,
}: {
  toast: ToastPayload | null;
  onDismiss: () => void;
}) {
  const translateY = useRef(new Animated.Value(-160)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!toast) return;
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 16, stiffness: 160 }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();

    timer.current = setTimeout(hide, 5000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast?.id]);

  const hide = () => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -160, duration: 220, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onDismiss());
  };

  if (!toast) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrapper, { transform: [{ translateY }], opacity }]}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        style={styles.card}
        onPress={() => {
          toast.onPress?.();
          hide();
        }}
      >
        <View style={styles.icon}>{iconFor(toast.type)}</View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{toast.title}</Text>
          {toast.body ? (
            <Text style={styles.body} numberOfLines={2}>{toast.body}</Text>
          ) : null}
        </View>
        <TouchableOpacity style={styles.close} onPress={hide} hitSlop={8}>
          <X size={16} color={colors.neutral[400]} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 16 : 48,
    left: spacing.md,
    right: spacing.md,
    zIndex: 9999,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.lg,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.bodySmall, fontWeight: '700', color: colors.text },
  body: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  close: { padding: 4 },
});
