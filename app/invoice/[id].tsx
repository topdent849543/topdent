import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, SafeAreaView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { colors, spacing } from '@/lib/theme';
import { ArabicText as Text } from '@/components/ArabicText';
import { EmptyState } from '@/components/EmptyState';
import { InvoiceView } from '@/components/InvoiceView';
import {
  fetchInvoiceByToken,
  fetchInvoiceToken,
  isValidInvoiceToken,
  type Invoice,
  type InvoiceKind,
} from '@/lib/invoice';

/**
 * Internal invoice screen (customer / merchant / admin).
 *
 * `id` is the order id (default) or the withdrawal id when `kind=withdrawal`.
 * The screen resolves the secret QR token through a SECURITY DEFINER RPC that
 * only answers for the invoice owner, the order's merchant, or an admin.
 */
export default function InvoiceScreen() {
  const params = useLocalSearchParams<{ id: string; kind?: string }>();
  const id = params.id;
  const kind: InvoiceKind = params.kind === 'withdrawal' ? 'withdrawal' : 'order';

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setDenied(false);
    try {
      if (!id) {
        setInvoice(null);
        return;
      }
      // `id` may already be a QR token when the screen is opened from a scan.
      const token = isValidInvoiceToken(id) ? id : await fetchInvoiceToken(kind, id);
      if (!token) {
        setInvoice(null);
        setDenied(true);
        return;
      }
      setInvoice(await fetchInvoiceByToken(token));
    } finally {
      setLoading(false);
    }
  }, [id, kind]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>الفاتورة</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary[600]} style={{ flex: 1 }} />
      ) : invoice ? (
        <InvoiceView invoice={invoice} />
      ) : (
        <EmptyState
          title={denied ? 'لا تملك صلاحية عرض هذه الفاتورة' : 'الفاتورة غير موجودة'}
          message={
            denied
              ? 'يمكن للزبون والتاجر والإدارة فقط عرض هذه الفاتورة.'
              : 'قد تكون هذه الفاتورة قد حُذفت.'
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: colors.text },
});
