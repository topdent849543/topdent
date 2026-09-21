/**
 * شاشة المحادثة (يستخدمها الزبون والتاجر معاً).
 * - أول رسالة دائماً هي المنتج الذي فُتحت منه المحادثة (قابلة للضغط).
 * - لا يوجد أي خيار لحذف الرسائل أو المحادثة.
 * - التاجر لا يرى أي معلومات عن الزبون سوى معرّف المحادثة.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Send, ShieldCheck, Package, Lock } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text, ArabicTextInput as TextInput } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import {
  fetchChat,
  fetchMessages,
  sendMessage,
  markChatRead,
  subscribeToChat,
  extractProductSlug,
  stripProductLink,
  formatChatTime,
  type Chat,
  type ChatMessage,
} from '@/lib/chat';
import { playFeedback } from '@/lib/sounds';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const role: 'customer' | 'merchant' | null = useMemo(() => {
    if (!chat || !user) return null;
    if (chat.customer_id === user.id) return 'customer';
    if (chat.merchant_id === user.id) return 'merchant';
    return null;
  }, [chat, user]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [c, m] = await Promise.all([fetchChat(String(id)), fetchMessages(String(id))]);
      setChat(c);
      setMessages(m);
      await markChatRead(String(id));
    } catch (e: any) {
      setError(e?.message ?? 'تعذّر تحميل المحادثة');
    }
  }, [id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!id) return;
    return subscribeToChat(String(id), incoming => {
      setMessages(prev => (prev.some(p => p.id === incoming.id) ? prev : [...prev, incoming]));
      if (incoming.sender_id !== user?.id) playFeedback('message');
      markChatRead(String(id));
    });
  }, [id, user?.id]);

  useEffect(() => {
    if (messages.length) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || !user || !role || sending) return;
    setSending(true);
    setText('');
    try {
      const created = await sendMessage(String(id), user.id, role, body);
      setMessages(prev => (prev.some(p => p.id === created.id) ? prev : [...prev, created]));
      playFeedback('tap');
    } catch (e: any) {
      setText(body);
      setError(e?.message ?? 'تعذّر إرسال الرسالة');
      playFeedback('error');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="المحادثة" subtitle="" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      </SafeAreaView>
    );
  }

  if (!chat || !role) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="المحادثة" subtitle="" />
        <View style={styles.center}>
          <Text style={styles.errorText}>{error ?? 'المحادثة غير متاحة'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title={role === 'merchant' ? chat.code : chat.product?.name || 'محادثة مع التاجر'}
        subtitle={role === 'merchant' ? 'محادثة مع زبون (هوية مخفية)' : chat.code}
      />

      <View style={styles.privacyBar}>
        <ShieldCheck size={14} color={colors.success[600]} />
        <Text style={styles.privacyText}>
          {role === 'merchant'
            ? 'خصوصية الزبون محمية — لا تظهر أي بيانات شخصية.'
            : 'محادثة آمنة مع التاجر — لا يرى التاجر بياناتك الشخصية.'}
        </Text>
        <Lock size={12} color={colors.textMuted} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
          renderItem={({ item }) => {
            if (item.sender_role === 'system') {
              const slug = extractProductSlug(item.body);
              return (
                <TouchableOpacity
                  style={styles.productCard}
                  activeOpacity={0.85}
                  disabled={!slug}
                  onPress={() => slug && router.push(`/product/${slug}`)}
                >
                  {chat.product?.images?.[0]?.image_url ? (
                    <Image
                      source={{ uri: chat.product.images[0].image_url }}
                      style={styles.productImage}
                    />
                  ) : (
                    <View style={[styles.productImage, styles.productPlaceholder]}>
                      <Package size={20} color={colors.neutral[400]} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.productLabel}>المنتج الذي فُتحت منه المحادثة</Text>
                    <Text style={styles.productName} numberOfLines={2}>
                      {stripProductLink(item.body).replace(/^المنتج:\s*/, '') || chat.product?.name}
                    </Text>
                    {chat.product?.price != null ? (
                      <Text style={styles.productPrice}>${Number(chat.product.price).toFixed(2)}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            }

            const mine = item.sender_role === role;
            return (
              <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.body}</Text>
                  <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>
                    {formatChatTime(item.created_at)}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        {error ? <Text style={styles.errorInline}>{error}</Text> : null}

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder="اكتب رسالتك…"
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Send size={18} color={colors.white} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
        <ChevronLeft size={24} color={colors.text} />
      </TouchableOpacity>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <View style={{ width: 40 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h4, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textMuted },
  privacyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.success[50],
  },
  privacyText: { ...typography.caption, color: colors.success[800], flex: 1 },
  productCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  productImage: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.neutral[100] },
  productPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  productLabel: { ...typography.caption, color: colors.textMuted },
  productName: { ...typography.bodySmall, fontWeight: '700', color: colors.text },
  productPrice: { ...typography.caption, fontWeight: '700', color: colors.primary[600] },
  bubbleRow: { flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleMine: { backgroundColor: colors.primary[600], borderBottomLeftRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.surface, borderBottomRightRadius: 4, borderWidth: 1, borderColor: colors.border },
  bubbleText: { ...typography.bodySmall, color: colors.text },
  bubbleTextMine: { color: colors.white },
  bubbleTime: { ...typography.caption, fontSize: 10, color: colors.textMuted, marginTop: 4 },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.7)' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    backgroundColor: colors.inputBg,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    ...typography.bodySmall,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.neutral[300] },
  errorText: { ...typography.body, color: colors.error[600], textAlign: 'center' },
  errorInline: { ...typography.caption, color: colors.error[600], textAlign: 'center', paddingBottom: spacing.xs },
});
