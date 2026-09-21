import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Image,
  Linking,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import {
  ChevronLeft,
  Shield,
  Receipt,
  CheckCircle2,
  XCircle,
  Hourglass,
  X as XIcon,
  User as UserIcon,
  Phone,
  Hash,
  ExternalLink,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text, ArabicTextInput as TextInput } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import { formatSyp } from '@/lib/currency';

type TopupRequest = {
  id: string;
  user_id: string;
  payment_method_id: string | null;
  method_name: string;
  method_account: string | null;
  amount: number;
  transfer_reference: string | null;
  receipt_url: string | null;
  sender_name: string | null;
  customer_note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  credited_amount: number | null;
  admin_note: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email?: string | null;
};

type Filter = 'pending' | 'approved' | 'rejected' | 'all';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'pending', label: 'قيد المراجعة' },
  { key: 'approved', label: 'مقبولة' },
  { key: 'rejected', label: 'مرفوضة' },
  { key: 'all', label: 'الكل' },
];

export default function AdminPaymentRequestsScreen() {
  const { user, isAdmin } = useAuth();
  const [requests, setRequests] = useState<TopupRequest[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('pending');

  // Review modal
  const [target, setTarget] = useState<TopupRequest | null>(null);
  const [mode, setMode] = useState<'approve' | 'reject' | null>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Receipt viewer
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('wallet_topup_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (fetchErr) throw fetchErr;

      const rows = (data as TopupRequest[]) ?? [];
      setRequests(rows);

      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', ids);
        const map: Record<string, Profile> = {};
        ((profs as Profile[]) ?? []).forEach((p) => { map[p.id] = p; });
        setProfiles(map);
      }
    } catch (e: any) {
      setError(e.message || 'تعذّر تحميل طلبات الدفع');
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

  const visible = useMemo(
    () => (filter === 'all' ? requests : requests.filter((r) => r.status === filter)),
    [requests, filter]
  );

  const counts = useMemo(() => ({
    pending: requests.filter((r) => r.status === 'pending').length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
    all: requests.length,
  }), [requests]);

  const openApprove = (r: TopupRequest) => {
    setTarget(r);
    setMode('approve');
    // تعبئة المبلغ الافتراضي بالليرة السورية (نفس مبلغ طلب العميل)
    const defaultSyp = Number(r.amount);
    setCreditAmount(defaultSyp ? String(defaultSyp) : '');
    setAdminNote('');
    setModalError(null);
  };

  const openReject = (r: TopupRequest) => {
    setTarget(r);
    setMode('reject');
    setRejectReason('');
    setModalError(null);
  };

  const closeModal = () => {
    setTarget(null);
    setMode(null);
    setCreditAmount('');
    setAdminNote('');
    setRejectReason('');
    setModalError(null);
  };

  const handleApprove = async () => {
    if (!target) return;
    // الأدمن يدخل المبلغ بالليرة السورية مباشرة — هذا هو المبلغ الذي يُضاف للمحفظة كما هو.
    const valueSyp = parseFloat(creditAmount.replace(',', '.'));
    if (!valueSyp || valueSyp <= 0 || Number.isNaN(valueSyp)) {
      setModalError('يرجى إدخال المبلغ بالليرة السورية');
      return;
    }
    setSaving(true);
    try {
      const { error: rpcErr } = await supabase.rpc('approve_wallet_topup', {
        p_request_id: target.id,
        p_amount_usd: valueSyp,
        p_admin_note: adminNote.trim() || null,
      });
      if (rpcErr) throw rpcErr;
      closeModal();
      await load();
    } catch (e: any) {
      setModalError(e.message || 'تعذّر تنفيذ العملية');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!target) return;
    setSaving(true);
    try {
      const { error: rpcErr } = await supabase.rpc('reject_wallet_topup', {
        p_request_id: target.id,
        p_reason: rejectReason.trim() || null,
      });
      if (rpcErr) throw rpcErr;
      closeModal();
      await load();
    } catch (e: any) {
      setModalError(e.message || 'تعذّر تنفيذ العملية');
    } finally {
      setSaving(false);
    }
  };

  const openReceipt = (url: string) => {
    if (Platform.OS === 'web') {
      Linking.openURL(url);
      return;
    }
    setReceiptPreview(url);
  };

  const statusMeta = (status: TopupRequest['status']) => {
    if (status === 'approved') {
      return { label: 'مقبول', color: colors.success[700], bg: colors.success[50], icon: <CheckCircle2 size={14} color={colors.success[700]} /> };
    }
    if (status === 'rejected') {
      return { label: 'مرفوض', color: colors.error[600], bg: colors.error[50], icon: <XCircle size={14} color={colors.error[600]} /> };
    }
    return { label: 'قيد المراجعة', color: colors.warning[700], bg: colors.warning[50], icon: <Hourglass size={14} color={colors.warning[700]} /> };
  };

  const Header = () => (
    <View style={styles.header}>
      <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
        <ChevronLeft size={24} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.title}>طلبات الدفع</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  if (!user || !isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <Header />
        <View style={styles.accessGuard}>
          <Shield size={64} color={colors.neutral[300]} />
          <Text style={styles.accessTitle}>يلزم صلاحية مدير</Text>
          <Text style={styles.accessMsg}>تحتاج إلى صلاحيات المدير لمراجعة طلبات الدفع.</Text>
          <View style={{ marginTop: spacing.lg, width: '100%' }}>
            <Button title="رجوع" onPress={() => router.back()} fullWidth />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Header />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={styles.loadingText}>جارٍ تحميل طلبات الدفع…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header />

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
              {f.label} ({counts[f.key]})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        {visible.length === 0 ? (
          <View style={styles.emptyState}>
            <Receipt size={56} color={colors.neutral[300]} />
            <Text style={styles.emptyTitle}>لا توجد طلبات</Text>
            <Text style={styles.emptyMsg}>ستظهر هنا طلبات شحن المحفظة التي يرسلها العملاء.</Text>
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {visible.map((r) => {
              const meta = statusMeta(r.status);
              const p = profiles[r.user_id];
              return (
                <View key={r.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardMethod}>{r.method_name}</Text>
                      <Text style={styles.cardAmount}>
                        {formatSyp(Number(r.amount))}
                      </Text>
                    </View>
                    <View style={[styles.statusTag, { backgroundColor: meta.bg }]}>
                      {meta.icon}
                      <Text style={[styles.statusTagText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>

                  <View style={styles.detailRow}>
                    <UserIcon size={14} color={colors.textMuted} />
                    <Text style={styles.detailText}>
                      {p?.full_name || 'عميل'}{r.sender_name ? ` — المُحوِّل: ${r.sender_name}` : ''}
                    </Text>
                  </View>
                  {p?.phone ? (
                    <View style={styles.detailRow}>
                      <Phone size={14} color={colors.textMuted} />
                      <Text style={styles.detailText}>{p.phone}</Text>
                    </View>
                  ) : null}
                  {r.transfer_reference ? (
                    <View style={styles.detailRow}>
                      <Hash size={14} color={colors.textMuted} />
                      <Text style={styles.detailText}>رقم العملية: {r.transfer_reference}</Text>
                    </View>
                  ) : null}
                  {r.method_account ? (
                    <View style={styles.detailRow}>
                      <Receipt size={14} color={colors.textMuted} />
                      <Text style={styles.detailText}>عنوان الدفع: {r.method_account}</Text>
                    </View>
                  ) : null}
                  {r.customer_note ? (
                    <Text style={styles.noteText}>ملاحظة العميل: {r.customer_note}</Text>
                  ) : null}

                  {r.receipt_url ? (
                    <TouchableOpacity style={styles.receiptBtn} onPress={() => openReceipt(r.receipt_url!)}>
                      <ExternalLink size={16} color={colors.primary[600]} />
                      <Text style={styles.receiptBtnText}>عرض صورة الإيصال</Text>
                    </TouchableOpacity>
                  ) : null}

                  <Text style={styles.cardDate}>
                    {new Date(r.created_at).toLocaleString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </Text>

                  {r.status === 'approved' ? (
                    <Text style={[styles.resultText, { color: colors.success[700] }]}>
                      تم شحن المحفظة بمبلغ {formatSyp(Number(r.credited_amount ?? 0))}
                      {r.admin_note ? ` — ملاحظة: ${r.admin_note}` : ''}
                    </Text>
                  ) : null}
                  {r.status === 'rejected' ? (
                    <Text style={[styles.resultText, { color: colors.error[600] }]}>
                      سبب الرفض: {r.rejection_reason || 'غير محدد'}
                    </Text>
                  ) : null}

                  {r.status === 'pending' ? (
                    <View style={styles.actionsRow}>
                      <View style={{ flex: 1 }}>
                        <Button title="قبول" onPress={() => openApprove(r)} fullWidth />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button title="رفض" onPress={() => openReject(r)} variant="outline" fullWidth />
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Review modal */}
      <Modal visible={!!target && !!mode} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {mode === 'approve' ? 'قبول طلب الدفع' : 'رفض طلب الدفع'}
              </Text>
              <TouchableOpacity onPress={closeModal}>
                <XIcon size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {target ? (
              <View style={styles.summaryBox}>
                <Text style={styles.summaryText}>
                  {target.method_name} — {formatSyp(Number(target.amount))}
                </Text>
                {target.transfer_reference ? (
                  <Text style={styles.summaryMeta}>رقم العملية: {target.transfer_reference}</Text>
                ) : null}
              </View>
            ) : null}

            {mode === 'approve' ? (
              <>
                <Text style={styles.label}>المبلغ الذي سيتم شحنه (بالليرة السورية)</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.amountInput}
                    value={creditAmount}
                    onChangeText={setCreditAmount}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
                <Text style={styles.label}>ملاحظة للعميل (اختياري)</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={[styles.textInput, { minHeight: 64, textAlignVertical: 'top' }]}
                    value={adminNote}
                    onChangeText={setAdminNote}
                    placeholder="اكتب ملاحظة تصل إلى العميل"
                    placeholderTextColor={colors.textMuted}
                    multiline
                  />
                </View>
              </>
            ) : null}

            {mode === 'reject' ? (
              <>
                <Text style={styles.label}>سبب الرفض (اختياري)</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={[styles.textInput, { minHeight: 84, textAlignVertical: 'top' }]}
                    value={rejectReason}
                    onChangeText={setRejectReason}
                    placeholder="اكتب سبب الرفض ليصل إلى العميل"
                    placeholderTextColor={colors.textMuted}
                    multiline
                  />
                </View>
              </>
            ) : null}

            {modalError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{modalError}</Text>
              </View>
            ) : null}

            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              <Button
                title={saving ? 'جارٍ التنفيذ…' : 'تأكيد'}
                onPress={mode === 'approve' ? handleApprove : handleReject}
                loading={saving}
                fullWidth
                size="lg"
              />
              <Button title="إلغاء" onPress={closeModal} variant="outline" fullWidth />
            </View>
          </View>
        </View>
      </Modal>

      {/* Receipt preview (native) */}
      <Modal visible={!!receiptPreview} transparent animationType="fade" onRequestClose={() => setReceiptPreview(null)}>
        <View style={styles.previewOverlay}>
          <TouchableOpacity style={styles.previewClose} onPress={() => setReceiptPreview(null)}>
            <XIcon size={22} color={colors.white} />
          </TouchableOpacity>
          {receiptPreview ? (
            <Image source={{ uri: receiptPreview }} style={styles.previewImage} />
          ) : null}
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

  filterRow: {
    flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm, backgroundColor: colors.surface, flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.full,
    backgroundColor: colors.neutral[100],
  },
  filterChipActive: { backgroundColor: colors.primary[600] },
  filterChipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  filterChipTextActive: { color: colors.white, fontWeight: '700' },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { ...typography.bodySmall, color: colors.textMuted },

  accessGuard: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  accessTitle: { ...typography.h4, color: colors.text, fontWeight: '700', marginTop: spacing.md },
  accessMsg: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },

  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { ...typography.h4, color: colors.text, fontWeight: '700' },
  emptyMsg: { ...typography.bodySmall, color: colors.textMuted, textAlign: 'center' },

  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    gap: 6, ...shadows.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardMethod: { ...typography.bodySmall, color: colors.textMuted, fontWeight: '600' },
  cardAmount: { ...typography.h4, color: colors.text, fontWeight: '700' },
  statusTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full,
  },
  statusTagText: { ...typography.caption, fontWeight: '700' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  noteText: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  cardDate: { ...typography.caption, color: colors.textMuted, fontSize: 10 },
  resultText: { ...typography.caption, fontWeight: '600', lineHeight: 18 },
  receiptBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: colors.primary[50], paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.md,
  },
  receiptBtnText: { ...typography.caption, color: colors.primary[700], fontWeight: '700' },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },

  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.lg,
  },
  modalContent: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { ...typography.h4, color: colors.text, fontWeight: '700', flex: 1 },
  summaryBox: { backgroundColor: colors.neutral[100], borderRadius: radius.md, padding: spacing.md, gap: 4 },
  summaryText: { ...typography.bodySmall, color: colors.text, fontWeight: '700' },
  summaryMeta: { ...typography.caption, color: colors.textSecondary },
  label: { ...typography.bodySmall, fontWeight: '600', color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm },
  hintText: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: colors.background,
  },
  amountInput: { flex: 1, paddingVertical: spacing.md, ...typography.h4, color: colors.text },
  textInput: { flex: 1, paddingVertical: spacing.md, ...typography.bodySmall, color: colors.text },

  errorBanner: {
    backgroundColor: colors.error[50], borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.error[200], marginTop: spacing.md,
  },
  errorBannerText: { ...typography.caption, color: colors.error[700] },

  previewOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center',
  },
  previewClose: { position: 'absolute', top: 40, left: 20, padding: spacing.sm, zIndex: 2 },
  previewImage: { width: '92%', height: '80%', resizeMode: 'contain' },
});
