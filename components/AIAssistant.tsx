/**
 * المساعد الذكي العائم (Groq).
 *
 * - أيقونة عائمة راقية وبسيطة في زاوية الشاشة، لا تغطّي المحتوى.
 * - الزبون يستطيع إخفاؤها نهائياً (تُحفظ رغبته على الجهاز)، ويمكن
 *   إعادة إظهارها من صفحة الحساب ← «إظهار المساعد الذكي».
 * - تظهر الأيقونة فقط عندما يفعّل الأدمن المساعد ويضبط مفتاح Groq.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Animated,
  Easing,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Bot, X, Send, RefreshCcw, ChevronLeft } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text, ArabicTextInput as TextInput } from '@/components/ArabicText';
import { supabase } from '@/lib/supabase';
import { primaryImageUrl } from '@/lib/productImages';
import {
  fetchAIPublicConfig,
  sendAIChat,
  type AIMessage,
  type AIPublicConfig,
} from '@/lib/ai';

const HIDE_KEY = '@varlo/ai_assistant_hidden';

/** إخفاء/إظهار المساعد من أي مكان في التطبيق. */
export async function setAIAssistantHidden(hidden: boolean) {
  await AsyncStorage.setItem(HIDE_KEY, hidden ? '1' : '0');
}
export async function isAIAssistantHidden(): Promise<boolean> {
  return (await AsyncStorage.getItem(HIDE_KEY)) === '1';
}

const QUICK_PROMPTS = [
  'اقترح لي منتجات بأقل من 50$',
  'شو أحدث المنتجات عندكم؟',
  'كيف بقدر أتابع طلبي؟',
  'كيف بشحن رصيد المحفظة؟',
];

/** يلتقط وسوم [[PRODUCT:slug]] التي يضيفها المساعد الذكي عند اقتراح منتج. */
const PRODUCT_TAG = /\[\[PRODUCT:([a-z0-9-]+)\]\]/gi;

type MessagePart = { type: 'text'; value: string } | { type: 'product'; slug: string };

function parseMessageParts(content: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  PRODUCT_TAG.lastIndex = 0;
  while ((match = PRODUCT_TAG.exec(content)) !== null) {
    const text = content.slice(lastIndex, match.index).trim();
    if (text) parts.push({ type: 'text', value: text });
    parts.push({ type: 'product', slug: match[1] });
    lastIndex = PRODUCT_TAG.lastIndex;
  }
  const rest = content.slice(lastIndex).trim();
  if (rest) parts.push({ type: 'text', value: rest });
  return parts;
}

type MiniProduct = {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price: number | null;
  imageUrl: string | null;
};

/** كاش بسيط بذاكرة التطبيق لتفادي جلب نفس المنتج أكثر من مرة بجلسة واحدة. */
const productCache = new Map<string, MiniProduct | null>();

