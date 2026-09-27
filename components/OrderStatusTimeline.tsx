import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Clock3 } from 'lucide-react-native';
import { ArabicText as Text } from '@/components/ArabicText';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius } from '@/lib/theme';

type StatusHistoryRow = {
  id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string;
};

const labels: Record<string, string> = {
  new: 'جديد', under_review: 'قيد المراجعة', approved: 'تمت الموافقة', preparing: 'قيد التجهيز',
  ready_for_delivery: 'جاهز للتوصيل', waiting_for_driver: 'بانتظار السائق', out_for_delivery: 'قيد التوصيل',
  arrived: 'وصل السائق', delivered: 'تم التسليم', final_review: 'المراجعة النهائية', completed: 'مكتمل',
  cancelled: 'ملغي', delivery_failed: 'تعذر التسليم', archived: 'مؤرشف', pending: 'قيد الانتظار',
  confirmed: 'مؤكد', processing: 'قيد المعالجة', shipped: 'تم الشحن', returned: 'مرتجع', refunded: 'مسترد', rejected: 'مرفوض',
};

export function OrderStatusTimeline({ orderId, companyId }: { orderId: string; companyId?: string | null }) {
  const [rows, setRows] = useState<StatusHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const query = companyId
      ? supabase.from('company_order_status_history').select('id,from_status,to_status,note,created_at').eq('company_id', companyId)
      : supabase.from('order_status_history').select('id,from_status,to_status,note,created_at');
    query.eq('order_id', orderId).order('created_at', { ascending: true })
      .then(({ data, error: queryError }) => {
        if (!alive) return;
        setRows((data ?? []) as StatusHistoryRow[]);
        setError(queryError ? 'تعذّر تحميل سجل الحالات.' : null);
        setLoading(false);
      });
    return () => { alive = false; };
  }, [orderId, companyId]);

  if (loading) return <View style={styles.loading}><ActivityIndicator color={colors.primary[600]} /></View>;
  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!rows.length) return <Text style={styles.empty}>لا يوجد سجل حالات بعد.</Text>;
  return (
    <View style={styles.list}>
      {rows.map((row, index) => (
        <View key={row.id} style={styles.row}>
          <View style={styles.markerColumn}>
            <View style={[styles.marker, index === rows.length - 1 && styles.markerLatest]} />
            {index < rows.length - 1 ? <View style={styles.line} /> : null}
          </View>
          <View style={styles.content}>
            <Text style={styles.title}>{labels[row.to_status] ?? row.to_status}</Text>
            {row.from_status ? <Text style={styles.transition}>{labels[row.from_status] ?? row.from_status} ← {labels[row.to_status] ?? row.to_status}</Text> : null}
            {row.note ? <Text style={styles.note}>{row.note}</Text> : null}
            <View style={styles.date}><Clock3 size={13} color={colors.textSecondary} /><Text style={styles.dateText}>{new Date(row.created_at).toLocaleString()}</Text></View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { padding: spacing.lg, alignItems: 'center' },
  empty: { color: colors.textSecondary, padding: spacing.md },
  error: { color: colors.error[600], padding: spacing.md },
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  row: { flexDirection: 'row', minHeight: 76, gap: spacing.md },
  markerColumn: { alignItems: 'center', width: 18 },
  marker: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.neutral[300], marginTop: 4 },
  markerLatest: { backgroundColor: colors.primary[600] },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 4 },
  content: { flex: 1, paddingBottom: spacing.md },
  title: { color: colors.text, fontWeight: '700' },
  transition: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  note: { color: colors.text, marginTop: 4 },
  date: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  dateText: { color: colors.textSecondary, fontSize: 11 },
});
