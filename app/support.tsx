import { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Modal,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import {
  ChevronLeft,
  MessageCircle,
  Mail,
  Phone,
  ChevronRight,
  X,
  LifeBuoy,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/Button';
import { ArabicText as Text, ArabicTextInput as TextInput } from '@/components/ArabicText';
import { SuccessBanner } from '@/components/SuccessBanner';
import { TicketThread } from '@/components/TicketThread';
import { playFeedback } from '@/lib/sounds';
import {
  createTicket,
  fetchMyTickets,
  TICKET_CATEGORIES,
  TICKET_STATUS_LABEL,
  type SupportTicket,
} from '@/lib/support';
import { supabase } from '@/lib/supabase';

const FAQS = [
  { q: 'كم يستغرق الشحن؟', a: 'الشحن العادي من 5 إلى 7 أيام عمل، والشحن السريع من 2 إلى 3 أيام.' },
  { q: 'كيف أتابع طلبي؟', a: 'من صفحة «طلباتي» اضغط على الطلب لمشاهدة حالة الشحن لحظياً.' },
  { q: 'هل تشحنون خارج البلد؟', a: 'نعم، نشحن لأكثر من 50 دولة، وتُحتسب كلفة الشحن عند إتمام الطلب.' },
  { q: 'كيف أستخدم كود الخصم؟', a: 'أدخل الكود في صفحة السلة قبل الانتقال إلى الدفع.' },
];

function statusColor(status: string) {
  if (status === 'resolved' || status === 'closed') return colors.success[600];
  if (status === 'pending') return colors.warning[600];
  return colors.primary[600];
}

export default function SupportScreen() {
  const { user } = useAuth();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('general');
  const [sending, setSending] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState<SupportTicket | null>(null);
  const [banner, setBanner] = useState<{ title: string; subtitle?: string } | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setTickets([]);
      setLoadingTickets(false);
      return;
    }
    try {
      setTickets(await fetchMyTickets(user.id));
    } catch {
      /* تجاهل */
    } finally {
      setLoadingTickets(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // تحديث لحظي عند وصول ردّ من الدعم
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`my-tickets:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_tickets', filter: `user_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  const submitTicket = async () => {
    if (!subject.trim() || !message.trim()) {
      Alert.alert('معلومات ناقصة', 'الرجاء تعبئة الموضوع والرسالة.');
      return;
    }
    if (!user) {
      Alert.alert('تسجيل الدخول مطلوب', 'سجّل الدخول لإرسال تذكرة دعم.');
      return;
    }
    setSending(true);
    try {
      const ticket = await createTicket({ userId: user.id, subject, message, category });
      setSubject('');
      setMessage('');
      setCategory('general');
      playFeedback('success');
      setBanner({
        title: 'تم إرسال تذكرتك بنجاح ✅',
        subtitle: `رقم التذكرة ${ticket.ticket_number ?? ''} — سيصلك ردّ فريق الدعم هنا مباشرة.`,
      });
      await load();
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذّر إرسال التذكرة');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>المساعدة والدعم</Text>
        <View style={{ width: 40 }} />
      </View>

      <SuccessBanner
        visible={!!banner}
        title={banner?.title ?? ''}
        subtitle={banner?.subtitle}
        onHide={() => setBanner(null)}
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
          />
        }
      >
        <View style={styles.contactRow}>
          <TouchableOpacity style={styles.contactCard} onPress={() => router.push('/chats')}>
            <View style={[styles.contactIcon, { backgroundColor: colors.success[50] }]}>
              <MessageCircle size={24} color={colors.success[600]} />
            </View>
            <Text style={styles.contactLabel}>محادثة مباشرة</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.contactCard}>
            <View style={[styles.contactIcon, { backgroundColor: colors.primary[50] }]}>
              <Mail size={24} color={colors.primary[600]} />
            </View>
            <Text style={styles.contactLabel}>راسلنا</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.contactCard}>
            <View style={[styles.contactIcon, { backgroundColor: colors.accent[50] }]}>
              <Phone size={24} color={colors.accent[600]} />
            </View>
            <Text style={styles.contactLabel}>اتصل بنا</Text>
          </TouchableOpacity>
        </View>

        {/* تذاكري */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>تذاكري</Text>
          {loadingTickets ? (
            <ActivityIndicator color={colors.primary[600]} style={{ marginVertical: spacing.md }} />
          ) : tickets.length === 0 ? (
            <View style={styles.emptyCard}>
              <LifeBuoy size={22} color={colors.textMuted} />
              <Text style={styles.emptyText}>لا توجد تذاكر بعد — أرسل رسالتك أدناه وسنرد عليك فوراً.</Text>
            </View>
          ) : (
            tickets.map(t => (
              <TouchableOpacity key={t.id} style={styles.ticketCard} onPress={() => setActive(t)}>
                <View style={{ flex: 1 }}>
                  <View style={styles.ticketTop}>
                    <Text style={styles.ticketSubject} numberOfLines={1}>{t.subject}</Text>
                    <Text style={[styles.ticketStatus, { color: statusColor(t.status) }]}>
                      {TICKET_STATUS_LABEL[t.status] ?? t.status}
                    </Text>
                  </View>
                  <Text style={styles.ticketLast} numberOfLines={1}>
                    {t.last_message || t.message}
                  </Text>
                  <Text style={styles.ticketMeta}>{t.ticket_number}</Text>
                </View>
                {t.user_unread ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{t.user_unread}</Text>
                  </View>
                ) : null}
                <ChevronRight size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* تذكرة جديدة */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>إرسال رسالة جديدة</Text>
          <View style={styles.formCard}>
            <Text style={styles.label}>التصنيف</Text>
            <View style={styles.categoryRow}>
              {TICKET_CATEGORIES.map(c => (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.categoryChip, category === c.key && styles.categoryChipActive]}
                  onPress={() => setCategory(c.key)}
                >
                  <Text style={[styles.categoryChipText, category === c.key && styles.categoryChipTextActive]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>الموضوع</Text>
            <TextInput
              style={styles.input}
              placeholder="وصف مختصر لمشكلتك"
              placeholderTextColor={colors.textMuted}
              value={subject}
              onChangeText={setSubject}
            />
            <Text style={styles.label}>الرسالة</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="اشرح مشكلتك بالتفصيل…"
              placeholderTextColor={colors.textMuted}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <Button
              title={sending ? 'جاري الإرسال…' : 'إرسال التذكرة'}
              onPress={submitTicket}
              loading={sending}
              fullWidth
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>الأسئلة الشائعة</Text>
          <View style={styles.faqContainer}>
            {FAQS.map((faq, i) => (
              <View key={i} style={styles.faqItem}>
                <TouchableOpacity
                  style={styles.faqQuestion}
                  onPress={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <Text style={styles.faqQuestionText}>{faq.q}</Text>
                  <ChevronRight
                    size={18}
                    color={colors.textMuted}
                    style={{ transform: [{ rotate: openFaq === i ? '90deg' : '0deg' }] }}
                  />
                </TouchableOpacity>
                {openFaq === i ? <Text style={styles.faqAnswer}>{faq.a}</Text> : null}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <Modal visible={!!active} animationType="slide" onRequestClose={() => setActive(null)}>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => { setActive(null); load(); }}>
              <X size={22} color={colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.title} numberOfLines={1}>{active?.subject}</Text>
              <Text style={styles.ticketMeta}>{active?.ticket_number}</Text>
            </View>
            <View style={{ width: 40 }} />
          </View>
          {active && user ? (
            <TicketThread ticket={active} currentUserId={user.id} role="customer" />
          ) : null}
        </SafeAreaView>
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
  contactRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  contactCard: {
    flex: 1, alignItems: 'center', gap: spacing.xs, backgroundColor: colors.surface,
    borderRadius: radius.lg, paddingVertical: spacing.md, ...shadows.sm,
  },
  contactIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  contactLabel: { ...typography.caption, color: colors.text, fontWeight: '600' },
  section: { paddingHorizontal: spacing.md, marginTop: spacing.md },
  sectionTitle: { ...typography.h4, color: colors.text, fontWeight: '700', marginBottom: spacing.sm },
  emptyCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm,
  },
  emptyText: { flex: 1, ...typography.caption, color: colors.textMuted },
  ticketCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.sm, ...shadows.sm,
  },
  ticketTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  ticketSubject: { flex: 1, ...typography.body, color: colors.text, fontWeight: '700' },
  ticketStatus: { ...typography.caption, fontWeight: '700' },
  ticketLast: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  ticketMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  badge: {
    minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6,
    backgroundColor: colors.error[500], alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  formCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm },
  label: { ...typography.caption, color: colors.textMuted, fontWeight: '700', marginBottom: spacing.xs },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  categoryChip: {
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full ?? 999,
    backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
  },
  categoryChipActive: { backgroundColor: colors.primary[50], borderColor: colors.primary[600] },
  categoryChipText: { ...typography.caption, color: colors.textMuted, fontWeight: '600' },
  categoryChipTextActive: { color: colors.primary[700] },
  input: {
    backgroundColor: colors.inputBg, borderRadius: radius.md, paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, marginBottom: spacing.md, color: colors.text,
  },
  textArea: { minHeight: 110 },
  faqContainer: { backgroundColor: colors.surface, borderRadius: radius.lg, ...shadows.sm },
  faqItem: { borderBottomWidth: 1, borderBottomColor: colors.border, padding: spacing.md },
  faqQuestion: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  faqQuestionText: { flex: 1, ...typography.body, color: colors.text, fontWeight: '600' },
  faqAnswer: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm },
});
