/**
 * محادثة تذكرة الدعم — تُستخدم في صفحة الزبون وفي لوحة الأدمن.
 * تعرض كل الرسائل لحظياً وتسمح بالرد.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Send } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text, ArabicTextInput as TextInput } from '@/components/ArabicText';
import { playFeedback } from '@/lib/sounds';
import {
  fetchTicketMessages,
  markTicketRead,
  sendTicketMessage,
  subscribeTicketMessages,
  type SupportTicket,
  type TicketMessage,
} from '@/lib/support';

type Props = {
  ticket: SupportTicket;
  currentUserId: string;
  role: 'customer' | 'admin';
  onSent?: () => void;
};

function fmtTime(value: string) {
  try {
    return new Date(value).toLocaleString('ar-EG', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function TicketThread({ ticket, currentUserId, role, onSent }: Props) {
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const list = await fetchTicketMessages(ticket.id);
      setMessages(list);
      await markTicketRead(ticket.id);
    } catch {
      /* تجاهل */
    } finally {
      setLoading(false);
    }
  }, [ticket.id]);

  useEffect(() => {
    setLoading(true);
    load();
    const unsubscribe = subscribeTicketMessages(ticket.id, m => {
      setMessages(prev => (prev.some(p => p.id === m.id) ? prev : [...prev, m]));
      if (m.sender_id !== currentUserId) {
        playFeedback('message');
        markTicketRead(ticket.id);
      }
    });
    return unsubscribe;
  }, [ticket.id, currentUserId, load]);

  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const msg = await sendTicketMessage(ticket.id, currentUserId, role, text);
      setMessages(prev => (prev.some(p => p.id === msg.id) ? prev : [...prev, msg]));
      setBody('');
      playFeedback('success');
      onSent?.();
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذّر إرسال الرسالة');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        style={styles.list}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        <View style={[styles.bubble, styles.customerBubble]}>
          <Text style={styles.bubbleSubject}>{ticket.subject}</Text>
          <Text style={styles.bubbleText}>{ticket.message}</Text>
          <Text style={styles.bubbleTime}>{fmtTime(ticket.created_at)}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary[600]} style={{ marginVertical: spacing.md }} />
        ) : (
          messages.map(m => {
            const mine = m.sender_role === role;
            return (
              <View
                key={m.id}
                style={[
                  styles.bubble,
                  mine ? styles.mineBubble : styles.otherBubble,
                  { alignSelf: mine ? 'flex-end' : 'flex-start' },
                ]}
              >
                <Text style={[styles.bubbleRole, mine && { color: colors.primary[700] }]}>
                  {m.sender_role === 'admin' ? 'فريق الدعم' : m.sender_role === 'customer' ? 'الزبون' : 'النظام'}
                </Text>
                <Text style={styles.bubbleText}>{m.body}</Text>
                <Text style={styles.bubbleTime}>{fmtTime(m.created_at)}</Text>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={body}
          onChangeText={setBody}
          placeholder={role === 'admin' ? 'اكتب ردّك للزبون…' : 'اكتب رسالتك للدعم…'}
          placeholderTextColor={colors.textMuted}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!body.trim() || sending) && { opacity: 0.5 }]}
          onPress={send}
          disabled={!body.trim() || sending}
        >
          {sending ? <ActivityIndicator size="small" color="#fff" /> : <Send size={18} color="#fff" />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background },
  list: { flex: 1 },
  bubble: {
    maxWidth: '88%',
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  customerBubble: { backgroundColor: colors.surface, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border },
  mineBubble: { backgroundColor: colors.primary[50] },
  otherBubble: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  bubbleSubject: { ...typography.body, fontWeight: '700', color: colors.text, marginBottom: 4 },
  bubbleRole: { ...typography.caption, color: colors.textMuted, fontWeight: '700', marginBottom: 2 },
  bubbleText: { ...typography.body, color: colors.text },
  bubbleTime: { ...typography.caption, color: colors.textMuted, marginTop: 4 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
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
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
