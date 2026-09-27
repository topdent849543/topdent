import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ChevronLeft,
  MapPin,
  CheckCircle,
  Store,
  Wallet,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Truck,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { useCart } from '@/lib/CartContext';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import type { Governorate, ShippingBranch } from '@/lib/supabase';
import { ArabicText as Text } from '@/components/ArabicText';
import { t } from '@/lib/i18n';
import { confirmAction } from '@/lib/confirm';
import { fetchAppSettings, DEFAULT_APP_SETTINGS, type AppSettings } from '@/lib/settings';
import { formatSyp } from '@/lib/currency';

/**
 * الدفع في هذا التطبيق يتم حصراً من المحفظة:
 * يُخصم من رصيد الزبون الدفعة المقدمة (نسبتها يحددها الأدمن من الإعدادات العامة)
 * ولا يُنشأ الطلب إطلاقاً قبل نجاح الخصم — كل ذلك داخل دالة قاعدة بيانات
 * واحدة ذرّية (place_order_from_cart) لضمان عدم وجود طلب بلا دفع.
 */
export default function CheckoutScreen() {
  const { items, subtotal, clearCart, loading: cartLoading } = useCart();
  const { user } = useAuth();
  const [governorates, setGovernorates] = useState<Governorate[]>([]);
  const [branches, setBranches] = useState<ShippingBranch[]>([]);
  const [selectedGovernorate, setSelectedGovernorate] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<ShippingBranch | null>(null);
  const [deliveryType, setDeliveryType] = useState<'standard' | 'express'>('standard');
  const [deliverySlot, setDeliverySlot] = useState('');
  const [showGovernorates, setShowGovernorates] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const deliverySlots = useMemo(() => {
    const now = new Date();
    const windows = [{ hour: 10, label: '10:00–13:00' }, { hour: 14, label: '14:00–17:00' }, { hour: 18, label: '18:00–21:00' }];
    return Array.from({ length: 5 }, (_, day) => {
      const date = new Date(now);
      date.setDate(now.getDate() + day);
      return windows.flatMap((window) => {
        const start = new Date(date);
        start.setHours(window.hour, 0, 0, 0);
        if (start.getTime() <= now.getTime() + 60 * 60 * 1000) return [];
        return [{ value: start.toISOString(), label: `${day === 0 ? 'اليوم' : start.toLocaleDateString('ar-SY', { weekday: 'short', month: 'short', day: 'numeric' })} · ${window.label}` }];
      });
    }).flat();
  }, []);
  const [loading, setLoading] = useState(true);
  const [orderJustPlaced, setOrderJustPlaced] = useState(false);
  const [placing, setPlacing] = useState(false);
  // قفل فوري يمنع تنفيذ الطلب مرتين عند النقر المزدوج (خاصة على الويب).
  const placingRef = useRef(false);

  const loadShippingData = useCallback(async () => {
    const { data: govs } = await supabase
      .from('governorates')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    setGovernorates((govs as Governorate[]) ?? []);

    const { data: brs } = await supabase
      .from('shipping_branches')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    setBranches((brs as ShippingBranch[]) ?? []);
  }, []);

  const loadWallet = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('wallets')
      .select('available_balance')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      console.warn('[checkout] loadWallet error', error);
    }
    setWalletBalance(Number(data?.available_balance ?? 0));
  }, [user]);

  const loadSettings = useCallback(async () => {
    setSettings(await fetchAppSettings());
  }, []);

  useEffect(() => {
    Promise.all([loadShippingData(), loadWallet(), loadSettings()]).finally(() => setLoading(false));
  }, [loadShippingData, loadWallet, loadSettings]);

  useEffect(() => {
    if (!deliverySlot && deliverySlots.length) setDeliverySlot(deliverySlots[0].value);
  }, [deliverySlot, deliverySlots]);

  const upfrontPct = settings.upfront_percentage;
  const shippingCost = settings.shipping_flat_cost;
  const tax = subtotal * (settings.tax_rate / 100);
  const total = subtotal + shippingCost + tax;
  const upfrontAmount = Math.round(total * (upfrontPct / 100) * 100) / 100;
  const remainingAmount = Math.round((total - upfrontAmount) * 100) / 100;
  const balanceEnough = walletBalance >= upfrontAmount;

  const filteredBranches = selectedGovernorate
    ? branches.filter(b => b.governorate_id === selectedGovernorate)
    : [];

  const selectGovernorate = (govId: string) => {
    setSelectedGovernorate(govId);
    setSelectedBranch(null);
    setShowGovernorates(false);
  };

  const submitOrder = useCallback(async () => {
    if (placingRef.current) return;
    placingRef.current = true;
    setPlacing(true);
    try {
      let affiliateCode: string | null = null;
      try {
        affiliateCode = await AsyncStorage.getItem('affiliate_ref');
      } catch {}

      const { data, error } = await supabase.rpc('place_order_from_cart_with_delivery', {
        p_shipping_branch_id: selectedBranch!.id,
        p_affiliate_code: affiliateCode,
        p_delivery_type: deliveryType,
        p_delivery_slot: deliverySlot,
      });

      if (error) throw error;
      const result = data as any;

      if (affiliateCode) {
        // ضمان ربط الطلب بالناشر واحتساب عمولته حتى لو لم تُخزّن
        // دالة إنشاء الطلب الكود بنفسها.
        try {
          await supabase.rpc('attach_order_affiliate', {
            p_order_id: result?.order_id,
            p_code: affiliateCode,
          });
        } catch {}
        try { await AsyncStorage.removeItem('affiliate_ref'); } catch {}
      }

      setWalletBalance(Number(result?.wallet_balance ?? walletBalance - upfrontAmount));
      try { await clearCart(); } catch {}

      setOrderJustPlaced(true);
      router.replace(`/invoice/${result.order_id}`);

      const paidSyp = Number(result.paid);
      const remainingSyp = Number(result.remaining);
      Alert.alert(
        t('Order Placed!'),
        `تم إنشاء الطلب ${result.order_number}.\n` +
          `المدفوع من المحفظة (${Number(result.upfront_percentage).toFixed(0)}%): ${formatSyp(paidSyp)}\n` +
          `المتبقي عند الاستلام: ${formatSyp(remainingSyp)}\n` +
          `الفاتورة: ${result.invoice_number}`
      );
    } catch (e: any) {
      console.error('[placeOrder] error', e);
      Alert.alert(t('Error'), e?.message ?? t('Failed to place order'));
      // إعادة قراءة الرصيد لأن أي فشل يعني عدم خصم أي مبلغ.
      loadWallet();
    } finally {
      setPlacing(false);
      placingRef.current = false;
    }
  }, [selectedBranch, deliveryType, deliverySlot, upfrontAmount, walletBalance, clearCart, loadWallet]);

  const placeOrder = useCallback(() => {
    if (placingRef.current || placing) return;
    if (!user) {
      Alert.alert(t('Sign in required'), t('Please sign in to place an order.'));
      return;
    }
    if (!selectedBranch) {
      Alert.alert(t('Branch required'), t('Please select a shipping branch.'));
      return;
    }
    if (!deliverySlot) {
      Alert.alert('موعد التوصيل مطلوب', 'يرجى اختيار موعد مناسب للتوصيل.');
      return;
    }
    if (items.length === 0) {
      Alert.alert(t('Empty cart'), t('Add items to your cart first.'));
      return;
    }
    if (!balanceEnough) {
      Alert.alert(
        t('Insufficient wallet balance'),
        `رصيد محفظتك (${formatSyp(walletBalance)}) لا يكفي لدفع الدفعة المقدمة ` +
          `(${upfrontPct}% = ${formatSyp(upfrontAmount)}). يرجى شحن المحفظة أولاً.`
      );
      return;
    }

    confirmAction(
      {
        title: 'تأكيد الدفع من المحفظة',
        message:
          `سيتم خصم ${formatSyp(upfrontAmount)} (${upfrontPct}% من إجمالي ${formatSyp(total)}) ` +
          `من رصيد محفظتك فوراً.\n` +
          `المتبقي عند الاستلام: ${formatSyp(remainingAmount)}\n` +
          `سرعة التوصيل: ${deliveryType === 'express' ? 'عاجل' : 'عادي'}\n` +
          `موعد التوصيل: ${deliverySlots.find(slot => slot.value === deliverySlot)?.label ?? ''}\n` +
          `الفرع: ${selectedBranch.branch_name}\n\nهل تريد المتابعة؟`,
        confirmText: 'ادفع الآن',
        cancelText: 'إلغاء',
        destructive: false,
      },
      () => { void submitOrder(); }
    );
  }, [
    user, selectedBranch, deliveryType, deliverySlot, deliverySlots, items.length, balanceEnough, walletBalance,
    upfrontPct, upfrontAmount, remainingAmount, total, placing, submitOrder,
  ]);

  if (loading || cartLoading || orderJustPlaced) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary[600]} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (items.length === 0 && !orderJustPlaced) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Checkout</Text>
          <View style={{ width: 40 }} />
        </View>
        <EmptyState title="Your cart is empty" message="Add items before checking out" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Checkout</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        {/* Shipping Branch Selection */}
        <Section title="Shipping Branch" icon={<MapPin size={18} color={colors.primary[600]} />}>
          <Text style={styles.helperText}>اختر المحافظة ثم فرع الاستلام</Text>

          <TouchableOpacity
            style={styles.selectorBtn}
            onPress={() => setShowGovernorates(!showGovernorates)}
          >
            <Text style={selectedGovernorate ? styles.selectorText : styles.selectorPlaceholder}>
              {selectedGovernorate
                ? governorates.find(g => g.id === selectedGovernorate)?.name
                : 'اختر المحافظة'}
            </Text>
            {showGovernorates ? (
              <ChevronUp size={20} color={colors.textMuted} />
            ) : (
              <ChevronDown size={20} color={colors.textMuted} />
            )}
          </TouchableOpacity>

          {showGovernorates && (
            <View style={styles.dropdownList}>
              {governorates.map(gov => (
                <TouchableOpacity
                  key={gov.id}
                  style={[
                    styles.dropdownItem,
                    selectedGovernorate === gov.id && styles.dropdownItemActive,
                  ]}
                  onPress={() => selectGovernorate(gov.id)}
                >
                  <MapPin size={16} color={colors.primary[600]} />
                  <Text style={styles.dropdownItemText}>{gov.name}</Text>
                  {selectedGovernorate === gov.id ? (
                    <CheckCircle size={16} color={colors.primary[600]} />
                  ) : null}
                </TouchableOpacity>
              ))}
              {governorates.length === 0 && (
                <Text style={styles.emptyDropdown}>لا توجد محافظات متاحة بعد</Text>
              )}
            </View>
          )}

          {selectedGovernorate && (
            <View style={styles.branchList}>
              <Text style={styles.branchListTitle}>الفروع المتاحة</Text>
              {filteredBranches.length === 0 ? (
                <Text style={styles.emptyBranches}>لا توجد فروع في هذه المحافظة</Text>
              ) : (
                filteredBranches.map(branch => (
                  <TouchableOpacity
                    key={branch.id}
                    style={[
                      styles.branchCard,
                      selectedBranch?.id === branch.id && styles.branchCardActive,
                    ]}
                    onPress={() => setSelectedBranch(branch)}
                  >
                    <View style={styles.branchIcon}>
                      <Store size={20} color={colors.primary[600]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.branchName}>{branch.branch_name}</Text>
                      <Text style={styles.branchAddress}>{branch.address}</Text>
                      {branch.phone ? (
                        <Text style={styles.branchPhone}>{branch.phone}</Text>
                      ) : null}
                    </View>
                    {selectedBranch?.id === branch.id ? (
                      <CheckCircle size={24} color={colors.primary[600]} />
                    ) : (
                      <View style={styles.radioOuter}>
                        <View style={styles.radioInner} />
                      </View>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </Section>

        <Section title="سرعة وموعد التوصيل" icon={<Truck size={18} color={colors.primary[600]} />}>
          <Text style={styles.helperText}>اختر تفضيل سرعة التوصيل والنافذة الزمنية المناسبة. السعر الحالي للشحن محسوب من إعدادات التطبيق.</Text>
          <View style={styles.deliveryOptions}>
            {([['standard', 'عادي', 'التوصيل وفق وقت تجهيز التاجر'], ['express', 'عاجل', 'أولوية في التجهيز حسب التوفر']] as const).map(([value, label, hint]) => (
              <TouchableOpacity key={value} style={[styles.deliveryOption, deliveryType === value && styles.deliveryOptionActive]} onPress={() => setDeliveryType(value)}>
                <View style={{ flex: 1 }}><Text style={styles.optionLabel}>{label}</Text><Text style={styles.optionDesc}>{hint}</Text></View>
                <View style={styles.radioOuter}>{deliveryType === value ? <View style={styles.radioSelected} /> : null}</View>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.branchListTitle}>موعد التوصيل المفضل</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slotList}>
            {deliverySlots.map(slot => (
              <TouchableOpacity key={slot.value} style={[styles.slotChip, deliverySlot === slot.value && styles.slotChipActive]} onPress={() => setDeliverySlot(slot.value)}>
                <Text style={[styles.slotText, deliverySlot === slot.value && styles.slotTextActive]}>{slot.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {!deliverySlots.length ? <Text style={styles.emptyBranches}>لا توجد مواعيد متاحة حالياً.</Text> : null}
        </Section>

        {/* Wallet Payment — الطريقة الوحيدة */}
        <Section title="الدفع من المحفظة" icon={<Wallet size={18} color={colors.primary[600]} />}>
          <View style={styles.paymentInfoBox}>
            <Text style={styles.paymentInfoText}>
              {`الدفع يتم حصراً من المحفظة: تدفع الآن ${upfrontPct}% من قيمة الطلب، والباقي عند الاستلام.`}
            </Text>
          </View>

          <View style={styles.walletCard}>
            <Wallet size={22} color={colors.primary[600]} />
            <View style={{ flex: 1, marginHorizontal: spacing.sm }}>
              <Text style={styles.optionLabel}>رصيد المحفظة</Text>
              <Text style={styles.optionDesc}>المتاح حالياً للدفع</Text>
            </View>
            <Text style={[styles.walletBalance, !balanceEnough && styles.walletBalanceLow]}>
              {formatSyp(walletBalance)}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.upfrontLabel}>{`المطلوب الآن (${upfrontPct}%)`}</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.upfrontValue}>{formatSyp(upfrontAmount)}</Text>
            </View>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.remainingLabel}>الرصيد بعد الدفع</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.remainingValue}>
                {formatSyp(Math.max(0, walletBalance - upfrontAmount))}
              </Text>
            </View>
          </View>

          {!balanceEnough && (
            <View style={styles.warningBox}>
              <AlertTriangle size={16} color={colors.warning[600]} />
              <View style={{ flex: 1, marginHorizontal: spacing.sm }}>
                <Text style={styles.warningText}>
                  {`الرصيد لا يكفي للدفعة المقدمة. تحتاج ${formatSyp(Math.max(0, upfrontAmount - walletBalance))} إضافية.`}
                </Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/wallet')}>
                <Text style={styles.topupLink}>شحن المحفظة</Text>
              </TouchableOpacity>
            </View>
          )}
        </Section>

        {/* Order Summary */}
        <Section title="Order Summary">
          {items.map((item: any) => {
            const itemTotal = (item.product?.price ?? 0) * item.quantity;
            return (
              <View key={item.id} style={styles.summaryItem}>
                <Text style={styles.summaryItemName} numberOfLines={1}>
                  {item.product?.name} x{item.quantity}
                </Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.summaryItemPrice}>
                    {formatSyp(itemTotal)}
                  </Text>
                </View>
              </View>
            );
          })}
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.summaryValue}>{formatSyp(subtotal)}</Text>
            </View>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Shipping</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.summaryValue}>{formatSyp(shippingCost)}</Text>
            </View>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>التوصيل</Text>
            <Text style={styles.summaryValue}>{deliveryType === 'express' ? 'عاجل' : 'عادي'}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>الموعد المفضل</Text>
            <Text style={[styles.summaryValue, { flex: 1, textAlign: 'right', marginLeft: spacing.md }]}>{deliverySlots.find(slot => slot.value === deliverySlot)?.label ?? '—'}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Tax</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.summaryValue}>{formatSyp(tax)}</Text>
            </View>
          </View>
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.totalValue}>{formatSyp(total)}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.upfrontLabel}>{`تدفع الآن (${upfrontPct}%)`}</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.upfrontValue}>{formatSyp(upfrontAmount)}</Text>
            </View>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.remainingLabel}>{`عند الاستلام (${(100 - upfrontPct).toFixed(0)}%)`}</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.remainingValue}>{formatSyp(remainingAmount)}</Text>
            </View>
          </View>
        </Section>
      </ScrollView>
      <View style={styles.bottomBar}>
        <View style={styles.bottomBarInfo}>
          <Text style={styles.bottomBarLabel}>{`الدفع الآن (${upfrontPct}%)`}</Text>
          <Text style={styles.bottomBarAmount}>{formatSyp(upfrontAmount)}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Button
            title={
              placing
                ? 'جاري الدفع...'
                : `ادفع ${upfrontPct}% من المحفظة`
            }
            onPress={placeOrder}
            loading={placing}
            disabled={placing || !balanceEnough || !selectedBranch || !deliverySlot}
            fullWidth
            size="lg"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {icon}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.surface,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h4, color: colors.text, fontWeight: '700' },
  section: { margin: spacing.md, marginBottom: 0 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  sectionTitle: { ...typography.h4, color: colors.text },
  sectionBody: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm },
  helperText: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  selectorBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.background,
  },
  selectorText: { ...typography.body, color: colors.text, fontWeight: '600' },
  selectorPlaceholder: { ...typography.body, color: colors.textMuted },
  dropdownList: { marginTop: spacing.sm, gap: 4 },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.md, backgroundColor: colors.background,
  },
  dropdownItemActive: { backgroundColor: colors.primary[50] },
  dropdownItemText: { ...typography.bodySmall, color: colors.text, flex: 1 },
  emptyDropdown: { ...typography.caption, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.sm },
  branchList: { marginTop: spacing.md },
  branchListTitle: { ...typography.bodySmall, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  emptyBranches: { ...typography.caption, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.sm },
  branchCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5,
    borderColor: colors.border, marginBottom: spacing.sm,
  },
  branchCardActive: { borderColor: colors.primary[600], backgroundColor: colors.primary[50] },
  branchIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary[50],
    alignItems: 'center', justifyContent: 'center',
  },
  branchName: { ...typography.bodySmall, fontWeight: '700', color: colors.text },
  branchAddress: { ...typography.caption, color: colors.textSecondary },
  branchPhone: { ...typography.caption, color: colors.textMuted },
  radioOuter: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.neutral[300],
    alignItems: 'center', justifyContent: 'center',
  },
  radioInner: { width: 0, height: 0 },
  radioSelected: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.primary[600] },
  deliveryOptions: { gap: spacing.sm, marginBottom: spacing.md },
  deliveryOption: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border },
  deliveryOptionActive: { borderColor: colors.primary[600], backgroundColor: colors.primary[50] },
  slotList: { gap: spacing.sm, paddingVertical: spacing.xs },
  slotChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  slotChipActive: { borderColor: colors.primary[600], backgroundColor: colors.primary[50] },
  slotText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  slotTextActive: { color: colors.primary[700] },
  paymentInfoBox: {
    backgroundColor: colors.primary[50], borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.md,
  },
  paymentInfoText: { ...typography.caption, color: colors.primary[700], fontWeight: '600' },
  walletCard: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.md,
    borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.primary[600],
    backgroundColor: colors.primary[50], marginBottom: spacing.md,
  },
  walletBalance: { ...typography.h4, fontWeight: '700', color: colors.success[700] },
  walletBalanceLow: { color: colors.warning[600] },
  warningBox: {
    flexDirection: 'row', alignItems: 'center', marginTop: spacing.md,
    backgroundColor: colors.warning[50], borderRadius: radius.md, padding: spacing.md,
  },
  warningText: { ...typography.caption, color: colors.warning[700], fontWeight: '600' },
  topupLink: { ...typography.caption, color: colors.primary[600], fontWeight: '800' },
  optionLabel: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  optionDesc: { ...typography.caption, color: colors.textMuted },
  summaryItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: spacing.md },
  summaryItemName: { flex: 1, ...typography.bodySmall, color: colors.text },
  summaryItemPrice: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  summaryLabel: { ...typography.bodySmall, color: colors.textSecondary },
  summaryValue: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  totalRow: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  totalLabel: { ...typography.h4, color: colors.text },
  totalValue: { ...typography.h4, fontWeight: '700', color: colors.primary[600] },
  upfrontLabel: { ...typography.bodySmall, fontWeight: '700', color: colors.success[700] },
  upfrontValue: { ...typography.bodySmall, fontWeight: '700', color: colors.success[700] },
  remainingLabel: { ...typography.bodySmall, fontWeight: '600', color: colors.warning[600] },
  remainingValue: { ...typography.bodySmall, fontWeight: '600', color: colors.warning[600] },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.md,
  },
  bottomBarInfo: {},
  bottomBarLabel: { ...typography.caption, color: colors.textMuted, fontWeight: '600' },
  bottomBarAmount: { ...typography.h4, color: colors.success[700], fontWeight: '700' },
});
