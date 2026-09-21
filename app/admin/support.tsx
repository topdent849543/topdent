/**
 * لوحة تذاكر الدعم للأدمن — كل التذاكر تصل فوراً مع صوت وإشعار،
 * ويمكن الرد عليها مباشرة فيصل الرد للزبون في صفحة الدعم.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, X, Search, LifeBuoy, CheckCircle2 } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text, ArabicTextInput as TextInput } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { TicketThread } from '@/components/TicketThread';
import { playFeedback } from '@/lib/sounds';
import {
  fetchAdminTickets,
  updateTicketStatus,
  TICKET_STATUS_LABEL,
  type SupportTicket,
} from '@/lib/support';

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'open', label: 'مفتوحة' },
  { key: 'pending', label: 'بانتظار الرد' },
  { key: 'resolved', label: 'تم الحل' },
  { key: 'closed', label: 'مغلقة' },
];

function statusColor(status: string) {
  if (status === 'resolved' || status === 'closed') return colors.success[600];
  if (status === 'pending') return colors.warning[600];
  return colors.primary[600];
}

export default function AdminSupportScreen() {
  const { user, isAdmin, profile } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<SupportTicket | null>(null);

  const load = useCallback(async () => {
    try {
      setTickets(await fetchAdminTickets());
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذّر تحميل التذاكر');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // وصول التذاكر والردود لحظياً + صوت تنبيه
  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel('admin-support-tickets')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_tickets' }, () => {
        playFeedback('notify');
        load();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_tickets' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAdmin, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter(t => {
      if (filter !== 'all' && t.status !== filter) return false;
      if (!q) return true;
      return [t.subject, t.message, t.ticket_number, t.customer_name, t.customer_email]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q));
    });
  }, [tickets, filter, search]);

  const setStatus = async (ticket: SupportTicket, status: string) => {
    try {
      await updateTicketStatus(ticket.id, status);
      setActive(prev => (prev && prev.id === ticket.id ? { ...prev, status } : prev));
      playFeedback('success');
      await load();
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذّر تحديث الحالة');
    }
  };

  if (profile && !isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>تذاكر الدعم</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <Text style={styles.muted}>هذه الصفحة مخصّصة للأدمن فقط.</Text>
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
        <Text style={styles.title}>تذاكر الدعم</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchRow}>
        <Search size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="ابحث برقم التذكرة أو اسم الزبون…"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary[600]} style={{ flex: 1 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
            />
          }
        >
          {filtered.length === 0 ? (
            <View style={styles.emptyCard}>
              <LifeBuoy size={22} color={colors.textMuted} />
              <Text style={styles.muted}>لا توجد تذاكر مطابقة.</Text>
            </View>
          ) : (
            filtered.map(t => (
              <TouchableOpacity key={t.id} style={styles.card} onPress={() => setActive(t)}>
                <View style={{ flex: 1 }}>
                  <View style={styles.cardTop}>
                    <Text style={styles.subject} numberOfLines={1}>{t.subject}</Text>
                    <Text style={[styles.status, { color: statusColor(t.status) }]}>
                      {TICKET_STATUS_LABEL[t.status] ?? t.status}
                    </Text>
                  </View>
                  <Text style={styles.last} numberOfLines={1}>{t.last_message || t.message}</Text>
                  <Text style={styles.meta}>
                    {t.ticket_number} · {t.customer_name ?? 'زبون'}
                    {t.customer_email ? ` · ${t.customer_email}` : ''}
                  </Text>
                </View>
                {t.admin_unread ? (
                  <View style={styles.badge}><Text style={styles.badgeText}>{t.admin_unread}</Text></View>
                ) : null}
                <ChevronRight size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={!!active} animationType="slide" onRequestClose={() => setActive(null)}>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => { setActive(null); load(); }}>
              <X size={22} color={colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.title} numberOfLines={1}>{active?.subject}</Text>
              <Text style={styles.meta}>
                {active?.ticket_number} · {active?.customer_name ?? 'زبون'}
              </Text>
            </View>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {(['open', 'pending', 'resolved', 'closed'] as const).map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.chip, active?.status === s && styles.chipActive]}
                onPress={() => active && setStatus(active, s)}
              >
                {active?.status === s ? <CheckCircle2 size={14} color={colors.primary[700]} /> : null}
                <Text style={[styles.chipText, active?.status === s && styles.chipTextActive]}>
                  {TICKET_STATUS_LABEL[s]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {active && user ? (
            <TicketThread ticket={active} currentUserId={user.id} role="admin" onSent={load} />
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.surface,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h4, color: colors.text, fontWeight: '700' },
  muted: { ...typography.caption, color: colors.textMuted },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.md, marginTop: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, ...shadows.sm,
  },
  searchInput: { flex: 1, color: colors.text },
  filters: { gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 999,
    backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary[50], borderColor: colors.primary[600] },
  chipText: { ...typography.caption, color: colors.textMuted, fontWeight: '600' },
  chipTextActive: { color: colors.primary[700] },
  emptyCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm,
  },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.sm, ...shadows.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  subject: { flex: 1, ...typography.body, color: colors.text, fontWeight: '700' },
  status: { ...typography.caption, fontWeight: '700' },
  last: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  meta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  badge: {
    minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6,
    backgroundColor: colors.error[500], alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
