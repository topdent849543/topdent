import { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  SafeAreaView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { ShoppingBag, Minus, Plus, Trash2, Tag, ChevronRight, X } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { useCart } from '@/lib/CartContext';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import type { Coupon } from '@/lib/supabase';
import { ArabicText as Text, ArabicTextInput as TextInput } from '@/components/ArabicText';
import { t } from '@/lib/i18n';
import { BannerSlot } from '@/components/BannerSlot';
import { fetchAppSettings, DEFAULT_APP_SETTINGS, type AppSettings } from '@/lib/settings';
import { formatSyp } from '@/lib/currency';

export default function CartScreen() {
  const { items, loading, updateQuantity, removeItem, clearCart, subtotal } = useCart();
  const { user } = useAuth();
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState('');
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);

  useEffect(() => {
    fetchAppSettings().then(setSettings);
  }, []);

  const shippingCost = settings.shipping_flat_cost;
  const discount = appliedCoupon
    ? appliedCoupon.discount_type === 'percentage'
      ? (subtotal * appliedCoupon.discount_value) / 100
      : Math.min(appliedCoupon.discount_value, subtotal)
    : 0;
  const tax = (subtotal - discount) * (settings.tax_rate / 100);
  const total = Math.max(0, subtotal - discount + shippingCost + tax);

  const applyCoupon = useCallback(async () => {
    if (!couponCode.trim()) return;
    setCheckingCoupon(true);
    setCouponError('');
    const { data } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', couponCode.toUpperCase())
      .eq('is_active', true)
      .maybeSingle();
    setCheckingCoupon(false);
    if (!data) {
      setCouponError('Invalid coupon code');
      setAppliedCoupon(null);
      return;
    }
    const coupon = data as Coupon;
    if (coupon.min_spend && subtotal < coupon.min_spend) {
      setCouponError(`الحد الأدنى للطلب ${formatSyp(coupon.min_spend)}`);
      setAppliedCoupon(null);
      return;
    }
    if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) {
      setCouponError('Coupon expired');
      setAppliedCoupon(null);
      return;
    }
    setAppliedCoupon(coupon);
  }, [couponCode, subtotal]);

  const handleCheckout = () => {
    if (!user) {
      Alert.alert(t('Sign in required'), t('Please sign in to checkout.'), [
        { text: t('Sign In'), onPress: () => router.push('/auth/login') },
        { text: t('Cancel'), style: 'cancel' },
      ]);
      return;
    }
    router.push('/checkout');
  };

  const handleClearCart = () => {
    Alert.alert(t('Clear Cart'), t('Remove all items from cart?'), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Clear'), style: 'destructive', onPress: clearCart },
    ]);
  };

  if (items.length === 0 && !loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Shopping Cart</Text>
        </View>
        <EmptyState
          icon={<ShoppingBag size={64} color={colors.neutral[300]} />}
          title="Your cart is empty"
          message="Browse our collection and add items you love"
          action={
            <Button title="Start Shopping" onPress={() => router.push('/(tabs)/index')} />
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Shopping Cart</Text>
        <TouchableOpacity onPress={handleClearCart}>
          <Text style={styles.clearBtn}>Clear All</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 200 }}>
        <BannerSlot placement="cart" style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md }} />
        {items.map((item) => (
          <View key={item.id} style={styles.cartItem}>
            {item.product?.images?.[0]?.image_url ? (
              <Image
                source={{ uri: item.product.images[0].image_url }}
                style={styles.itemImage}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.itemImage, { backgroundColor: colors.neutral[200] }]} />
            )}
            <View style={styles.itemInfo}>
              <Text style={styles.itemName} numberOfLines={2}>{item.product?.name}</Text>
              {item.size ? <Text style={styles.itemVariant}>Size: {item.size}</Text> : null}
              {item.color ? <Text style={styles.itemVariant}>Color: {item.color}</Text> : null}
              <Text style={styles.itemPrice}>{formatSyp(item.product?.price ?? 0)}</Text>
              <View style={styles.itemActions}>
                <View style={styles.qtyControl}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => updateQuantity(item.id, item.quantity - 1)}
                  >
                    <Minus size={14} color={colors.text} />
                  </TouchableOpacity>
                  <Text style={styles.qtyText}>{item.quantity}</Text>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => updateQuantity(item.id, item.quantity + 1)}
                  >
                    <Plus size={14} color={colors.text} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => removeItem(item.id)}
                >
                  <Trash2 size={16} color={colors.error[500]} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
        <View style={styles.couponSection}>
          <Text style={styles.sectionTitle}>Have a coupon?</Text>
          {appliedCoupon ? (
            <View style={styles.appliedCoupon}>
              <View style={styles.appliedCouponInfo}>
                <Tag size={18} color={colors.success[600]} />
                <View>
                  <Text style={styles.appliedCouponCode}>{appliedCoupon.code}</Text>
                  <Text style={styles.appliedCouponDesc}>{appliedCoupon.description}</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => { setAppliedCoupon(null); setCouponCode(''); }}
              >
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.couponInputRow}>
                <TextInput
                  style={styles.couponInput}
                  placeholder="Enter coupon code"
                  value={couponCode}
                  onChangeText={setCouponCode}
                  autoCapitalize="characters"
                />
                <Button
                  title={checkingCoupon ? '...' : 'Apply'}
                  onPress={applyCoupon}
                  size="sm"
                  variant="outline"
                />
              </View>
              {couponError ? <Text style={styles.couponError}>{couponError}</Text> : null}
              <TouchableOpacity
                style={styles.viewCouponsBtn}
                onPress={() => router.push('/coupons')}
              >
                <Text style={styles.viewCouponsText}>View available coupons</Text>
                <ChevronRight size={16} color={colors.primary[600]} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
      <View style={styles.bottomBar}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>{formatSyp(subtotal)}</Text>
        </View>
        {discount > 0 ? (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Discount</Text>
            <Text style={[styles.summaryValue, { color: colors.success[600] }]}>
              -{formatSyp(discount)}
            </Text>
          </View>
        ) : null}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Shipping</Text>
          <Text style={styles.summaryValue}>
            {shippingCost === 0 ? 'FREE' : formatSyp(shippingCost)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{`Tax (${settings.tax_rate}%)`}</Text>
          <Text style={styles.summaryValue}>{formatSyp(tax)}</Text>
        </View>
        <View style={[styles.summaryRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatSyp(total)}</Text>
        </View>
        <Button title="Proceed to Checkout" onPress={handleCheckout} fullWidth size="lg" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  title: {
    ...typography.h2,
    color: colors.text,
  },
  clearBtn: {
    ...typography.bodySmall,
    color: colors.error[500],
    fontWeight: '600',
  },
  cartItem: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    ...shadows.sm,
  },
  itemImage: {
    width: 90,
    height: 110,
    borderRadius: radius.md,
  },
  itemInfo: {
    flex: 1,
    gap: 4,
  },
  itemName: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  itemVariant: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  itemPrice: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  itemActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.neutral[100],
    borderRadius: radius.sm,
    padding: 2,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    minWidth: 20,
    textAlign: 'center',
  },
  removeBtn: {
    padding: spacing.sm,
  },
  couponSection: {
    margin: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    gap: spacing.sm,
    ...shadows.sm,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.text,
  },
  couponInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  couponInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.bodySmall,
  },
  couponError: {
    ...typography.caption,
    color: colors.error[500],
  },
  viewCouponsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewCouponsText: {
    ...typography.bodySmall,
    color: colors.primary[600],
    fontWeight: '600',
  },
  appliedCoupon: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.success[50],
    borderRadius: radius.md,
    padding: spacing.md,
  },
  appliedCouponInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  appliedCouponCode: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
  },
  appliedCouponDesc: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  summaryValue: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  totalRow: {
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginVertical: spacing.xs,
  },
  totalLabel: {
    ...typography.h4,
    color: colors.text,
  },
  totalValue: {
    ...typography.h4,
    fontWeight: '700',
    color: colors.primary[600],
  },
});
