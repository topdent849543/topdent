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
import { ChevronLeft, Package, ChevronRight } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { LoadingState } from '@/components/LoadingState';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import type { Order } from '@/lib/supabase';
import { ArabicText as Text } from '@/components/ArabicText';
import { t } from '@/lib/i18n';

const STATUS_COLORS: Record<string, string> = {
  pending: colors.warning[500],
  processing: colors.primary[600],
  shipped: colors.primary[500],
  out_for_delivery: colors.accent[500],
  delivered: colors.success[600],
  cancelled: colors.error[500],
  returned: colors.neutral[500],
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  processing: 'Processing',
  shipped: 'Shipped',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

export default function OrdersScreen() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  const load = useCallback(async () => {
    if (!user) return;
    let query = supabase
      .from('orders')
      .select(`*, order_items:order_items(*)`)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (filter === 'active') {
      query = query.in('status', ['pending', 'processing', 'shipped', 'out_for_delivery']);
    } else if (filter === 'completed') {
      query = query.in('status', ['delivered', 'cancelled', 'returned']);
    }
    const { data } = await query;
    setOrders((data as Order[]) ?? []);
  }, [user, filter]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>My Orders</Text>
          <View style={{ width: 40 }} />
        </View>
        <EmptyState
          icon={<Package size={64} color={colors.neutral[300]} />}
          title="Sign in required"
          message="Please sign in to view your orders"
          action={<Button title="Sign In" onPress={() => router.push('/auth/login')} />}
        />
      </SafeAreaView>
    );
  }

  if (loading) return <LoadingState />;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>My Orders</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.filterRow}>
        {(['all', 'active', 'completed'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text
              style={[styles.filterText, filter === f && styles.filterTextActive]}
            >
              {f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Completed'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <EmptyState
            icon={<Package size={64} color={colors.neutral[300]} />}
            title="No orders yet"
            message="When you place orders, they will appear here"
            action={<Button title="Start Shopping" onPress={() => router.push('/(tabs)/index')} />}
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.orderCard}
            activeOpacity={0.85}
            onPress={() => router.push(`/orders/${item.id}`)}
          >
            <View style={styles.orderHeader}>
              <View>
                <Text style={styles.orderNumber}>{item.order_number}</Text>
                <Text style={styles.orderDate}>
                  {new Date(item.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </View>
              <View
                style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[item.status] ?? colors.neutral[400]) + '20' }]}
              >
                <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] ?? colors.neutral[600] }]}>
                  {STATUS_LABELS[item.status] ?? item.status}
                </Text>
              </View>
            </View>
            <View style={styles.orderItemsRow}>
              <Text style={styles.itemsCount}>
                {item.order_items?.length ?? 0} item{(item.order_items?.length ?? 0) > 1 ? 's' : ''}
              </Text>
              <Text style={styles.orderTotal}>${item.total.toFixed(2)}</Text>
            </View>
            <View style={styles.orderFooter}>
              <Text style={styles.trackText}>View Details</Text>
              <ChevronRight size={18} color={colors.primary[600]} />
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
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
  filterRow: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
  },
  filterBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterBtnActive: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  filterText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  filterTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
  orderCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  orderNumber: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
  },
  orderDate: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '600',
  },
  orderItemsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  itemsCount: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  orderTotal: {
    ...typography.h4,
    fontWeight: '700',
    color: colors.text,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  trackText: {
    ...typography.bodySmall,
    color: colors.primary[600],
    fontWeight: '600',
  },
});
