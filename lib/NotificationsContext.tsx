/**
 * نظام الإشعارات المتكامل للتطبيق والموقع.
 *
 * - يستقبل الإشعارات لحظياً عبر Supabase Realtime.
 * - يشغّل صوتاً مناسباً لكل نوع إشعار.
 * - يعرض نافذة منبثقة داخل التطبيق (شبيهة بواتساب) على الهاتف والويب.
 * - يعرض إشعار نظام في المتصفح (Web Notification) عند منح الإذن.
 * - يوفّر عدّاد الإشعارات غير المقروءة لكل الواجهات.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { playFeedback, initSounds } from '@/lib/sounds';
import { NotificationToast, type ToastPayload } from '@/components/NotificationToast';
import type { AppNotification } from '@/lib/supabase';

type NotificationsContextType = {
  notifications: AppNotification[];
  unreadCount: number;
  refresh: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  showToast: (toast: Omit<ToastPayload, 'id'>) => void;
};

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

function soundFor(type?: string | null) {
  switch (type) {
    case 'chat':
      return 'message' as const;
    case 'order':
      return 'order' as const;
    case 'support':
    case 'ticket':
      return 'notify' as const;
    case 'wallet':
    case 'payment':
      return 'wallet' as const;
    default:
      return 'notify' as const;
  }
}

function routeFor(n: AppNotification): (() => void) | undefined {
  const data = (n.data || {}) as Record<string, any>;
  if (n.type === 'chat' && data.chat_id) {
    return () => router.push(`/chat/${data.chat_id}`);
  }
  if ((n.type === 'support' || n.type === 'ticket')) {
    return () => router.push('/support');
  }
  if (n.type === 'order' && data.order_id) {
    return () => router.push(`/orders/${data.order_id}`);
  }
  return () => router.push('/notifications');
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const queue = useRef<ToastPayload[]>([]);

  useEffect(() => {
    initSounds();
    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
      try {
        if (Notification.permission === 'default') Notification.requestPermission();
      } catch {
        /* تجاهل */
      }
    }
  }, []);

  const pushToast = useCallback((payload: ToastPayload) => {
    setToast(prev => {
      if (prev) {
        queue.current.push(payload);
        return prev;
      }
      return payload;
    });
  }, []);

  const showToast = useCallback(
    (payload: Omit<ToastPayload, 'id'>) => {
      pushToast({ ...payload, id: `${Date.now()}-${Math.random()}` });
    },
    [pushToast]
  );

  const dismissToast = useCallback(() => {
    const next = queue.current.shift() ?? null;
    setToast(next);
  }, []);

  const refresh = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      return;
    }
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setNotifications((data as AppNotification[]) ?? []);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // البث اللحظي
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        payload => {
          const n = payload.new as AppNotification;
          setNotifications(prev => (prev.some(p => p.id === n.id) ? prev : [n, ...prev]));
          playFeedback(soundFor(n.type));
          pushToast({
            id: n.id,
            title: n.title,
            body: n.body,
            type: n.type,
            onPress: routeFor(n),
          });
          if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
            try {
              if (Notification.permission === 'granted') {
                new Notification(n.title, { body: n.body ?? undefined, icon: '/favicon.png' });
              }
            } catch {
              /* تجاهل */
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, pushToast]);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)));
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
  }, [user]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, refresh, markAsRead, markAllAsRead, showToast }}
    >
      {children}
      <NotificationToast toast={toast} onDismiss={dismissToast} />
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}
