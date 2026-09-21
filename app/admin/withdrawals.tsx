import { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import {
  ChevronLeft,
  Wallet,
  Shield,
  Check,
  X,
  Banknote,
  Clock,
  Search,
  X as XIcon,
  Smartphone,
  Building2,
  Users,
  DollarSign,
  CheckCircle2,
  CreditCard,
  Copy,
  FileText,
  TrendingUp,
  Link2,
} from 'lucide-react-native';
import { Platform } from 'react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text, ArabicTextInput as TextInputArabic } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';

const ADMIN_API_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/admin-api`;

type PaymentMethod = 'sham_cash' | 'syriatel_cash' | 'bank';

const METHOD_LABELS: Record<string, string> = {
  sham_cash: 'شام كاش',
  syriatel_cash: 'سيريتيل كاش',
  bank: 'تحويل بنكي',
};

type EligiblePublisher = {
  user_id: string;
  full_name: string | null;
  available_balance: number;
  min_threshold: number;
  payment_method: PaymentMethod;
  account_details: Record<string, string>;
};

type RecentPayment = {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  invoice_number: string | null;
  created_at: string;
  profile?: { full_name: string | null } | null;
};

type PayoutOverview = {
  user_id: string;
  profile: { full_name: string | null; phone: string | null; role: string | null; ref_code: string | null };
  wallet: {
    available_balance: number;
    pending_balance: number;
    total_earned: number;
    total_withdrawn: number;
  };
  settings: { min_threshold: number; payment_method: string; account_details: Record<string, string> } | null;
  withdrawals: {
    id: string;
    amount: number;
    status: string;
    payment_info: string | null;
    admin_notes: string | null;
    invoice_number: string | null;
    invoice_token: string | null;
    created_at: string;
    processed_at: string | null;
  }[];
  transactions: {
    id: string;
    type: string;
    amount: number;
    status: string;
    description: string | null;
    created_at: string;
  }[];
  affiliate_links: {
    id: string;
    affiliate_code: string;
    product_name: string | null;
    clicks_count: number;
    purchases_count: number;
    total_earnings: number;
  }[];
};

/** نسخ نص إلى الحافظة بدون إضافة مكتبات جديدة (يعمل على الويب والموبايل). */
async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {}
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-clipboard');
    if (mod?.setStringAsync) {
      await mod.setStringAsync(value);
      return true;
    }
  } catch {}
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Clipboard } = require('react-native');
    if (Clipboard?.setString) {
      Clipboard.setString(value);
      return true;
    }
  } catch {}
  return false;
}

const ACCOUNT_KEY_LABELS: Record<string, string> = {
  phone: 'رقم الهاتف',
  bank_name: 'اسم البنك',
  account_number: 'رقم الحساب',
  account_holder: 'صاحب الحساب',
  wallet_address: 'عنوان المحفظة',
  iban: 'IBAN',
};

/** صف معلومة قابلة للنسخ */
function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      Alert.alert(label, value);
    }
  };
  return (
    <TouchableOpacity style={styles.copyRow} onPress={onCopy} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <Text style={styles.copyLabel}>{label}</Text>
        <Text style={styles.copyValue} selectable>
          {value}
        </Text>
      </View>
      {copied ? (
        <Check size={16} color={colors.success[600]} />
      ) : (
        <Copy size={16} color={colors.primary[600]} />
      )}
    </TouchableOpacity>
  );
}

function PaymentDetails({ method, details }: { method: string; details: Record<string, string> }) {
  const isBank = method === 'bank';
  return (
    <View style={payStyles.container}>
      <View style={payStyles.methodRow}>
        {isBank ? (
          <Building2 size={13} color={colors.primary[600]} />
        ) : (
          <Smartphone size={13} color={colors.primary[600]} />
        )}
        <Text style={payStyles.methodLabel}>{METHOD_LABELS[method] ?? method}</Text>
      </View>
      {Object.entries(details).map(([key, val]) => (
        <View key={key} style={payStyles.row}>
          <Text style={payStyles.key}>
            {key === 'phone'
              ? 'Phone'
              : key === 'bank_name'
              ? 'Bank'
              : key === 'account_number'
              ? 'Account No.'
              : key === 'account_holder'
              ? 'Holder'
              : key}
          </Text>
          <Text style={payStyles.val}>{String(val)}</Text>
        </View>
      ))}
    </View>
  );
}

const payStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.primary[50],
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  methodLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primary[700],
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  key: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  val: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
  },
});

export default function AdminWithdrawalsScreen() {
  const { user, isAdmin } = useAuth();
  const [eligible, setEligible] = useState<EligiblePublisher[]>([]);
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [paying, setPaying] = useState(false);

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');

  // ── تفاصيل حساب ناشر واحد + سحب بمبلغ محدد ──────────────
  const [detailUser, setDetailUser] = useState<EligiblePublisher | null>(null);
  const [overview, setOverview] = useState<PayoutOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payingOne, setPayingOne] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [tab, setTab] = useState<'withdrawals' | 'earnings' | 'links'>('withdrawals');

  const getAuthToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      // 0. المسار الأساسي: دالة الأدمن التي تتجاوز قيود RLS وتعيد
      //    كل ناشر وصل رصيده للحد الأدنى الذي حدّده بنفسه.
      const rpc = await supabase.rpc('admin_list_payout_candidates');
      if (!rpc.error && Array.isArray(rpc.data)) {
        const list: EligiblePublisher[] = (rpc.data as any[]).map((r) => ({
          user_id: r.user_id,
          full_name: r.full_name ?? null,
          available_balance: Number(r.available_balance ?? 0),
          min_threshold: Number(r.min_threshold ?? 0),
          payment_method: r.payment_method as PaymentMethod,
          account_details: r.account_details ?? {},
        }));
        setEligible(list.sort((a, b) => b.available_balance - a.available_balance));

        const { data: paidData } = await supabase
          .from('withdrawal_requests')
          .select('id, user_id, amount, status, invoice_number, created_at, profile:profiles(full_name)')
          .eq('status', 'paid')
          .order('created_at', { ascending: false })
          .limit(20);
        setRecentPayments((paidData ?? []) as unknown as RecentPayment[]);
        return;
      }

      // 1. Load publishers who have withdrawal_settings (fallback)
      const { data: settingsData, error: settingsErr } = await supabase
        .from('withdrawal_settings')
        .select('user_id, min_threshold, payment_method, account_details');

      if (settingsErr) throw settingsErr;
      if (!settingsData || settingsData.length === 0) {
        setEligible([]);
        return;
      }

      const userIds = settingsData.map((s: any) => s.user_id);

      // 2. Load their wallets + profiles in parallel
      const [walletsRes, profilesRes] = await Promise.all([
        supabase
          .from('wallets')
          .select('user_id, available_balance')
          .in('user_id', userIds),
        supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds),
      ]);

      if (walletsRes.error) throw walletsRes.error;
      if (profilesRes.error) throw profilesRes.error;

      const walletMap: Record<string, number> = {};
      (walletsRes.data ?? []).forEach((w: any) => {
        walletMap[w.user_id] = w.available_balance ?? 0;
      });

      const profileMap: Record<string, string | null> = {};
      (profilesRes.data ?? []).forEach((p: any) => {
        profileMap[p.id] = p.full_name;
      });

      // 3. Filter: balance >= threshold
      const eligibleList: EligiblePublisher[] = (settingsData as any[])
        .map((s) => ({
          user_id: s.user_id,
          full_name: profileMap[s.user_id] ?? null,
          available_balance: walletMap[s.user_id] ?? 0,
          min_threshold: s.min_threshold,
          payment_method: s.payment_method as PaymentMethod,
          account_details: s.account_details ?? {},
        }))
        .filter((p) => p.available_balance >= p.min_threshold)
        .sort((a, b) => b.available_balance - a.available_balance);

      setEligible(eligibleList);

      // 4. Load recent payments (paid withdrawal_requests for publishers)
      const { data: paymentsData } = await supabase
        .from('withdrawal_requests')
        .select('id, user_id, amount, status, invoice_number, created_at, profile:profiles(full_name)')
        .eq('status', 'paid')
        .order('created_at', { ascending: false })
        .limit(20);

      setRecentPayments((paymentsData ?? []) as unknown as RecentPayment[]);
    } catch (e: any) {
      setError(e.message || 'Failed to load publisher data');
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const fmtMoney = (n: number) =>
    `${Math.round(Number(n || 0)).toLocaleString('en-US')} ل.س`;

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const toggleSelect = (uid: string) => {
    setSelectedIds((prev) =>
      prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]
    );
  };

  const selectAll = () => {
    setSelectedIds(filtered.map((p) => p.user_id));
  };

  const deselectAll = () => setSelectedIds([]);

  const openDetail = async (pub: EligiblePublisher) => {
    setDetailUser(pub);
    setOverview(null);
    setOverviewError(null);
    setShowAccount(false);
    setTab('withdrawals');
    setPayNotes('');
    setPayAmount(String(Number(pub.available_balance ?? 0).toFixed(2)));
    setOverviewLoading(true);
    const { data, error: rpcErr } = await supabase.rpc('admin_publisher_payout_overview', {
      p_user_id: pub.user_id,
    });
    if (rpcErr) {
      setOverviewError(rpcErr.message);
    } else {
      setOverview(data as unknown as PayoutOverview);
    }
    setOverviewLoading(false);
  };

  const closeDetail = () => {
    if (payingOne) return;
    setDetailUser(null);
    setOverview(null);
  };

  /** تنفيذ السحب بالمبلغ الذي يحدده الأدمن وخصمه من رصيد الناشر */
  const handlePayOne = async () => {
    if (!detailUser) return;
    const amount = Number(payAmount);
    const balance = Number(overview?.wallet.available_balance ?? detailUser.available_balance ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('مبلغ غير صحيح', 'الرجاء إدخال مبلغ أكبر من صفر.');
      return;
    }
    if (amount > balance + 0.0001) {
      Alert.alert('المبلغ أكبر من الرصيد', `الرصيد المتاح هو ${fmtMoney(balance)} فقط.`);
      return;
    }
    const method = overview?.settings?.payment_method ?? detailUser.payment_method;
    Alert.alert(
      'تأكيد السحب',
      `سيتم خصم ${fmtMoney(amount)} من رصيد ${detailUser.full_name ?? 'الناشر'}` +
        ` وإصدار فاتورة موقّعة بـ QR.\nطريقة الاستلام: ${METHOD_LABELS[method] ?? method}` +
        `\nتأكد من إرسال المبلغ يدوياً إلى العنوان المحدد.`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تأكيد',
          onPress: async () => {
            setPayingOne(true);
            const { data, error: payErr } = await supabase.rpc('admin_pay_withdrawal', {
              p_user_id: detailUser.user_id,
              p_amount: amount,
              p_notes: payNotes.trim() || null,
            });
            setPayingOne(false);
            if (payErr) {
              Alert.alert('فشل تنفيذ السحب', payErr.message);
              return;
            }
            const res = data as any;
            await load();
            await openDetail({
              ...detailUser,
              available_balance: Number(res?.available_balance ?? 0),
            });
            Alert.alert(
              'تم تنفيذ السحب',
              `المبلغ: ${fmtMoney(Number(res?.amount ?? amount))}\nرقم الفاتورة: ${
                res?.invoice_number ?? '—'
              }\nالرصيد المتبقي: ${fmtMoney(Number(res?.available_balance ?? 0))}`,
              [
                { text: 'حسناً' },
                ...(res?.withdrawal_id
                  ? [
                      {
                        text: 'عرض الفاتورة',
                        onPress: () =>
                          router.push(`/invoice/${res.withdrawal_id}?kind=withdrawal`),
                      },
                    ]
                  : []),
              ]
            );
          },
        },
      ]
    );
  };

  const handlePaySelected = () => {
    if (selectedIds.length === 0) return;
    setAdminNotes('');
    setConfirmModal(true);
  };

  const processPayments = async () => {
    if (selectedIds.length === 0) return;
    setPaying(true);
    setConfirmModal(false);

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const uid of selectedIds) {
      const publisher = eligible.find((p) => p.user_id === uid);
      if (!publisher) continue;
      try {
        // الدفع الكامل للرصيد المتاح عبر دالة الأدمن:
        // تُنشئ الفاتورة، تخصم الرصيد، تسجّل الحركة وتُشعر الناشر.
        const { error: rpcErr } = await supabase.rpc('admin_pay_withdrawal', {
          p_user_id: uid,
          p_amount: publisher.available_balance,
          p_notes: adminNotes.trim() || null,
        });
        if (rpcErr) throw new Error(rpcErr.message);
        successCount++;
      } catch (e: any) {
        failCount++;
        errors.push(`${publisher.full_name ?? uid}: ${e.message}`);
      }
    }

    setPaying(false);
    setSelectedIds([]);
    await load();

    Alert.alert(
      'Payout Complete',
      `✅ Paid: ${successCount}\n❌ Failed: ${failCount}${
        errors.length ? '\n\nErrors:\n' + errors.slice(0, 5).join('\n') : ''
      }`
    );
  };

  // ── Filtering ─────────────────────────────────────────────────
  const filtered = eligible.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (p.full_name ?? '').toLowerCase().includes(q);
  });

  const totalSelectedAmount = selectedIds.reduce((sum, uid) => {
    const p = eligible.find((e) => e.user_id === uid);
    return sum + (p?.available_balance ?? 0);
  }, 0);

  // ── Access guard ──────────────────────────────────────────────
  if (!user || !isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Publisher Payouts</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.accessGuard}>
          <Shield size={64} color={colors.neutral[300]} />
          <Text style={styles.accessTitle}>Admin Access Required</Text>
          <Text style={styles.accessMsg}>
            You need administrator privileges to manage payouts.
          </Text>
          <View style={{ marginTop: spacing.lg, width: '100%' }}>
            <Button title="Back to Home" onPress={() => router.replace('/(tabs)/index')} fullWidth />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Publisher Payouts</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={styles.loadingText}>Loading publisher accounts…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && eligible.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Publisher Payouts</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMsg}>{error}</Text>
          <View style={{ marginTop: spacing.lg }}>
            <Button title="Retry" onPress={load} variant="outline" />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Publisher Payouts</Text>
        <TouchableOpacity
          style={styles.paymentMethodsBtn}
          onPress={() => router.push('/admin/payment-methods')}
        >
          <CreditCard size={18} color={colors.primary[600]} />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Search size={18} color={colors.neutral[400]} />
        <TextInputArabic
          style={styles.searchInput}
          placeholder="Search by publisher name…"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <XIcon size={18} color={colors.neutral[400]} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        {/* Summary header */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <View style={[styles.summaryIcon, { backgroundColor: colors.warning[100] }]}>
              <Users size={18} color={colors.warning[700]} />
            </View>
            <Text style={styles.summaryValue}>{eligible.length}</Text>
            <Text style={styles.summaryLabel}>Eligible Publishers</Text>
          </View>
          <View style={styles.summaryCard}>
            <View style={[styles.summaryIcon, { backgroundColor: colors.success[100] }]}>
              <DollarSign size={18} color={colors.success[700]} />
            </View>
            <Text style={styles.summaryValue}>
              {fmtMoney(eligible.reduce((s, p) => s + p.available_balance, 0))}
            </Text>
            <Text style={styles.summaryLabel}>Total Due</Text>
          </View>
          <View style={styles.summaryCard}>
            <View style={[styles.summaryIcon, { backgroundColor: colors.primary[100] }]}>
              <CheckCircle2 size={18} color={colors.primary[700]} />
            </View>
            <Text style={styles.summaryValue}>{recentPayments.length}</Text>
            <Text style={styles.summaryLabel}>Paid (Recent)</Text>
          </View>
        </View>

        {/* Eligible publishers */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            Eligible for Payout ({filtered.length})
          </Text>
          {filtered.length > 0 ? (
            <View style={styles.selectBtns}>
              <TouchableOpacity onPress={selectAll}>
                <Text style={styles.selectBtn}>Select All</Text>
              </TouchableOpacity>
              {selectedIds.length > 0 ? (
                <TouchableOpacity onPress={deselectAll}>
                  <Text style={[styles.selectBtn, { color: colors.error[600] }]}>Deselect</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>

        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Wallet size={56} color={colors.neutral[300]} />
            <Text style={styles.emptyTitle}>No eligible publishers</Text>
            <Text style={styles.emptyMsg}>
              {search
                ? 'No results match your search.'
                : 'No publishers currently have a balance meeting their configured threshold.'}
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.md, marginBottom: spacing.xl }}>
            {filtered.map((pub) => {
              const isSelected = selectedIds.includes(pub.user_id);
              return (
                <TouchableOpacity
                  key={pub.user_id}
                  style={[styles.pubCard, isSelected && styles.pubCardSelected]}
                  onPress={() => openDetail(pub)}
                  activeOpacity={0.75}
                >
                  <View style={styles.pubCardTop}>
                    {/* اضغط على الحرف للتحديد، وعلى البطاقة لعرض التفاصيل */}
                    <TouchableOpacity
                      style={styles.pubAvatarWrap}
                      onPress={() => toggleSelect(pub.user_id)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.pubAvatar, isSelected && styles.pubAvatarSelected]}>
                        {isSelected ? (
                          <Check size={18} color={colors.white} />
                        ) : (
                          <Text style={styles.pubAvatarText}>
                            {(pub.full_name ?? '?').charAt(0).toUpperCase()}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pubName}>
                        {pub.full_name || 'Unknown Publisher'}
                      </Text>
                      <Text style={styles.pubThreshold}>
                        Threshold: {fmtMoney(pub.min_threshold)}
                      </Text>
                    </View>
                    <View style={styles.balanceBadge}>
                      <Text style={styles.balanceBadgeText}>
                        {fmtMoney(pub.available_balance)}
                      </Text>
                    </View>
                  </View>

                  {/* Payment details */}
                  <PaymentDetails
                    method={pub.payment_method}
                    details={pub.account_details}
                  />
                  <View style={styles.pubCardHint}>
                    <FileText size={13} color={colors.primary[600]} />
                    <Text style={styles.pubCardHintText}>
                      اضغط لعرض الرصيد الكامل وسجل السحوبات والأرباح وتنفيذ سحب بمبلغ محدد
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Recent payments */}
        {recentPayments.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>
              Recent Payments
            </Text>
            <View style={{ gap: spacing.sm }}>
              {recentPayments.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.recentCard}
                  onPress={() => router.push(`/invoice/${p.id}?kind=withdrawal`)}
                >
                  <View style={styles.recentLeft}>
                    <CheckCircle2 size={18} color={colors.success[600]} />
                    <View>
                      <Text style={styles.recentName}>
                        {(p.profile as any)?.full_name || 'Unknown'}
                      </Text>
                      <Text style={styles.recentDate}>{fmtDate(p.created_at)}</Text>
                    </View>
                  </View>
                  <View style={styles.recentRight}>
                    <Text style={styles.recentAmount}>{fmtMoney(p.amount)}</Text>
                    {p.invoice_number ? (
                      <Text style={styles.recentInvoice}>{p.invoice_number}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      {/* Floating pay bar */}
      {selectedIds.length > 0 ? (
        <View style={styles.payBar}>
          <View>
            <Text style={styles.payBarCount}>{selectedIds.length} publisher(s) selected</Text>
            <Text style={styles.payBarTotal}>Total: {fmtMoney(totalSelectedAmount)}</Text>
          </View>
          <TouchableOpacity
            style={[styles.payBtn, paying && styles.payBtnDisabled]}
            disabled={paying}
            onPress={handlePaySelected}
          >
            {paying ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Banknote size={18} color={colors.white} />
            )}
            <Text style={styles.payBtnText}>{paying ? 'Processing…' : 'Pay Selected'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Confirm modal */}
      <Modal
        visible={confirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => !paying && setConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Confirm Payouts</Text>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => !paying && setConfirmModal(false)}
              >
                <XIcon size={20} color={colors.neutral[500]} />
              </TouchableOpacity>
            </View>

            <View style={styles.confirmSummary}>
              <Text style={styles.confirmLine}>
                Publishers:{' '}
                <Text style={styles.confirmBold}>{selectedIds.length}</Text>
              </Text>
              <Text style={styles.confirmLine}>
                Total Amount:{' '}
                <Text style={styles.confirmBold}>{fmtMoney(totalSelectedAmount)}</Text>
              </Text>
            </View>

            <View style={[styles.warningBox, { backgroundColor: colors.success[50], borderColor: colors.success[200] }]}>
              <Text style={[styles.warningText, { color: colors.success[700] }]}>
                Make sure you have sent the payments to each publisher's payment account before
                confirming. Each publisher will receive a notification and receipt.
              </Text>
            </View>

            <Text style={styles.notesLabel}>Admin Notes (Optional)</Text>
            <TextInputArabic
              style={[styles.notesInput, styles.textArea]}
              placeholder="Any notes to include with the payment notifications…"
              value={adminNotes}
              onChangeText={setAdminNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Cancel"
                  onPress={() => setConfirmModal(false)}
                  variant="outline"
                  fullWidth
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Confirm & Notify"
                  onPress={processPayments}
                  fullWidth
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══════════ تفاصيل حساب الناشر + تنفيذ السحب ══════════ */}
      <Modal
        visible={!!detailUser}
        transparent
        animationType="slide"
        onRequestClose={closeDetail}
      >
        <View style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {detailUser?.full_name || 'حساب الناشر'}
              </Text>
              <TouchableOpacity style={styles.modalClose} onPress={closeDetail}>
                <XIcon size={20} color={colors.neutral[500]} />
              </TouchableOpacity>
            </View>

            {overviewLoading ? (
              <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.primary[600]} />
                <Text style={styles.loadingText}>جاري تحميل بيانات الحساب…</Text>
              </View>
            ) : overviewError ? (
              <View style={{ paddingVertical: spacing.lg }}>
                <Text style={styles.errorMsg}>{overviewError}</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
                {/* الأرصدة */}
                <View style={styles.statsGrid}>
                  <View style={[styles.statBox, { backgroundColor: colors.success[50] }]}>
                    <Text style={styles.statLabel}>الرصيد المتاح</Text>
                    <Text style={[styles.statValue, { color: colors.success[700] }]}>
                      {fmtMoney(overview?.wallet.available_balance ?? detailUser?.available_balance ?? 0)}
                    </Text>
                  </View>
                  <View style={[styles.statBox, { backgroundColor: colors.warning[50] }]}>
                    <Text style={styles.statLabel}>رصيد معلّق</Text>
                    <Text style={styles.statValue}>
                      {fmtMoney(overview?.wallet.pending_balance ?? 0)}
                    </Text>
                  </View>
                  <View style={[styles.statBox, { backgroundColor: colors.primary[50] }]}>
                    <Text style={styles.statLabel}>إجمالي الأرباح</Text>
                    <Text style={[styles.statValue, { color: colors.primary[700] }]}>
                      {fmtMoney(overview?.wallet.total_earned ?? 0)}
                    </Text>
                  </View>
                  <View style={[styles.statBox, { backgroundColor: colors.neutral[100] }]}>
                    <Text style={styles.statLabel}>إجمالي المسحوب</Text>
                    <Text style={styles.statValue}>
                      {fmtMoney(overview?.wallet.total_withdrawn ?? 0)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.sheetHint}>
                  الحد الأدنى للسحب الذي حدده الناشر:{' '}
                  {fmtMoney(overview?.settings?.min_threshold ?? detailUser?.min_threshold ?? 0)}
                </Text>

                {/* تنفيذ سحب بمبلغ محدد */}
                <Text style={styles.sheetSection}>تنفيذ سحب</Text>
                <Text style={styles.notesLabel}>المبلغ المطلوب سحبه (ل.س)</Text>
                <TextInputArabic
                  style={styles.notesInput}
                  placeholder="مثال: 18"
                  keyboardType="decimal-pad"
                  value={payAmount}
                  onChangeText={setPayAmount}
                />
                <View style={styles.quickRow}>
                  {[0.25, 0.5, 1].map((f) => {
                    const bal = Number(
                      overview?.wallet.available_balance ?? detailUser?.available_balance ?? 0
                    );
                    return (
                      <TouchableOpacity
                        key={f}
                        style={styles.quickBtn}
                        onPress={() => setPayAmount((bal * f).toFixed(2))}
                      >
                        <Text style={styles.quickBtnText}>
                          {f === 1 ? 'كامل الرصيد' : `${f * 100}%`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity
                  style={styles.accountToggle}
                  onPress={() => setShowAccount((v) => !v)}
                >
                  <CreditCard size={16} color={colors.primary[600]} />
                  <Text style={styles.accountToggleText}>
                    {showAccount ? 'إخفاء بيانات حساب الاستلام' : 'عرض بيانات حساب الاستلام (قابلة للنسخ)'}
                  </Text>
                </TouchableOpacity>

                {showAccount ? (
                  <View style={styles.accountBox}>
                    <CopyRow
                      label="طريقة الاستلام"
                      value={
                        METHOD_LABELS[
                          overview?.settings?.payment_method ?? detailUser?.payment_method ?? ''
                        ] ??
                        (overview?.settings?.payment_method ?? detailUser?.payment_method ?? '—')
                      }
                    />
                    {Object.entries(
                      overview?.settings?.account_details ?? detailUser?.account_details ?? {}
                    ).map(([k, v]) => (
                      <CopyRow key={k} label={ACCOUNT_KEY_LABELS[k] ?? k} value={String(v)} />
                    ))}
                    {overview?.profile?.phone ? (
                      <CopyRow label="هاتف الناشر" value={String(overview.profile.phone)} />
                    ) : null}
                  </View>
                ) : null}

                <Text style={styles.notesLabel}>ملاحظات الأدمن (اختياري)</Text>
                <TextInputArabic
                  style={[styles.notesInput, styles.textArea]}
                  placeholder="مثال: تم التحويل عبر شام كاش…"
                  value={payNotes}
                  onChangeText={setPayNotes}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />

                <TouchableOpacity
                  style={[styles.payBtn, { marginTop: spacing.sm }, payingOne && styles.payBtnDisabled]}
                  disabled={payingOne}
                  onPress={handlePayOne}
                >
                  {payingOne ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Banknote size={18} color={colors.white} />
                  )}
                  <Text style={styles.payBtnText}>
                    {payingOne ? 'جاري التنفيذ…' : 'تأكيد السحب وإصدار الفاتورة'}
                  </Text>
                </TouchableOpacity>

                {/* التبويبات: السحوبات / الأرباح / الروابط */}
                <View style={styles.tabsRow}>
                  {([
                    ['withdrawals', 'سجل السحوبات', FileText],
                    ['earnings', 'سجل الأرباح', TrendingUp],
                    ['links', 'روابط الأفلييت', Link2],
                  ] as const).map(([key, label, Icon]) => (
                    <TouchableOpacity
                      key={key}
                      style={[styles.tabBtn, tab === key && styles.tabBtnActive]}
                      onPress={() => setTab(key)}
                    >
                      <Icon size={14} color={tab === key ? colors.white : colors.primary[600]} />
                      <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {tab === 'withdrawals' ? (
                  (overview?.withdrawals ?? []).length === 0 ? (
                    <Text style={styles.emptyMsg}>لا توجد عمليات سحب سابقة.</Text>
                  ) : (
                    <View style={{ gap: spacing.sm }}>
                      {overview!.withdrawals.map((w) => (
                        <TouchableOpacity
                          key={w.id}
                          style={styles.logCard}
                          onPress={() => router.push(`/invoice/${w.id}?kind=withdrawal`)}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.logTitle}>
                              {w.invoice_number ?? 'فاتورة'} · {w.status}
                            </Text>
                            <Text style={styles.logDate}>{fmtDate(w.created_at)}</Text>
                            {w.admin_notes ? (
                              <Text style={styles.logDate}>{w.admin_notes}</Text>
                            ) : null}
                          </View>
                          <Text style={styles.logAmountOut}>-{fmtMoney(w.amount)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )
                ) : tab === 'earnings' ? (
                  (overview?.transactions ?? []).length === 0 ? (
                    <Text style={styles.emptyMsg}>لا توجد حركات مالية.</Text>
                  ) : (
                    <View style={{ gap: spacing.sm }}>
                      {overview!.transactions.map((tr) => {
                        const isOut = tr.type === 'withdrawal';
                        return (
                          <View key={tr.id} style={styles.logCard}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.logTitle}>
                                {tr.description || tr.type}
                              </Text>
                              <Text style={styles.logDate}>
                                {fmtDate(tr.created_at)} · {tr.status}
                              </Text>
                            </View>
                            <Text style={isOut ? styles.logAmountOut : styles.logAmountIn}>
                              {isOut ? '-' : '+'}
                              {fmtMoney(tr.amount)}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  )
                ) : (overview?.affiliate_links ?? []).length === 0 ? (
                  <Text style={styles.emptyMsg}>لا توجد روابط تسويق.</Text>
                ) : (
                  <View style={{ gap: spacing.sm }}>
                    {overview!.affiliate_links.map((l) => (
                      <View key={l.id} style={styles.logCard}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.logTitle}>{l.product_name ?? 'منتج'}</Text>
                          <Text style={styles.logDate}>
                            {l.affiliate_code} · نقرات {l.clicks_count} · مشتريات{' '}
                            {l.purchases_count}
                          </Text>
                        </View>
                        <Text style={styles.logAmountIn}>{fmtMoney(l.total_earnings)}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <View style={{ height: spacing.xl }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentMethodsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary[50],
  },
  title: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  accessGuard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  accessTitle: {
    ...typography.h3,
    color: colors.text,
    marginTop: spacing.md,
  },
  accessMsg: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  errorEmoji: { fontSize: 48 },
  errorTitle: {
    ...typography.h3,
    color: colors.text,
  },
  errorMsg: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: colors.error[50],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.error[100],
  },
  errorBannerText: {
    ...typography.bodySmall,
    color: colors.error[700],
  },
  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: 4,
  },
  // Summary
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  summaryValue: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '700',
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  // Section header
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '700',
  },
  selectBtns: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  selectBtn: {
    ...typography.bodySmall,
    color: colors.primary[600],
    fontWeight: '600',
  },
  // Publisher card
  pubCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...shadows.sm,
  },
  pubCardSelected: {
    borderColor: colors.primary[500],
    backgroundColor: colors.primary[50],
  },
  pubCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  pubAvatarWrap: {},
  pubAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.neutral[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  pubAvatarSelected: {
    backgroundColor: colors.primary[600],
  },
  pubAvatarText: {
    ...typography.h4,
    color: colors.neutral[600],
    fontWeight: '700',
  },
  pubName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  pubThreshold: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  balanceBadge: {
    backgroundColor: colors.success[100],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  balanceBadgeText: {
    ...typography.bodySmall,
    color: colors.success[800],
    fontWeight: '700',
  },
  // Recent payments
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadows.sm,
  },
  recentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  recentName: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  recentDate: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  recentRight: {
    alignItems: 'flex-end',
  },
  recentAmount: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.success[700],
  },
  recentInvoice: {
    ...typography.caption,
    color: colors.neutral[400],
    marginTop: 2,
  },
  // Empty
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.h4,
    color: colors.text,
  },
  emptyMsg: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  // Pay bar
  payBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.lg,
  },
  payBarCount: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
  },
  payBarTotal: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary[600],
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  payBtnDisabled: {
    opacity: 0.6,
  },
  payBtnText: {
    ...typography.bodySmall,
    color: colors.white,
    fontWeight: '700',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  modalTitle: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '700',
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral[100],
  },
  confirmSummary: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
    marginBottom: spacing.md,
  },
  confirmLine: {
    ...typography.body,
    color: colors.textSecondary,
  },
  confirmBold: {
    fontWeight: '700',
    color: colors.text,
  },
  warningBox: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning[100],
  },
  warningText: {
    ...typography.caption,
    color: colors.warning[700],
  },
  notesLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  notesInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.background,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  pubCardHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  pubCardHintText: {
    ...typography.caption,
    color: colors.primary[600],
    flex: 1,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.md,
    maxHeight: '92%',
  },
  sheetHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  sheetSection: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '700',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  statBox: {
    flexGrow: 1,
    minWidth: '46%',
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  statValue: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '800',
  },
  quickRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  quickBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.primary[50],
  },
  quickBtnText: {
    ...typography.caption,
    color: colors.primary[700],
    fontWeight: '700',
  },
  accountToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
  },
  accountToggleText: {
    ...typography.bodySmall,
    color: colors.primary[600],
    fontWeight: '700',
  },
  accountBox: {
    backgroundColor: colors.primary[50],
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 6,
    marginBottom: spacing.sm,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  copyLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  copyValue: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '700',
  },
  tabsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.primary[50],
  },
  tabBtnActive: {
    backgroundColor: colors.primary[600],
  },
  tabText: {
    ...typography.caption,
    color: colors.primary[700],
    fontWeight: '700',
  },
  tabTextActive: {
    color: colors.white,
  },
  logCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.neutral[50],
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  logTitle: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '700',
  },
  logDate: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  logAmountIn: {
    ...typography.bodySmall,
    color: colors.success[600],
    fontWeight: '800',
  },
  logAmountOut: {
    ...typography.bodySmall,
    color: colors.error[600],
    fontWeight: '800',
  },
});
