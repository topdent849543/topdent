import { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, Bell, CheckCheck, Trash2 } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { LoadingState } from '@/components/LoadingState';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import type { AppNotification } from '@/lib/supabase';
import { ArabicText as Text } from '@/components/ArabicText';

export default function NotificationsScreen() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setNotifications((data as AppNotification[]) ?? []);
  }, [user]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllAsRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    setNotifications(notifications.map(n => ({ ...n, is_read: true })));
  };

  const deleteNotification = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications(notifications.filter(n => n.id !== id));
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <Header />
        <EmptyState
          icon={<Bell size={64} color={colors.neutral[300]} />}
          title="Sign in required"
          message="Please sign in to view notifications"
          action={<Button title="Sign In" onPress={() => router.push('/auth/login')} />}
        />
      </SafeAreaView>
    );
  }

  if (loading) return <LoadingState />;

  return (
    <SafeAreaView style={styles.container}>
      <Header onMarkAll={markAllAsRead} hasUnread={notifications.some(n => !n.is_read)} />
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <EmptyState
            icon={<Bell size={64} color={colors.neutral[300]} />}
            title="No notifications"
            message="You'll see updates about your orders and offers here"
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.notifCard, !item.is_read && styles.notifCardUnread]}
            onPress={() => markAsRead(item.id)}
            activeOpacity={0.8}
          >
            <View style={styles.notifIcon}>
              <Bell size={20} color={colors.primary[600]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.notifTitle}>{item.title}</Text>
              {item.body ? <Text style={styles.notifBody}>{item.body}</Text> : null}
              <Text style={styles.notifTime}>
                {new Date(item.created_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </Text>
            </View>
            {!item.is_read ? <View style={styles.unreadDot} /> : null}
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => deleteNotification(item.id)}
            >
              <Trash2 size={16} color={colors.neutral[400]} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

function Header({ onMarkAll, hasUnread }: { onMarkAll?: () => void; hasUnread?: boolean }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
        <ChevronLeft size={24} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.title}>Notifications</Text>
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={onMarkAll}
        disabled={!hasUnread}
      >
        <CheckCheck size={22} color={hasUnread ? colors.primary[600] : colors.neutral[300]} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '700',
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  notifCardUnread: {
    backgroundColor: colors.primary[50],
  },
  notifIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  notifBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  notifTime: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary[600],
  },
  deleteBtn: {
    padding: spacing.xs,
  },
});
