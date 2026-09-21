/**
 * صفحة «الرسائل» في لوحة تحكم التاجر.
 * - تعرض المحادثات القادمة من الزبائن بشكل مرتّب.
 * - لا تُعرض أي معلومات شخصية عن الزبون إطلاقاً، فقط معرّف المحادثة (مثال: Chat-a1b2-c3d4e-f5).
 * - أول رسالة في كل محادثة هي المنتج الذي فتح الزبون المحادثة منه.
 * - لا يمكن للتاجر حذف أي رسالة أو محادثة.
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
  Image,
} from 'react-native';
import { router } from 'expo-router';
import {
  ChevronLeft,
  MessageCircle,
  Search,
  X,
  ShieldCheck,
  Lock,
  Package,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text, ArabicTextInput as TextInput } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { fetchChats, formatChatTime, stripProductLink, type Chat } from '@/lib/chat';

type UnreadFilter = 'all' | 'unread' | 'read';

export default function MerchantChatsScreen() {
  const { user } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [unreadFilter, setUnreadFilter] = useState<UnreadFilter>('all');
  const [productFilter, setProductFilter] = useState<string>('all');

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      setChats(await fetchChats('merchant', user.id));
    } catch (e: any) {
      setError(e?.message ?? 'تعذّر تحميل الرسائل');
    }
  }, [user]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // تحديث لحظي عند وصول رسالة جديدة
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`merchant-chats:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chats', filter: `merchant_id=eq.${user.id}` },
        () => { load(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const products = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of chats) if (c.product?.id) map.set(c.product.id, c.product.name);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [chats]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return chats.filter(c => {
      if (q) {
        const match =
          (c.code || '').toLowerCase().includes(q) ||
          (c.product?.name || '').toLowerCase().includes(q) ||
          (c.last_message || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      if (unreadFilter === 'unread' && c.merchant_unread <= 0) return false;
      if (unreadFilter === 'read' && c.merchant_unread > 0) return false;
      if (productFilter !== 'all' && c.product_id !== productFilter) return false;
      return true;
    });
  }, [chats, search, unreadFilter, productFilter]);

  const totalUnread = useMemo(
    () => chats.reduce((sum, c) => sum + (c.merchant_unread || 0), 0),
    [chats]
  );

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <Header />
        <View style={styles.center}>
          <Lock size={40} color={colors.neutral[300]} />
          <Text style={styles.emptyTitle}>سجّل الدخول للوصول إلى الرسائل</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header />

      <View style={styles.privacyBar}>
        <ShieldCheck size={14} color={colors.success[600]} />
        <Text style={styles.privacyText}>
          خصوصية الزبائن محمية: تظهر لك المحادثة بمعرّف مشفّر فقط، بدون أي بيانات شخصية.
        </Text>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchInput}>
          <Search size={18} color={colors.neutral[400]} />
          <TextInput
            style={styles.searchField}
            placeholder="ابحث برقم المحادثة أو اسم المنتج…"
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.sm }}
      >
        {([
          { label: 'كل المحادثات', value: 'all' as const },
          { label: `غير المقروءة (${totalUnread})`, value: 'unread' as const },
          { label: 'المقروءة', value: 'read' as const },
        ]).map(f => (
          <TouchableOpacity
            key={f.value}
            style={[styles.chip, unreadFilter === f.value && styles.chipActive]}
            onPress={() => setUnreadFilter(f.value)}
          >
            <Text style={[styles.chipText, unreadFilter === f.value && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {products.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.sm }}
        >
          <TouchableOpacity
            style={[styles.chip, productFilter === 'all' && styles.chipActive]}
            onPress={() => setProductFilter('all')}
          >
            <Package size={12} color={productFilter === 'all' ? colors.white : colors.primary[600]} />
            <Text style={[styles.chipText, productFilter === 'all' && styles.chipTextActive, { marginLeft: 4 }]}>كل المنتجات</Text>
          </TouchableOpacity>
          {products.map(p => (
            <TouchableOpacity
              key={p.id}
              style={[styles.chip, productFilter === p.id && styles.chipActive]}
              onPress={() => setProductFilter(p.id)}
            >
              <Text style={[styles.chipText, productFilter === p.id && styles.chipTextActive]} numberOfLines={1}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {filtered.length === 0 ? (
            <View style={styles.center}>
              <MessageCircle size={44} color={colors.neutral[300]} />
              <Text style={styles.emptyTitle}>لا توجد رسائل</Text>
              <Text style={styles.emptyMsg}>ستظهر هنا محادثات الزبائن حول منتجاتك فور وصولها.</Text>
            </View>
          ) : (
            filtered.map(chat => (
              <TouchableOpacity
                key={chat.id}
                style={[styles.card, chat.merchant_unread > 0 && styles.cardUnread]}
                activeOpacity={0.8}
                onPress={() => router.push(`/chat/${chat.id}`)}
              >
                {chat.product?.images?.[0]?.image_url ? (
                  <Image source={{ uri: chat.product.images[0].image_url }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback]}>
                    <MessageCircle size={18} color={colors.primary[600]} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardCode}>{chat.code}</Text>
                  <Text style={styles.cardTitle} numberOfLines={1}>{chat.product?.name || 'منتج'}</Text>
                  <Text style={styles.cardMsg} numberOfLines={1}>
                    {stripProductLink(chat.last_message || '') || 'لا توجد رسائل بعد'}
                  </Text>
                </View>
                <View style={styles.cardMeta}>
                  <Text style={styles.cardTime}>{formatChatTime(chat.last_message_at)}</Text>
                  {chat.merchant_unread > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{chat.merchant_unread}</Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
        <ChevronLeft size={24} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.title}>الرسائل</Text>
      <View style={{ width: 40 }} />
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  privacyBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.success[50], paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  privacyText: { flex: 1, ...typography.caption, color: colors.success[700], fontWeight: '600' },
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
    flexDirection: 'row', alignItems: 'center', maxWidth: 200,
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary[600], borderColor: colors.primary[600] },
  chipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  chipTextActive: { color: colors.white },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm,
  },
  cardUnread: { borderWidth: 1.5, borderColor: colors.primary[300] },
  thumb: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.neutral[100] },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  cardTitle: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  cardCode: { ...typography.bodySmall, color: colors.primary[700], fontWeight: '800' },
  cardMsg: { ...typography.caption, color: colors.textMuted },
  cardMeta: { alignItems: 'flex-end', gap: 4 },
  cardTime: { ...typography.caption, color: colors.textMuted, fontSize: 10 },
  badge: { backgroundColor: colors.error[500], borderRadius: 10, minWidth: 20, paddingHorizontal: 5, paddingVertical: 1, alignItems: 'center' },
  badgeText: { ...typography.caption, color: colors.white, fontWeight: '800', fontSize: 10 },
  emptyTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  emptyMsg: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  errorText: { ...typography.caption, color: colors.error[600], textAlign: 'center', marginBottom: spacing.sm },
});