function ProductMiniCard({ slug, onOpen }: { slug: string; onOpen: (slug: string) => void }) {
  const [product, setProduct] = useState<MiniProduct | null | undefined>(productCache.get(slug));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (productCache.has(slug)) {
      setProduct(productCache.get(slug));
      return;
    }
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('products')
        .select('id,name,slug,price,compare_at_price,images:product_images(image_url,sort_order,is_primary)')
        .eq('slug', slug)
        .eq('status', 'active')
        .maybeSingle();
      if (!alive) return;
      if (!data) {
        productCache.set(slug, null);
        setProduct(null);
        setFailed(true);
        return;
      }
      const mini: MiniProduct = {
        id: data.id,
        name: data.name,
        slug: data.slug,
        price: Number(data.price ?? 0),
        compare_at_price: data.compare_at_price != null ? Number(data.compare_at_price) : null,
        imageUrl: primaryImageUrl(data as any),
      };
      productCache.set(slug, mini);
      setProduct(mini);
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  if (failed) return null;

  if (product === undefined) {
    return (
      <View style={styles.productCardLoading}>
        <ActivityIndicator size="small" color={colors.textSecondary} />
      </View>
    );
  }
  if (!product) return null;

  const hasDiscount = !!product.compare_at_price && product.compare_at_price > product.price;

  return (
    <TouchableOpacity style={styles.productCard} activeOpacity={0.85} onPress={() => onOpen(product.slug)}>
      <View style={styles.productImageWrap}>
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} style={styles.productImage} resizeMode="cover" />
        ) : (
          <View style={[styles.productImage, styles.productImagePlaceholder]} />
        )}
      </View>
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={2}>
          {product.name}
        </Text>
        <View style={styles.productPriceRow}>
          <Text style={styles.productPrice}>${product.price.toFixed(2)}</Text>
          {hasDiscount ? (
            <Text style={styles.productOldPrice}>${product.compare_at_price!.toFixed(2)}</Text>
          ) : null}
        </View>
        <View style={styles.productCta}>
          <Text style={styles.productCtaText}>عرض المنتج</Text>
          <ChevronLeft size={14} color={colors.primary[600]} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function AIAssistant() {
  const [config, setConfig] = useState<AIPublicConfig | null>(null);
  const [hidden, setHidden] = useState(true);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const pulse = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    const [cfg, isHidden] = await Promise.all([fetchAIPublicConfig(), isAIAssistantHidden()]);
    setConfig(cfg);
    setHidden(isHidden);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1600, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const available = !!config?.is_enabled && !!config?.has_key;
  if (!available || hidden) return null;

  const welcome =
    config?.welcome_text?.trim() ||
    'أهلاً بك في Varlo 👋 أنا مساعدك الذكي. اسألني عن أي منتج أو سعر أو خطوة داخل المتجر.';

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setError(null);
    setInput('');
    const next: AIMessage[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setSending(true);
    try {
      const reply = await sendAIChat(next);
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (e: any) {
      setError(e?.message || 'تعذّر الاتصال بالمساعد الذكي.');
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    }
  };

  const openProduct = (slug: string) => {
    setOpen(false);
    router.push(`/product/${slug}` as any);
  };

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  return (
    <>
      <View style={styles.fabWrap} pointerEvents="box-none">
        <Animated.View style={[styles.fabPulse, { transform: [{ scale }], opacity }]} />
        <TouchableOpacity
          style={styles.fab}
          activeOpacity={0.85}
          onPress={() => setOpen(true)}
          accessibilityLabel="المساعد الذكي"
        >
          <Bot size={24} color={colors.white} />
        </TouchableOpacity>
      </View>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <TouchableOpacity style={styles.backdropTap} activeOpacity={1} onPress={() => setOpen(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.sheet}
          >
            <View style={styles.handle} />

            <View style={styles.header}>
              <View style={styles.headerInfo}>
                <View style={styles.avatar}>
                  <Image
                    source={require('@/assets/images/icon.png')}
                    style={styles.avatarImg}
                    resizeMode="cover"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.headerTitle}>مساعد Style الذكي</Text>
                  <View style={styles.statusRow}>
                    <View style={styles.dot} />
                    <Text style={styles.headerSub}>متصل الآن</Text>
                  </View>
                </View>
              </View>
              <View style={styles.headerActions}>
                {messages.length > 0 ? (
                  <TouchableOpacity style={styles.iconBtn} onPress={() => setMessages([])}>
                    <RefreshCcw size={17} color={colors.textSecondary} />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={styles.iconBtn} onPress={() => setOpen(false)}>
                  <X size={18} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              ref={scrollRef}
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
              keyboardShouldPersistTaps="handled"
            >
              <View style={[styles.bubble, styles.botBubble]}>
                <Text style={styles.botText}>{welcome}</Text>
              </View>

              {messages.map((m, i) => {
                if (m.role === 'user') {
                  return (
                    <View key={i} style={[styles.bubble, styles.userBubble]}>
                      <Text style={styles.userText}>{m.content}</Text>
                    </View>
                  );
                }
                const parts = parseMessageParts(m.content);
                return (
                  <View key={i} style={[styles.bubble, styles.botBubble]}>
                    {parts.map((part, pi) =>
                      part.type === 'text' ? (
                        <Text key={pi} style={[styles.botText, pi > 0 && { marginTop: spacing.xs }]}>
                          {part.value}
                        </Text>
                      ) : (
                        <ProductMiniCard key={pi} slug={part.slug} onOpen={openProduct} />
                      )
                    )}
                  </View>
                );
              })}

              {sending ? (
                <View style={[styles.bubble, styles.botBubble, styles.typing]}>
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                  <Text style={styles.typingText}>يكتب الآن...</Text>
                </View>
              ) : null}

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {messages.length === 0 ? (
                <View style={styles.quickWrap}>
                  {QUICK_PROMPTS.map(q => (
                    <TouchableOpacity key={q} style={styles.quickChip} onPress={() => send(q)}>
                      <Text style={styles.quickText}>{q}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.inputBar}>
              <TextInput
                style={styles.input}
                placeholder="اكتب سؤالك هنا..."
                placeholderTextColor={colors.textMuted}
                value={input}
                onChangeText={setInput}
                multiline
                onSubmitEditing={() => send()}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
                onPress={() => send()}
                disabled={!input.trim() || sending}
              >
                <Send size={18} color={colors.white} />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fabWrap: {
    position: 'absolute',
    left: spacing.md,
    bottom: Platform.OS === 'web' ? 92 : 96,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
  },
  fabPulse: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary[600],
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary[600],
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    ...shadows.lg,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  backdropTap: { flex: 1 },
  sheet: {
    height: '82%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.neutral[300],
    marginTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.neutral[100],
  },
  avatarImg: { width: '100%', height: '100%' },
  headerTitle: { ...typography.h4, color: colors.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success[500] },
  headerSub: { ...typography.caption, color: colors.textSecondary },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  body: { flex: 1, backgroundColor: colors.background },
  bodyContent: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.lg },
  bubble: { maxWidth: '88%', paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderRadius: radius.lg },
  botBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopRightRadius: radius.sm,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary[600],
    borderTopLeftRadius: radius.sm,
  },
  botText: { ...typography.bodySmall, color: colors.text, lineHeight: 22 },
  userText: { ...typography.bodySmall, color: colors.white, lineHeight: 22 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  typingText: { ...typography.caption, color: colors.textSecondary },
  errorBox: {
    backgroundColor: colors.error[50],
    borderWidth: 1,
    borderColor: colors.error[200],
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  errorText: { ...typography.caption, color: colors.error[700] },
  quickWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  quickChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickText: { ...typography.caption, color: colors.text },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    minHeight: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.inputBg,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    paddingBottom: 12,
    ...typography.bodySmall,
    color: colors.text,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary[600],
  },
  sendBtnDisabled: { opacity: 0.4 },
  productCardLoading: {
    height: 76,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 220,
  },
  productImageWrap: {
    width: 60,
    height: 60,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.neutral[100],
  },
  productImage: { width: '100%', height: '100%' },
  productImagePlaceholder: { backgroundColor: colors.neutral[200] },
  productInfo: { flex: 1, gap: 2 },
  productName: { ...typography.caption, color: colors.text, fontWeight: '700' },
  productPriceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  productPrice: { ...typography.bodySmall, color: colors.primary[600], fontWeight: '700' },
  productOldPrice: {
    ...typography.caption,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  productCta: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  productCtaText: { ...typography.caption, color: colors.primary[600], fontWeight: '600' },
});
