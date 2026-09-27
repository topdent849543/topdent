import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { ArabicText as Text } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius } from '@/lib/theme';

type AuditRow = {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  reason: string | null;
  company_id: string | null;
  created_at: string;
};

export function AuditLogList({ companyId, limit = 50 }: { companyId?: string | null; limit?: number }) {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!hasPermission('audit_logs.view', companyId)) {
      setRows([]);
      setLoading(false);
      setError('ليس لديك صلاحية عرض سجل النشاط.');
      return () => { alive = false; };
    }
    let query = supabase.from('audit_logs').select('id,action,resource_type,resource_id,reason,company_id,created_at')
      .order('created_at', { ascending: false }).limit(limit);
    if (companyId) query = query.eq('company_id', companyId);
    query.then(({ data, error: queryError }) => {
      if (!alive) return;
      setRows((data ?? []) as AuditRow[]);
      setError(queryError ? 'تعذّر تحميل سجل النشاط.' : null);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [companyId, hasPermission, limit]);

  if (loading) return <ActivityIndicator color={colors.primary[600]} />;
  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!rows.length) return <Text style={styles.empty}>لا توجد عمليات مسجلة.</Text>;
  return <View style={styles.list}>{rows.map((row) => (
    <View key={row.id} style={styles.card}>
      <Text style={styles.action}>{row.action}</Text>
      <Text style={styles.resource}>{row.resource_type}{row.resource_id ? ` · ${row.resource_id}` : ''}</Text>
      {row.reason ? <Text style={styles.reason}>السبب: {row.reason}</Text> : null}
      <Text style={styles.date}>{new Date(row.created_at).toLocaleString()}</Text>
    </View>
  ))}</View>;
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  action: { color: colors.text, fontWeight: '700' },
  resource: { color: colors.textSecondary, marginTop: 3 },
  reason: { color: colors.text, marginTop: 5 },
  date: { color: colors.textSecondary, fontSize: 11, marginTop: 5 },
  error: { color: colors.error[600], padding: spacing.md },
  empty: { color: colors.textSecondary, padding: spacing.md },
});
