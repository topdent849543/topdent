import { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, Tag, Copy, Check, Ticket } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { LoadingState } from '@/components/LoadingState';
import { EmptyState } from '@/components/EmptyState';
import type { Coupon } from '@/lib/supabase';
import { ArabicText as Text } from '@/components/ArabicText';
import { t } from '@/lib/i18n';

export default function CouponsScreen() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('coupons')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    setCoupons((data as Coupon[]) ?? []);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const copyCode = (code: string) => {
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (loading) return <LoadingState />;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Coupons & Offers</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {coupons.length === 0 ? (
          <EmptyState
            icon={<Ticket size={64} color={colors.neutral[300]} />}
            title="No coupons available"
            message="Check back later for new offers and discounts"
          />
        ) : (
          coupons.map(coupon => {
            const isExpired = coupon.valid_until ? new Date(coupon.valid_until) < new Date() : false;
            return (
              <View key={coupon.id} style={styles.couponCard}>
                <View style={styles.couponLeft}>
                  <View style={styles.couponIcon}>
                    <Tag size={28} color={colors.white} />
                  </View>
                  <View>
                    <Text style={styles.couponCode}>{coupon.code}</Text>
                    <Text style={styles.couponDiscount}>
                      {coupon.discount_type === 'percentage'
                        ? `${coupon.discount_value}% OFF`
                        : `$${coupon.discount_value} OFF`}
                    </Text>
                  </View>
                </View>
                <View style={styles.couponRight}>
                  <Text style={styles.couponDesc}>{coupon.description}</Text>
                  {coupon.min_spend > 0 ? (
                    <Text style={styles.couponMin}>Min spend ${coupon.min_spend}</Text>
                  ) : null}
                  {coupon.valid_until ? (
                    <Text style={styles.couponExpiry}>
                      Expires: {new Date(coupon.valid_until).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </Text>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.copyBtn, isExpired && styles.copyBtnDisabled]}
                    onPress={() => copyCode(coupon.code)}
                    disabled={isExpired}
                  >
                    {copiedCode === coupon.code ? (
                      <Check size={16} color={colors.success[600]} />
                    ) : (
                      <Copy size={16} color={colors.primary[600]} />
                    )}
                    <Text style={styles.copyBtnText}>
                      {copiedCode === coupon.code ? 'Copied!' : isExpired ? 'Expired' : 'Copy Code'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
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
  couponCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.md,
  },
  couponLeft: {
    backgroundColor: colors.primary[600],
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minWidth: 120,
  },
  couponIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  couponCode: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.white,
  },
  couponDiscount: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.9)',
  },
  couponRight: {
    flex: 1,
    padding: spacing.md,
    gap: 4,
  },
  couponDesc: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  couponMin: {
    ...typography.caption,
    color: colors.textMuted,
  },
  couponExpiry: {
    ...typography.caption,
    color: colors.textMuted,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.primary[50],
  },
  copyBtnDisabled: {
    opacity: 0.5,
  },
  copyBtnText: {
    ...typography.caption,
    color: colors.primary[600],
    fontWeight: '600',
  },
});
