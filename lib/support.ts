/**
 * طبقة تذاكر الدعم.
 *
 * - الزبون يفتح تذكرة، وتصل فوراً لكل الأدمن عبر إشعار (Trigger في قاعدة البيانات).
 * - الأدمن يرد، ويصل الرد فوراً للزبون في صفحة الدعم (Realtime + إشعار).
 */
import { supabase } from '@/lib/supabase';

export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed' | string;

export type SupportTicket = {
  id: string;
  ticket_number: string | null;
  subject: string;
  message: string;
  category: string | null;
  status: TicketStatus;
  priority?: string | null;
  created_at: string;
  last_message: string | null;
  last_message_at: string;
  user_unread?: number;
  admin_unread?: number;
  user_id: string;
  customer_name?: string | null;
  customer_email?: string | null;
};

export type TicketMessage = {
  id: string;
  ticket_id: string;
  sender_id: string | null;
  sender_role: 'customer' | 'admin' | 'system';
  body: string;
  created_at: string;
};

export const TICKET_STATUS_LABEL: Record<string, string> = {
  open: 'مفتوحة',
  pending: 'بانتظار ردّك',
  resolved: 'تم الحل',
  closed: 'مغلقة',
};

export const TICKET_CATEGORIES = [
  { key: 'general', label: 'عام' },
  { key: 'order', label: 'طلب' },
  { key: 'product', label: 'منتج' },
  { key: 'payment', label: 'دفع' },
  { key: 'shipping', label: 'شحن' },
  { key: 'return', label: 'إرجاع' },
];

/** تذاكر الزبون الحالي. */
export async function fetchMyTickets(userId: string): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data as SupportTicket[]) ?? [];
}

/** كل التذاكر (أدمن فقط) مع بيانات صاحب التذكرة. */
export async function fetchAdminTickets(): Promise<SupportTicket[]> {
  const { data, error } = await supabase.rpc('admin_support_tickets');
  if (error) throw error;
  return (data as SupportTicket[]) ?? [];
}

/** رسائل تذكرة مرتّبة زمنياً. */
export async function fetchTicketMessages(ticketId: string): Promise<TicketMessage[]> {
  const { data, error } = await supabase
    .from('support_ticket_messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as TicketMessage[]) ?? [];
}

/** إنشاء تذكرة جديدة. */
export async function createTicket(input: {
  userId: string;
  subject: string;
  message: string;
  category: string;
}): Promise<SupportTicket> {
  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      user_id: input.userId,
      subject: input.subject.trim(),
      message: input.message.trim(),
      category: input.category,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as SupportTicket;
}

/** إرسال رسالة داخل التذكرة. */
export async function sendTicketMessage(
  ticketId: string,
  senderId: string,
  role: 'customer' | 'admin',
  body: string
): Promise<TicketMessage> {
  const { data, error } = await supabase
    .from('support_ticket_messages')
    .insert({ ticket_id: ticketId, sender_id: senderId, sender_role: role, body: body.trim() })
    .select('*')
    .single();
  if (error) throw error;
  return data as TicketMessage;
}

/** تصفير عدّاد غير المقروء للتذكرة. */
export async function markTicketRead(ticketId: string): Promise<void> {
  await supabase.rpc('mark_ticket_read', { p_ticket_id: ticketId });
}

/** تغيير حالة التذكرة (أدمن). */
export async function updateTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
  const { error } = await supabase.from('support_tickets').update({ status }).eq('id', ticketId);
  if (error) throw error;
}

/** اشتراك لحظي برسائل تذكرة معيّنة. */
export function subscribeTicketMessages(
  ticketId: string,
  onMessage: (m: TicketMessage) => void
) {
  const channel = supabase
    .channel(`ticket-messages:${ticketId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'support_ticket_messages',
        filter: `ticket_id=eq.${ticketId}`,
      },
      payload => onMessage(payload.new as TicketMessage)
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
