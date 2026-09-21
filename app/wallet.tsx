import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Modal,
  FlatList,
  RefreshControl,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import {
  ChevronLeft,
  Wallet,
  Plus,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  X,
  Smartphone,
  Building2,
  Send,
  Banknote,
  Copy,
  Upload,
  CheckCircle2,
  XCircle,
  Hourglass,
  ChevronRight,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { LoadingState } from '@/components/LoadingState';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import { ArabicText as Text, ArabicTextInput as TextInput } from '@/components/ArabicText';
import { pickImage, uploadToCloudinary } from '@/lib/cloudinary';
import { formatSyp } from '@/lib/currency';

type WalletData = {
  id: string;
  available_balance: number;
  pending_balance: number;
  total_earned: number;
  total_withdrawn: number;
};

type Transaction = {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  status: string;
  created_at: string;
};

type PaymentMethod = {
  id: string;
  name: string;
  type: string;
  provider: string | null;
  instructions: string | null;
  account_name: string | null;
  account_number: string | null;
  extra_info: string | null;
  logo_url: string | null;
  min_amount: number | null;
  max_amount: number | null;
  is_active: boolean;
  sort_order: number;
};

type TopupRequest = {
  id: string;
  method_name: string;
  amount: number;
  transfer_reference: string | null;
  receipt_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  credited_amount: number | null;
  admin_note: string | null;
  rejection_reason: string | null;
  created_at: string;
};

const METHOD_ICON = (type: string, size = 20, color = colors.primary[600]) => {
  switch (type) {
    case 'bank':
      return <Building2 size={size} color={color} />;
    case 'transfer':
      return <Send size={size} color={color} />;
    case 'cash':
      return <Banknote size={size} color={color} />;
    default:
      return <Smartphone size={size} color={color} />;
  }
};

type Step = 'methods' | 'instructions' | 'form' | 'success';

export default function CustomerWalletScreen() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [requests, setRequests] = useState<TopupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Top-up flow state
  const [showTopUp, setShowTopUp] = useState(false);
  const [step, setStep] = useState<Step>('methods');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [senderName, setSenderName] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;

    const { data: w } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    setWallet(w as WalletData | null);

    if (w) {
      const { data: txs } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('wallet_id', (w as WalletData).id)
        .order('created_at', { ascending: false })
        .limit(50);
      setTransactions((txs as Transaction[]) ?? []);
    } else {
      setTransactions([]);
    }

    const { data: pm } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    setMethods((pm as PaymentMethod[]) ?? []);

    const { data: reqs } = await supabase
      .from('wallet_topup_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    setRequests((reqs as TopupRequest[]) ?? []);
  }, [user]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === 'pending').length,
    [requests]
  );

  const resetFlow = () => {
    setStep('methods');
    setSelectedMethod(null);
    setAmount('');
    setReference('');
    setSenderName('');
    setCustomerNote('');
    setReceiptUrl(null);
    setFormError(null);
    setCopied(false);
  };

  const openTopUp = () => {
    resetFlow();
    setShowTopUp(true);
  };

  const closeTopUp = () => {
    setShowTopUp(false);
    resetFlow();
  };

  const chooseMethod = (m: PaymentMethod) => {
    setSelectedMethod(m);
    setStep('instructions');
  };

  const copyAccount = async () => {
    if (!selectedMethod?.account_number) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(selectedMethod.account_number);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard access is best-effort only
    }
  };

  const handlePickReceipt = async () => {
    setFormError(null);
    try {
      setUploading(true);
      const uri = await pickImage(false);
      if (!uri) return;
      const uploaded = await uploadToCloudinary(uri, 'image');
      setReceiptUrl(uploaded.secure_url);
    } catch (e: any) {
      setFormError(e?.message ?? 'تعذّر رفع صورة الإيصال');
    } finally {
      setUploading(false);
    }
  };

  const ensureWallet = async (): Promise<WalletData | null> => {
    if (!user) return null;
    if (wallet) return wallet;
    const { data: newWallet } = await supabase
      .from('wallets')
      .insert({ user_id: user.id })
      .select()
      .maybeSingle();
    const w = newWallet as WalletData | null;
    setWallet(w);
    return w;
  };

  const handleSubmitRequest = async () => {
    setFormError(null);

    const value = parseFloat(amount.replace(',', '.'));
    if (!selectedMethod) {
      setFormError('يرجى اختيار طريقة الشحن');
      return;
    }
    if (!value || value <= 0 || Number.isNaN(value)) {
      setFormError('يرجى إدخال مبلغ صحيح');
      return;
    }
    if (selectedMethod.min_amount != null && value < Number(selectedMethod.min_amount)) {
      setFormError(`الحد الأدنى للشحن هو ${selectedMethod.min_amount}`);
      return;
    }
    if (selectedMethod.max_amount != null && value > Number(selectedMethod.max_amount)) {
      setFormError(`الحد الأعلى للشحن هو ${selectedMethod.max_amount}`);
      return;
    }
    if (!reference.trim() && !receiptUrl) {
      setFormError('يرجى إدخال رقم عملية التحويل أو رفع صورة الإيصال');
      return;
    }

    setSubmitting(true);
    try {
      await ensureWallet();

      const { error } = await supabase.from('wallet_topup_requests').insert({
        user_id: user!.id,
        payment_method_id: selectedMethod.id,
        method_name: selectedMethod.name,
        method_account: selectedMethod.account_number,
        amount: value,
        currency: 'SYP',
        transfer_reference: reference.trim() || null,
        receipt_url: receiptUrl,
        sender_name: senderName.trim() || null,
        customer_note: customerNote.trim() || null,
        status: 'pending',
      });
      if (error) throw error;

      setStep('success');
      await load();
    } catch (e: any) {
      setFormError(e?.message ?? 'تعذّر إرسال الطلب، يرجى المحاولة مرة أخرى');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState />;

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>My Wallet</Text>
          <View style={{ width: 40 }} />
        </View>
        <EmptyState
          icon={<Wallet size={64} color={colors.neutral[300]} />}
          title="Sign in required"
          message="Sign in to access your wallet"
        />
      </SafeAreaView>
    );
  }

  const formatType = (type: string) => {
    const labels: Record<string, string> = {
      credit: 'Credit', debit: 'Debit', pending_credit: 'Pending Credit',
      pending_release: 'Released', withdrawal: 'Withdrawal',
      adjustment: 'Adjustment', topup: 'Top Up', payment: 'Payment',
      refund: 'Refund',
    };
    return labels[type] ?? type;
  };

  const isCredit = (type: string) =>
    ['credit', 'pending_credit', 'pending_release', 'topup', 'refund'].includes(type);

  const statusMeta = (status: TopupRequest['status']) => {
    if (status === 'approved') {
      return { label: 'تمت الموافقة', color: colors.success[700], bg: colors.success[50], icon: <CheckCircle2 size={16} color={colors.success[700]} /> };
    }
    if (status === 'rejected') {
      return { label: 'مرفوض', color: colors.error[600], bg: colors.error[50], icon: <XCircle size={16} color={colors.error[600]} /> };
    }
    return { label: 'قيد المراجعة', color: colors.warning[700], bg: colors.warning[50], icon: <Hourglass size={16} color={colors.warning[700]} /> };
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>My Wallet</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={openTopUp}>
          <Plus size={24} color={colors.primary[600]} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <Wallet size={24} color={colors.white} />
            <Text style={styles.balanceTitle}>Available Balance</Text>
          </View>
          <Text style={styles.balanceAmount}>
            {formatSyp(wallet?.available_balance ?? 0)}
          </Text>
          <View style={styles.balanceSubRow}>
            <View style={styles.balanceSubItem}>
              <Text style={styles.balanceSubLabel}>Pending</Text>
              <Text style={styles.balanceSubValue}>{formatSyp(wallet?.pending_balance ?? 0)}</Text>
            </View>
            <View style={styles.balanceSubItem}>
              <Text style={styles.balanceSubLabel}>طلبات شحن قيد المراجعة</Text>
              <Text style={styles.balanceSubValue}>{pendingCount}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.topUpBtn} onPress={openTopUp}>
            <Plus size={18} color={colors.primary[600]} />
            <Text style={styles.topUpBtnText}>شحن المحفظة</Text>
          </TouchableOpacity>
        </View>

        {/* Top-up requests */}
        <View style={styles.transactionsSection}>
          <Text style={styles.sectionTitle}>طلبات شحن المحفظة</Text>
          {requests.length === 0 ? (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                لا توجد طلبات شحن بعد. اضغط على «شحن المحفظة» لاختيار طريقة الدفع وإرسال طلبك.
              </Text>
            </View>
          ) : (
            requests.map((r) => {
              const meta = statusMeta(r.status);
              return (
                <View key={r.id} style={styles.reqCard}>
                  <View style={styles.reqTop}>
                    <Text style={styles.reqMethod}>{r.method_name}</Text>
                    <View style={[styles.statusTag, { backgroundColor: meta.bg }]}>
                      {meta.icon}
                      <Text style={[styles.statusTagText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.reqAmount}>
                    {formatSyp(r.amount)}
                  </Text>
                  {r.transfer_reference ? (
                    <Text style={styles.reqMeta}>رقم العملية: {r.transfer_reference}</Text>
                  ) : null}
                  {r.status === 'approved' && r.credited_amount != null ? (
                    <Text style={[styles.reqMeta, { color: colors.success[700] }]}>
                      تم إضافة {formatSyp(Number(r.credited_amount))} إلى محفظتك
                    </Text>
                  ) : null}
                  {r.admin_note ? <Text style={styles.reqMeta}>ملاحظة الإدارة: {r.admin_note}</Text> : null}
                  {r.status === 'rejected' ? (
                    <Text style={[styles.reqMeta, { color: colors.error[600] }]}>
                      سبب الرفض: {r.rejection_reason || 'غير محدد'}
                    </Text>
                  ) : null}
                  <Text style={styles.reqDate}>
                    {new Date(r.created_at).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {/* Transactions */}
        <View style={styles.transactionsSection}>
          <Text style={styles.sectionTitle}>Transaction History</Text>
          {transactions.length === 0 ? (
            <EmptyState
              icon={<Clock size={48} color={colors.neutral[300]} />}
              title="No transactions yet"
              message="Top up your wallet to start using it for payments"
            />
          ) : (
            <FlatList
              data={transactions}
              keyExtractor={item => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.txCard}>
                  <View style={[
                    styles.txIcon,
                    { backgroundColor: isCredit(item.type) ? colors.success[50] : colors.error[50] },
                  ]}>
                    {isCredit(item.type) ? (
                      <ArrowDownCircle size={20} color={colors.success[700]} />
                    ) : (
                      <ArrowUpCircle size={20} color={colors.error[500]} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txType}>{formatType(item.type)}</Text>
                    <Text style={styles.txDesc} numberOfLines={2}>{item.description ?? ''}</Text>
                    <Text style={styles.txDate}>
                      {new Date(item.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[
                      styles.txAmount,
                      { color: isCredit(item.type) ? colors.success[700] : colors.error[500] },
                    ]}>
                      {isCredit(item.type) ? '+' : '-'}{formatSyp(Number(item.amount))}
                    </Text>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      </ScrollView>

      {/* Top Up Modal */}
      <Modal visible={showTopUp} transparent animationType="fade" onRequestClose={closeTopUp}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {step === 'methods' && 'طرق الشحن المتاحة'}
                {step === 'instructions' && 'تعليمات الدفع'}
                {step === 'form' && 'تأكيد التحويل'}
                {step === 'success' && 'تم إرسال الطلب'}
              </Text>
              <TouchableOpacity onPress={closeTopUp}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingBottom: spacing.sm }}>
              {/* STEP 1 — choose a method */}
              {step === 'methods' ? (
                methods.length === 0 ? (
                  <View style={styles.infoBox}>
                    <Text style={styles.infoText}>
                      لا توجد طرق شحن متاحة حالياً. يرجى المحاولة لاحقاً أو التواصل مع الدعم.
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: spacing.sm }}>
                    {methods.map((m) => (
                      <TouchableOpacity
                        key={m.id}
                        style={styles.methodRow}
                        onPress={() => chooseMethod(m)}
                        activeOpacity={0.85}
                      >
                        <View style={styles.methodIconWrap}>
                          {m.logo_url ? (
                            <Image source={{ uri: m.logo_url }} style={styles.methodLogo} />
                          ) : (
                            METHOD_ICON(m.type)
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.methodName}>{m.name}</Text>
                          {m.provider ? <Text style={styles.methodProvider}>{m.provider}</Text> : null}
                        </View>
                        <ChevronRight size={20} color={colors.textMuted} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )
              ) : null}

              {/* STEP 2 — instructions + payment address */}
              {step === 'instructions' && selectedMethod ? (
                <View style={{ gap: spacing.md }}>
                  <View style={styles.methodRowStatic}>
                    <View style={styles.methodIconWrap}>{METHOD_ICON(selectedMethod.type)}</View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.methodName}>{selectedMethod.name}</Text>
                      {selectedMethod.provider ? (
                        <Text style={styles.methodProvider}>{selectedMethod.provider}</Text>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.instructionsBox}>
                    <Text style={styles.blockLabel}>تعليمات الدفع</Text>
                    <Text style={styles.instructionsText}>
                      {selectedMethod.instructions || 'يرجى تحويل المبلغ إلى عنوان الدفع الموضح أدناه ثم تأكيد العملية.'}
                    </Text>
                  </View>

                  <View style={styles.accountBox}>
                    <Text style={styles.blockLabel}>عنوان الدفع</Text>
                    <Text style={styles.accountNumber} selectable>
                      {selectedMethod.account_number || 'يرجى التواصل مع الدعم'}
                    </Text>
                    {selectedMethod.account_name ? (
                      <Text style={styles.accountName}>باسم: {selectedMethod.account_name}</Text>
                    ) : null}
                    {selectedMethod.extra_info ? (
                      <Text style={styles.accountName}>{selectedMethod.extra_info}</Text>
                    ) : null}
                    {selectedMethod.account_number ? (
                      <TouchableOpacity style={styles.copyBtn} onPress={copyAccount}>
                        <Copy size={16} color={colors.primary[600]} />
                        <Text style={styles.copyBtnText}>{copied ? 'تم النسخ' : 'نسخ العنوان'}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  <Text style={styles.hintText}>
                    يرجى تحويل المبلغ إلى هذا الحساب، ثم المتابعة لإدخال المبلغ ورقم عملية التحويل أو صورة الإيصال.
                  </Text>

                  <Button title="تابعت التحويل — متابعة" onPress={() => setStep('form')} fullWidth size="lg" />
                  <Button title="اختيار طريقة أخرى" onPress={() => setStep('methods')} variant="outline" fullWidth />
                </View>
              ) : null}

              {/* STEP 3 — amount + reference / receipt */}
              {step === 'form' && selectedMethod ? (
                <View style={{ gap: spacing.sm }}>
                  <View style={styles.methodRowStatic}>
                    <View style={styles.methodIconWrap}>{METHOD_ICON(selectedMethod.type)}</View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.methodName}>{selectedMethod.name}</Text>
                      <Text style={styles.methodProvider}>
                        {selectedMethod.account_number || ''}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.label}>المبلغ المحوَّل</Text>
                  <View style={styles.customAmountRow}>
                    <TextInput
                      style={styles.customInput}
                      value={amount}
                      onChangeText={setAmount}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>

                  <Text style={styles.hintText}>العملة: ليرة سورية</Text>

                  <Text style={styles.label}>رقم عملية التحويل</Text>
                  <View style={styles.customAmountRow}>
                    <TextInput
                      style={styles.textInput}
                      value={reference}
                      onChangeText={setReference}
                      placeholder="أدخل رقم عملية التحويل"
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>

                  <Text style={styles.label}>أو ارفع صورة إثبات التحويل / الإيصال</Text>
                  {receiptUrl ? (
                    <View style={styles.receiptPreviewWrap}>
                      <Image source={{ uri: receiptUrl }} style={styles.receiptPreview} />
                      <TouchableOpacity style={styles.removeReceipt} onPress={() => setReceiptUrl(null)}>
                        <X size={16} color={colors.white} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.uploadBox}
                      onPress={handlePickReceipt}
                      disabled={uploading}
                      activeOpacity={0.85}
                    >
                      {uploading ? (
                        <ActivityIndicator color={colors.primary[600]} />
                      ) : (
                        <>
                          <Upload size={22} color={colors.primary[600]} />
                          <Text style={styles.uploadText}>رفع صورة الإيصال</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}

                  <Text style={styles.label}>اسم المُحوِّل (اختياري)</Text>
                  <View style={styles.customAmountRow}>
                    <TextInput
                      style={styles.textInput}
                      value={senderName}
                      onChangeText={setSenderName}
                      placeholder="الاسم الذي تم التحويل منه"
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>

                  <Text style={styles.label}>ملاحظة (اختياري)</Text>
                  <View style={styles.customAmountRow}>
                    <TextInput
                      style={[styles.textInput, { minHeight: 60, textAlignVertical: 'top' }]}
                      value={customerNote}
                      onChangeText={setCustomerNote}
                      placeholder="أي تفاصيل إضافية تود إخبار الإدارة بها"
                      placeholderTextColor={colors.textMuted}
                      multiline
                    />
                  </View>

                  {formError ? (
                    <View style={styles.errorBanner}>
                      <Text style={styles.errorBannerText}>{formError}</Text>
                    </View>
                  ) : null}

                  <Button
                    title={submitting ? 'جارٍ الإرسال…' : 'تأكيد'}
                    onPress={handleSubmitRequest}
                    loading={submitting}
                    fullWidth
                    size="lg"
                  />
                  <Button title="رجوع" onPress={() => setStep('instructions')} variant="outline" fullWidth />
                </View>
              ) : null}

              {/* STEP 4 — success */}
              {step === 'success' ? (
                <View style={styles.successWrap}>
                  <View style={styles.successIcon}>
                    <CheckCircle2 size={44} color={colors.success[700]} />
                  </View>
                  <Text style={styles.successTitle}>تم إرسال طلب الشحن</Text>
                  <Text style={styles.successMsg}>
                    سنراجع الدفعة ونضيفها إلى حسابك في غضون أقل من 30 دقيقة.
                  </Text>
                  <View style={{ width: '100%', marginTop: spacing.lg }}>
                    <Button title="حسناً" onPress={closeTopUp} fullWidth size="lg" />
                  </View>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
  balanceCard: {
    margin: spacing.md, backgroundColor: colors.primary[600], borderRadius: radius.xl,
    padding: spacing.lg, ...shadows.lg,
  },
  balanceHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  balanceTitle: { ...typography.bodySmall, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  balanceAmount: { ...typography.h1, color: colors.white, fontWeight: '700', marginBottom: spacing.md },
  balanceSubRow: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.lg },
  balanceSubItem: { flex: 1 },
  balanceSubLabel: { ...typography.caption, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  balanceSubValue: { ...typography.bodySmall, color: colors.white, fontWeight: '600' },
  topUpBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.white, paddingVertical: spacing.md, borderRadius: radius.md,
  },
  topUpBtnText: { ...typography.button, color: colors.primary[600], fontWeight: '700' },
  transactionsSection: { paddingHorizontal: spacing.md, marginBottom: spacing.md },
  sectionTitle: { ...typography.h4, color: colors.text, fontWeight: '700', marginBottom: spacing.md },
  txCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.sm, ...shadows.sm,
  },
  txIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  txType: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  txDesc: { ...typography.caption, color: colors.textMuted },
  txDate: { ...typography.caption, color: colors.textMuted, fontSize: 10 },
  txAmount: { ...typography.bodySmall, fontWeight: '700' },

  // Requests
  reqCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.sm, gap: 4, ...shadows.sm,
  },
  reqTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  reqMethod: { ...typography.bodySmall, fontWeight: '700', color: colors.text },
  reqAmount: { ...typography.body, fontWeight: '700', color: colors.text },
  reqMeta: { ...typography.caption, color: colors.textSecondary },
  reqDate: { ...typography.caption, color: colors.textMuted, fontSize: 10 },
  statusTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full,
  },
  statusTagText: { ...typography.caption, fontWeight: '700' },

  // Modal
  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.lg,
  },
  modalContent: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { ...typography.h4, color: colors.text, fontWeight: '700', flex: 1 },
  label: { ...typography.bodySmall, fontWeight: '600', color: colors.text, marginBottom: spacing.sm, marginTop: spacing.sm },
  hintText: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },

  methodRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, backgroundColor: colors.background,
  },
  methodRowStatic: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.neutral[100],
  },
  methodIconWrap: {
    width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.primary[50],
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  methodLogo: { width: 42, height: 42, resizeMode: 'cover' },
  methodName: { ...typography.bodySmall, fontWeight: '700', color: colors.text },
  methodProvider: { ...typography.caption, color: colors.textMuted },

  instructionsBox: {
    backgroundColor: colors.neutral[50], borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, gap: 6,
  },
  instructionsText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 22 },
  blockLabel: { ...typography.caption, fontWeight: '700', color: colors.textMuted },
  accountBox: {
    backgroundColor: colors.primary[50], borderRadius: radius.md, padding: spacing.md, gap: 6,
  },
  accountNumber: { ...typography.h4, color: colors.text, fontWeight: '700' },
  accountName: { ...typography.caption, color: colors.textSecondary },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: colors.white, paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.md, marginTop: 4,
  },
  copyBtnText: { ...typography.caption, color: colors.primary[600], fontWeight: '700' },

  currencyRow: { flexDirection: 'row', gap: spacing.sm },
  currencyChip: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.background,
  },
  currencyChipActive: { borderColor: colors.primary[600], backgroundColor: colors.primary[50] },
  currencyChipText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  currencyChipTextActive: { color: colors.primary[700], fontWeight: '700' },

  customAmountRow: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: colors.background,
  },
  customInput: { flex: 1, paddingVertical: spacing.md, ...typography.h4, color: colors.text },
  textInput: { flex: 1, paddingVertical: spacing.md, ...typography.bodySmall, color: colors.text },

  uploadBox: {
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary[300],
    borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center',
    justifyContent: 'center', gap: 6, backgroundColor: colors.primary[50],
  },
  uploadText: { ...typography.caption, color: colors.primary[700], fontWeight: '700' },
  receiptPreviewWrap: { position: 'relative', borderRadius: radius.md, overflow: 'hidden' },
  receiptPreview: { width: '100%', height: 180, resizeMode: 'cover' },
  removeReceipt: {
    position: 'absolute', top: 8, left: 8, width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },

  infoBox: {
    backgroundColor: colors.primary[50], borderRadius: radius.md, padding: spacing.md,
  },
  infoText: { ...typography.caption, color: colors.textSecondary, lineHeight: 20 },
  errorBanner: {
    backgroundColor: colors.error[50], borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.error[200],
  },
  errorBannerText: { ...typography.caption, color: colors.error[700] },

  successWrap: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  successIcon: {
    width: 76, height: 76, borderRadius: 38, backgroundColor: colors.success[50],
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  successTitle: { ...typography.h4, color: colors.text, fontWeight: '700', textAlign: 'center' },
  successMsg: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
});
