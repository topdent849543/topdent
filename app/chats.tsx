/**
 * قائمة محادثات الزبون مع التجّار.
 * لا يمكن حذف أي محادثة أو رسالة — كل شيء محفوظ بشكل دائم.
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
import { ChevronLeft, MessageCircle, Search, X, Lock } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text, ArabicTextInput as TextInput } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { fetchChats, formatChatTime, stripProductLink, type Chat } from '@/lib/chat';

export default function CustomerChatsScreen() {
  const { user } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      setChats(await fetchChats('customer', user.id));
    } catch (e: any) {
      setError(e?.message ?? 'تعذّر تحميل المحادثات');
    }
  }, [user]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(
      c =>
        (c.code || '').toLowerCase().includes(q) ||
        (c.product?.name || '').toLowerCase().includes(q) ||
        (c.last_message || '').toLowerCase().includes(q)
    );
  }, [chats, search]);

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <Header />
        <View style={styles.center}>
          <Lock size={40} color={colors.neutral[300]} />
          <Text style={styles.emptyTitle}>سجّل الدخول لعرض محادثاتك</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header />

      <View style={styles.searchRow}>
        <View style={styles.searchInput}>
          <Search size={18} color={colors.neutral[400]} />
          <TextInput
            style={styles.searchField}
            placeholder="ابحث باسم المنتج أو رقم المحادثة…"
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
              <Text style={styles.emptyTitle}>لا توجد محادثات بعد</Text>
              <Text style={styles.emptyMsg}>افتح أي منتج واضغط «التحدث مع التاجر» لبدء محادثة.</Text>
            </View>
          ) : (
            filtered.map(chat => (
              <TouchableOpacity
                key={chat.id}
                style={styles.card}
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
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {chat.product?.name || 'منتج'}
                  </Text>
                  <Text style={styles.cardCode}>{chat.code}</Text>
                  <Text style={styles.cardMsg} numberOfLines={1}>
                    {stripProductLink(chat.last_message || '') || 'ابدأ المحادثة الآن'}
                  </Text>
                </View>
                <View style={styles.cardMeta}>
                  <Text style={styles.cardTime}>{formatChatTime(chat.last_message_at)}</Text>
                  {chat.customer_unread > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{chat.customer_unread}</Text>
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
      <Text style={styles.title}>محادثاتي</Text>
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
  searchRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  searchInput: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  searchField: { flex: 1, ...typography.bodySmall, color: colors.text },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm,
  },
  thumb: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.neutral[100] },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  cardTitle: { ...typography.bodySmall, color: colors.text, fontWeight: '700' },
  cardCode: { ...typography.caption, color: colors.primary[600], fontWeight: '700' },
  cardMsg: { ...typography.caption, color: colors.textMuted },
  cardMeta: { alignItems: 'flex-end', gap: 4 },
  cardTime: { ...typography.caption, color: colors.textMuted, fontSize: 10 },
  badge: { backgroundColor: colors.error[500], borderRadius: 10, minWidth: 20, paddingHorizontal: 5, paddingVertical: 1, alignItems: 'center' },
  badgeText: { ...typography.caption, color: colors.white, fontWeight: '800', fontSize: 10 },
  emptyTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  emptyMsg: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  errorText: { ...typography.caption, color: colors.error[600], textAlign: 'center', marginBottom: spacing.sm },
});
