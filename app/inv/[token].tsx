import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, SafeAreaView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { colors, spacing } from '@/lib/theme';
import { ArabicText as Text } from '@/components/ArabicText';
import { EmptyState } from '@/components/EmptyState';
import { InvoiceView } from '@/components/InvoiceView';
import { fetchInvoiceByToken, isValidInvoiceToken, type Invoice } from '@/lib/invoice';

/**
 * Public invoice page — this is the exact destination encoded in the QR code:
 *   <site>/inv/<32-char-token>
 *
 * Anyone holding the printed invoice can open it, but nothing else is
 * reachable: the token is unguessable and the server returns a masked,
 * whitelisted projection for non-privileged viewers.
 */
export default function PublicInvoiceScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (!isValidInvoiceToken(token)) {
        setInvoice(null);
        return;
      }
      setInvoice(await fetchInvoiceByToken(token));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.replace('/')}>
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
          title="الفاتورة غير موجودة"
          message="رمز الفاتورة غير صالح أو تم حذف الفاتورة."
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
