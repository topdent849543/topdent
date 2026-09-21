/**
 * صفحة «المحادثات» في لوحة تحكم الأدمن.
 * - عرض كل المحادثات مع بيانات التاجر والزبون كاملة.
 * - قراءة المحادثة كاملة، مع بحث وفلترة شاملة.
 * - الأدمن وحده يمكنه حذف المحادثة بالكامل.
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
import {
  ChevronLeft,
  MessageCircle,
  Search,
  X,
  Trash2,
  User,
  Store,
  Package,
  Calendar,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text, ArabicTextInput as TextInput } from '@/components/ArabicText';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import { formatChatTime, stripProductLink, type ChatMessage } from '@/lib/chat';

const ADMIN_API_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/admin-api`;

type Person = { id: string; full_name: string; phone: string | null; email: string };

type AdminChat = {
  id: string;
  code: string;
  product_id: string;
  customer_id: string;
  merchant_id: string;
  last_message: string | null;
  last_message_at: string;
  created_at: string;
  customer_unread: number;
  merchant_unread: number;
  message_count: number;
  customer: Person | null;
  merchant: Person | null;
  product: { id: string; name: string; slug: string | null; price: string } | null;
};

type SortKey = 'recent' | 'oldest' | 'most_messages';

export default function AdminChatsScreen() {
  const [chats, setChats] = useState<AdminChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [merchantFilter, setMerchantFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [openChat, setOpenChat] = useState<AdminChat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` };
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${ADMIN_API_BASE}/chats`, { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'تعذّر تحميل المحادثات');
      }
      const data = await res.json();
      setChats(data.chats || []);
    } catch (e: any) {
      setError(e?.message ?? 'خطأ غير متوقع');
    }
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const merchants = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of chats) if (c.merchant_id) map.set(c.merchant_id, c.merchant?.full_name || c.merchant?.email || 'تاجر');
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [chats]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = chats.filter(c => {
      if (q) {
        const hay = [
          c.code, c.product?.name, c.last_message,
          c.customer?.full_name, c.customer?.email, c.customer?.phone,
          c.merchant?.full_name, c.merchant?.email, c.merchant?.phone,
          c.id,
        ].map(v => (v || '').toString().toLowerCase());
        if (!hay.some(v => v.includes(q))) return false;
      }
      if (merchantFilter !== 'all' && c.merchant_id !== merchantFilter) return false;
      if (dateFrom) {
        const from = new Date(dateFrom).getTime();
        if (!isNaN(from) && new Date(c.created_at).getTime() < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo).getTime() + 24 * 60 * 60 * 1000;
        if (!isNaN(to) && new Date(c.created_at).getTime() > to) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sortKey === 'recent') return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      if (sortKey === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return (b.message_count || 0) - (a.message_count || 0);
    });
    return list;
  }, [chats, search, merchantFilter, dateFrom, dateTo, sortKey]);

  const viewChat = async (chat: AdminChat) => {
    setOpenChat(chat);
    setMessages([]);
    setMessagesLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${ADMIN_API_BASE}/chats/${chat.id}/messages`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذّر تحميل الرسائل');
      setMessages(data.messages || []);
    } catch (e: any) {
      Alert.alert('خطأ', e?.message ?? 'تعذّر تحميل الرسائل');
    } finally {
      setMessagesLoading(false);
    }
  };

  const deleteChat = (chat: AdminChat) => {
    Alert.alert('حذف المحادثة', `سيتم حذف المحادثة ${chat.code} وكل رسائلها نهائياً.`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            const headers = await getAuthHeaders();
            const res = await fetch(`${ADMIN_API_BASE}/chats/${chat.id}`, { method: 'DELETE', headers });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'تعذّر حذف المحادثة');
            // تحديث فوري للـ state
            setChats(prev => prev.filter(c => c.id !== chat.id));
            setOpenChat(null);
            Alert.alert('تم', 'تم حذف المحادثة بنجاح');
            // إعادة تحميل من الخادم للتأكد
            await load();
          } catch (e: any) {
            Alert.alert('خطأ', e?.message ?? 'تعذّر حذف المحادثة');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>المحادثات</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchInput}>
          <Search size={18} color={colors.neutral[400]} />
          <TextInput
            style={styles.searchField}
            placeholder="ابحث برقم المحادثة، الزبون، التاجر أو المنتج…"
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <X size={16} color={colors.neutral[400]} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.sm }}>
        <TouchableOpacity style={[styles.chip, merchantFilter === 'all' && styles.chipActive]} onPress={() => setMerchantFilter('all')}>
          <Store size={12} color={merchantFilter === 'all' ? colors.white : colors.primary[600]} />
          <Text style={[styles.chipText, merchantFilter === 'all' && styles.chipTextActive, { marginLeft: 4 }]}>كل التجّار</Text>
        </TouchableOpacity>
        {merchants.map(m => (
          <TouchableOpacity key={m.id} style={[styles.chip, merchantFilter === m.id && styles.chipActive]} onPress={() => setMerchantFilter(m.id)}>
            <Text style={[styles.chipText, merchantFilter === m.id && styles.chipTextActive]} numberOfLines={1}>{m.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.sm }}>
        {([
          { label: 'الأحدث', value: 'recent' as const },
          { label: 'الأقدم', value: 'oldest' as const },
          { label: 'الأكثر رسائل', value: 'most_messages' as const },
        ]).map(o => (
          <TouchableOpacity key={o.value} style={[styles.chip, sortKey === o.value && styles.chipActive]} onPress={() => setSortKey(o.value)}>
            <Text style={[styles.chipText, sortKey === o.value && styles.chipTextActive]}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.advWrap}>
        <TouchableOpacity style={styles.advToggle} onPress={() => setShowAdvanced(v => !v)}>
          <Calendar size={14} color={colors.primary[600]} />
          <Text style={styles.advToggleText}>{showAdvanced ? 'إخفاء فلترة التاريخ' : 'فلترة حسب التاريخ'}</Text>
        </TouchableOpacity>
        {showAdvanced ? (
          <View style={styles.advPanel}>
            <View style={styles.advRow}>
              <View style={styles.advField}>
                <Text style={styles.advLabel}>من تاريخ</Text>
                <TextInput style={styles.advInput} value={dateFrom} onChangeText={setDateFrom} placeholder="YYYY-MM-DD" autoCapitalize="none" />
              </View>
              <View style={styles.advField}>
                <Text style={styles.advLabel}>إلى تاريخ</Text>
                <TextInput style={styles.advInput} value={dateTo} onChangeText={setDateTo} placeholder="YYYY-MM-DD" autoCapitalize="none" />
              </View>
            </View>
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary[600]} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Text style={styles.countText}>{`عدد المحادثات المعروضة: ${filtered.length}`}</Text>
          {filtered.length === 0 ? (
            <View style={styles.center}>
              <MessageCircle size={44} color={colors.neutral[300]} />
              <Text style={styles.emptyTitle}>لا توجد محادثات</Text>
            </View>
          ) : (
            filtered.map(chat => (
              <TouchableOpacity key={chat.id} style={styles.card} activeOpacity={0.85} onPress={() => viewChat(chat)}>
                <View style={styles.cardHeader}>
                  <Text style={styles.code}>{chat.code}</Text>
                  <Text style={styles.time}>{formatChatTime(chat.last_message_at)}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Package size={13} color={colors.accent[600]} />
                  <Text style={styles.metaText} numberOfLines={1}>{chat.product?.name || 'منتج محذوف'}</Text>
                </View>
                <View style={styles.metaRow}>
                  <User size={13} color={colors.primary[600]} />
                  <Text style={styles.metaText} numberOfLines={1}>
                    {`الزبون: ${chat.customer?.full_name || '—'} • ${chat.customer?.email || ''} ${chat.customer?.phone || ''}`}
                  </Text>
                </View>
                <View style={styles.metaRow}>
                  <Store size={13} color={colors.success[600]} />
                  <Text style={styles.metaText} numberOfLines={1}>
                    {`التاجر: ${chat.merchant?.full_name || '—'} • ${chat.merchant?.email || ''} ${chat.merchant?.phone || ''}`}
                  </Text>
                </View>
                <Text style={styles.lastMsg} numberOfLines={1}>
                  {stripProductLink(chat.last_message || '') || 'لا توجد رسائل'}
                </Text>
                <View style={styles.cardFooter}>
                  <Text style={styles.footerText}>{`${chat.message_count} رسالة`}</Text>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteChat(chat)}>
                    <Trash2 size={14} color={colors.error[600]} />
                    <Text style={styles.deleteText}>حذف</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={!!openChat} animationType="slide" onRequestClose={() => setOpenChat(null)}>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setOpenChat(null)}>
              <X size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.title}>{openChat?.code ?? 'المحادثة'}</Text>
            <View style={{ width: 40 }} />
          </View>
          {openChat ? (
            <View style={styles.modalInfo}>
              <Text style={styles.modalInfoText}>{`المنتج: ${openChat.product?.name || '—'}`}</Text>
              <Text style={styles.modalInfoText}>{`الزبون: ${openChat.customer?.full_name || '—'} (${openChat.customer?.email || '—'})`}</Text>
              <Text style={styles.modalInfoText}>{`التاجر: ${openChat.merchant?.full_name || '—'} (${openChat.merchant?.email || '—'})`}</Text>
            </View>
          ) : null}
          {messagesLoading ? (
            <View style={styles.center}><ActivityIndicator size="large" color={colors.primary[600]} /></View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}>
              {messages.map(m => (
                <View
                  key={m.id}
                  style={[
                    styles.bubble,
                    m.sender_role === 'customer' ? styles.bubbleCustomer : m.sender_role === 'merchant' ? styles.bubbleMerchant : styles.bubbleSystem,
                  ]}
                >
                  <Text style={styles.bubbleRole}>
                    {m.sender_role === 'customer' ? 'الزبون' : m.sender_role === 'merchant' ? 'التاجر' : 'النظام'}
                  </Text>
                  <Text style={styles.bubbleBody}>{m.body}</Text>
                  <Text style={styles.bubbleTime}>{formatChatTime(m.created_at)}</Text>
                </View>
              ))}
              {messages.length === 0 ? <Text style={styles.emptyMsg}>لا توجد رسائل في هذه المحادثة.</Text> : null}
            </ScrollView>
          )}
          <View style={styles.modalBar}>
            <Button
              title={deleting ? 'جاري الحذف…' : 'حذف المحادثة نهائياً'}
              onPress={() => openChat && deleteChat(openChat)}
              loading={deleting}
              variant="outline"
              fullWidth
            />
          </View>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  searchRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  searchInput: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  searchField: { flex: 1, ...typography.bodySmall, color: colors.text },
  chipsScroll: { flexGrow: 0, paddingBottom: spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', maxWidth: 220,
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary[600], borderColor: colors.primary[600] },
  chipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  chipTextActive: { color: colors.white },
  advWrap: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  advToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  advToggleText: { ...typography.caption, color: colors.primary[600], fontWeight: '700' },
  advPanel: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border,
  },
  advRow: { flexDirection: 'row', gap: spacing.sm },
  advField: { flex: 1, gap: 4 },
  advLabel: { ...typography.caption, color: colors.textMuted, fontWeight: '700' },
  advInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.sm, paddingVertical: 8,
    ...typography.caption, color: colors.text, backgroundColor: colors.background,
  },
  countText: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.sm, gap: 4, ...shadows.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  code: { ...typography.bodySmall, color: colors.primary[700], fontWeight: '800' },
  time: { ...typography.caption, color: colors.textMuted, fontSize: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { flex: 1, ...typography.caption, color: colors.textSecondary },
  lastMsg: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  cardFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm,
  },
  footerText: { ...typography.caption, color: colors.textMuted, fontWeight: '700' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deleteText: { ...typography.caption, color: colors.error[600], fontWeight: '700' },
  modalInfo: { backgroundColor: colors.primary[50], padding: spacing.md, gap: 2 },
  modalInfoText: { ...typography.caption, color: colors.primary[700], fontWeight: '600' },
  bubble: { borderRadius: radius.lg, padding: spacing.md, maxWidth: '90%' },
  bubbleCustomer: { backgroundColor: colors.primary[50], alignSelf: 'flex-start' },
  bubbleMerchant: { backgroundColor: colors.success[50], alignSelf: 'flex-end' },
  bubbleSystem: { backgroundColor: colors.neutral[100], alignSelf: 'center' },
  bubbleRole: { ...typography.caption, color: colors.textMuted, fontWeight: '700' },
  bubbleBody: { ...typography.bodySmall, color: colors.text },
  bubbleTime: { ...typography.caption, color: colors.textMuted, fontSize: 10, marginTop: 2 },
  modalBar: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  emptyTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  emptyMsg: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  errorText: { ...typography.caption, color: colors.error[600], textAlign: 'center', marginBottom: spacing.sm },
});
