import { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, RotateCcw, Image as ImageIcon, Send } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import { LoadingState } from '@/components/LoadingState';
import type { Order, OrderItem } from '@/lib/supabase';
import { ArabicText as Text, ArabicTextInput as TextInput } from '@/components/ArabicText';
import { t } from '@/lib/i18n';

const REASONS = [
  { key: 'size_issue', label: 'Size doesn\'t fit' },
  { key: 'different_product', label: 'Different from description' },
  { key: 'manufacturing_defect', label: 'Manufacturing defect' },
  { key: 'changed_mind', label: 'Changed my mind' },
  { key: 'other', label: 'Other' },
];

export default function ReturnsScreen() {
  const { order_id } = useLocalSearchParams<{ order_id: string }>();
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'refund' | 'exchange'>('refund');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!order_id) return;
    const { data: o } = await supabase
      .from('orders')
      .select(`*, order_items:order_items(*)`)
      .eq('id', order_id)
      .maybeSingle();
    setOrder(o as Order | null);
    setItems((o as Order)?.order_items ?? []);
  }, [order_id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const submit = async () => {
    if (!user || !order) return;
    if (!selectedItem) {
      Alert.alert(t('Select item'), t('Please select an item to return'));
      return;
    }
    if (!reason) {
      Alert.alert(t('Select reason'), t('Please select a reason for return'));
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('return_requests').insert({
      user_id: user.id,
      order_id: order.id,
      order_item_id: selectedItem,
      reason,
      description: description.trim() || null,
      type,
    });
    setSubmitting(false);
    if (error) {
      Alert.alert(t('Error'), error.message);
      return;
    }
    Alert.alert(t('Success'), t('Your return request has been submitted. We will review it shortly.'), [
      { text: t('OK'), onPress: () => router.back() },
    ]);
  };

  if (loading) return <LoadingState />;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Return / Exchange</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Item</Text>
          {items.map(item => (
            <TouchableOpacity
              key={item.id}
              style={[styles.itemCard, selectedItem === item.id && styles.itemCardActive]}
              onPress={() => setSelectedItem(item.id)}
            >
              <View style={styles.itemRadio}>
                {selectedItem === item.id ? <View style={styles.itemRadioDot} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.product_name}</Text>
                <Text style={styles.itemVariant}>
                  {item.size ? `Size: ${item.size}` : ''} {item.color ? `Color: ${item.color}` : ''} Qty: {item.quantity}
                </Text>
                <Text style={styles.itemPrice}>${item.subtotal.toFixed(2)}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Return Type</Text>
          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[styles.typeBtn, type === 'refund' && styles.typeBtnActive]}
              onPress={() => setType('refund')}
            >
              <Text style={[styles.typeBtnText, type === 'refund' && styles.typeBtnTextActive]}>
                Refund
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBtn, type === 'exchange' && styles.typeBtnActive]}
              onPress={() => setType('exchange')}
            >
              <Text style={[styles.typeBtnText, type === 'exchange' && styles.typeBtnTextActive]}>
                Exchange
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reason</Text>
          <View style={styles.reasonsContainer}>
            {REASONS.map(r => (
              <TouchableOpacity
                key={r.key}
                style={[styles.reasonItem, reason === r.key && styles.reasonItemActive]}
                onPress={() => setReason(r.key)}
              >
                <View style={styles.reasonRadio}>
                  {reason === r.key ? <View style={styles.reasonRadioDot} /> : null}
                </View>
                <Text style={styles.reasonLabel}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description (Optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Tell us more about the issue..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upload Photos (Optional)</Text>
          <TouchableOpacity style={styles.uploadBtn}>
            <ImageIcon size={24} color={colors.neutral[400]} />
            <Text style={styles.uploadText}>Tap to upload photos</Text>
          </TouchableOpacity>
        </View>
        <View style={{ padding: spacing.md }}>
          <Button
            title={submitting ? 'Submitting...' : 'Submit Request'}
            onPress={submit}
            loading={submitting}
            fullWidth
            size="lg"
          />
        </View>
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
  section: {
    padding: spacing.md,
    paddingBottom: 0,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.text,
    marginBottom: spacing.md,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...shadows.sm,
  },
  itemCardActive: {
    borderColor: colors.primary[600],
    backgroundColor: colors.primary[50],
  },
  itemRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.neutral[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary[600],
  },
  itemName: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  itemVariant: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  itemPrice: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  typeBtnActive: {
    borderColor: colors.primary[600],
    backgroundColor: colors.primary[600],
  },
  typeBtnText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  typeBtnTextActive: {
    color: colors.white,
  },
  reasonsContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  reasonItemActive: {
    backgroundColor: colors.primary[50],
  },
  reasonRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.neutral[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary[600],
  },
  reasonLabel: {
    ...typography.bodySmall,
    color: colors.text,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  textArea: {
    minHeight: 100,
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  uploadText: {
    ...typography.bodySmall,
    color: colors.textMuted,
  },
});
