import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@/lib/theme';
import { ArabicText as Text } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { confirmAction } from '@/lib/confirm';

type Props = {
  /** 'menu' يظهر كصف قائمة (مثل زر تسجيل الخروج) — 'button' يظهر كزر مستقل */
  variant?: 'menu' | 'button';
  style?: any;
};

/**
 * زر «حذف الحساب» — يظهر بجانب زر تسجيل الخروج.
 *
 * يعرض تحذيراً واضحاً بأن الحساب وكل بياناته ستُفقد ولا يمكن استرجاعها،
 * ثم يطلب تأكيداً ثانياً قبل تنفيذ الحذف عبر الدالة الآمنة
 * `delete_my_account()` في قاعدة البيانات.
 */
export function DeleteAccountButton({ variant = 'menu', style }: Props) {
  const { user, signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);

  if (!user) return null;

  const runDelete = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.rpc('delete_my_account');
      if (error) throw error;
      await signOut();
      Alert.alert('تم حذف الحساب', 'تم حذف حسابك وجميع بياناته نهائياً.');
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('تعذّر حذف الحساب', e?.message ?? 'حدث خطأ غير متوقع، الرجاء المحاولة لاحقاً.');
    } finally {
      setDeleting(false);
    }
  };

  const onPress = () => {
    if (deleting) return;
    confirmAction(
      {
        title: '⚠️ تحذير: حذف الحساب نهائياً',
        message:
          'سيتم فقدان حسابك وجميع البيانات الخاصة به (الطلبات، المحفظة، الأرصدة، العناوين، الروابط والمنتجات) ولا يمكن إرجاعه أبداً.\n\nهل أنت متأكد من المتابعة؟',
        confirmText: 'متابعة',
        cancelText: 'إلغاء',
        destructive: true,
      },
      () => {
        confirmAction(
          {
            title: 'تأكيد نهائي',
            message: 'اضغط «حذف الحساب» لحذف الحساب نهائياً. لا يمكن التراجع عن هذه الخطوة.',
            confirmText: 'حذف الحساب',
            cancelText: 'إلغاء',
            destructive: true,
          },
          runDelete
        );
      }
    );
  };

  if (variant === 'button') {
    return (
      <TouchableOpacity
        style={[styles.outlineBtn, style]}
        onPress={onPress}
        disabled={deleting}
        activeOpacity={0.8}
      >
        {deleting ? (
          <ActivityIndicator size="small" color={colors.error[600]} />
        ) : (
          <>
            <Trash2 size={18} color={colors.error[600]} />
            <Text style={styles.outlineText}>حذف الحساب</Text>
          </>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={[styles.menuItem, style]} onPress={onPress} disabled={deleting} activeOpacity={0.7}>
      <View style={styles.menuLeft}>
        <View style={styles.menuIcon}>
          {deleting ? (
            <ActivityIndicator size="small" color={colors.error[600]} />
          ) : (
            <Trash2 size={20} color={colors.error[600]} />
          )}
        </View>
        <Text style={styles.menuLabel}>حذف الحساب</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.error[50],
  },
  menuLabel: {
    ...typography.body,
    color: colors.error[600],
    fontWeight: '600',
  },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.error[500],
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.error[50],
  },
  outlineText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.error[600],
  },
});
