/**
 * منطق المحادثات بين الزبون والتاجر.
 *
 * ملاحظات مهمة:
 * - الرسائل لا يمكن حذفها أو تعديلها من الزبون أو التاجر إطلاقاً (مفروض على مستوى قاعدة البيانات).
 * - التاجر لا يرى أي معلومات شخصية عن الزبون، بل يرى معرّف المحادثة فقط (مثال: Chat-a1b2-c3d4e-f5).
 * - أول رسالة في أي محادثة هي رابط المنتج الذي فُتحت المحادثة منه.
 */
import { supabase } from '@/lib/supabase';

export type Chat = {
  id: string;
  code: string;
  product_id: string;
  customer_id: string;
  merchant_id: string;
  last_message: string | null;
  last_message_at: string;
  customer_unread: number;
  merchant_unread: number;
  is_archived: boolean;
  created_at: string;
  product?: {
    id: string;
    name: string;
    slug: string;
    price: number | string;
    images?: { image_url: string }[];
  } | null;
};

export type ChatMessage = {
  id: string;
  chat_id: string;
  sender_id: string | null;
  sender_role: 'customer' | 'merchant' | 'system';
  body: string;
  created_at: string;
};

const PRODUCT_LINK_RE = /product:\/\/([^\s]+)/;

/** استخراج سلاق المنتج من رسالة النظام الأولى (إن وُجد). */
export function extractProductSlug(body: string): string | null {
  const match = body.match(PRODUCT_LINK_RE);
  return match ? match[1] : null;
}

/** نص الرسالة بدون الرابط الخام (للعرض). */
export function stripProductLink(body: string): string {
  return body.replace(PRODUCT_LINK_RE, '').trim();
}

/** فتح/إنشاء محادثة لمنتج — يعيد المحادثة جاهزة. */
export async function openProductChat(productId: string): Promise<Chat> {
  const { data, error } = await supabase.rpc('get_or_create_product_chat', {
    p_product_id: productId,
  });
  if (error) throw new Error(error.message);
  const chat = Array.isArray(data) ? data[0] : data;
  if (!chat) throw new Error('تعذّر فتح المحادثة');
  return chat as Chat;
}

/** جلب محادثة واحدة مع بيانات المنتج. */
export async function fetchChat(chatId: string): Promise<Chat | null> {
  const { data, error } = await supabase
    .from('chats')
    .select('*, product:products(id, name, slug, price, images:product_images(image_url))')
    .eq('id', chatId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Chat) ?? null;
}

/** محادثات المستخدم الحالي حسب دوره. */
export async function fetchChats(role: 'customer' | 'merchant', userId: string): Promise<Chat[]> {
  const column = role === 'customer' ? 'customer_id' : 'merchant_id';
  const { data, error } = await supabase
    .from('chats')
    .select('*, product:products(id, name, slug, price, images:product_images(image_url))')
    .eq(column, userId)
    .order('last_message_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Chat[]) ?? [];
}

/** رسائل محادثة مرتبة زمنياً. */
export async function fetchMessages(chatId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as ChatMessage[]) ?? [];
}

/** إرسال رسالة. */
export async function sendMessage(
  chatId: string,
  senderId: string,
  role: 'customer' | 'merchant',
  body: string
): Promise<ChatMessage> {
  const clean = body.trim();
  if (!clean) throw new Error('الرسالة فارغة');
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ chat_id: chatId, sender_id: senderId, sender_role: role, body: clean })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as ChatMessage;
}

/** تصفير عدّاد غير المقروء للمستخدم الحالي. */
export async function markChatRead(chatId: string): Promise<void> {
  await supabase.rpc('mark_chat_read', { p_chat_id: chatId });
}

/** الاشتراك اللحظي برسائل محادثة. */
export function subscribeToChat(chatId: string, onMessage: (message: ChatMessage) => void) {
  const channel = supabase
    .channel(`chat:${chatId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `chat_id=eq.${chatId}` },
      payload => onMessage(payload.new as ChatMessage)
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/** تنسيق وقت الرسالة. */
export function formatChatTime(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  return sameDay
    ? date.toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('ar-SY', { day: 'numeric', month: 'short' }) +
        ' ' +
        date.toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' });
}
