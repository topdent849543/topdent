import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { X } from 'lucide-react-native';
import { ArabicText as Text } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing } from '@/lib/theme';

type DriverRow = { id: string; user_id: string; driver_type: 'global' | 'company'; company_id: string | null; vehicle_type: string | null; status: string };

export function DriverAssignmentModal({
  visible, orderId, companyId, onClose, onAssigned,
}: {
  visible: boolean;
  orderId: string;
  companyId: string;
  onClose: () => void;
  onAssigned?: () => void;
}) {
  const { hasPermission } = useAuth();
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setLoading(true);
    setError(null);
    supabase.functions.invoke('order-admin', { body: { action: 'eligible-drivers', company_id: companyId } }).then(({ data, error: queryError }) => {
      if (!alive) return;
      setDrivers((data?.drivers ?? []) as DriverRow[]);
      setError(queryError ? 'تعذّر تحميل السائقين.' : null);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [visible, companyId]);

  const assign = async (driverId: string) => {
    if (!hasPermission('drivers.assign_orders', companyId)) {
      setError('ليس لديك صلاحية تعيين سائق لهذه الشركة.');
      return;
    }
    setSaving(driverId);
    setError(null);
    try {
      const { data: result, error } = await supabase.functions.invoke('order-admin', {
        body: { action: 'assign-driver', order_id: orderId, company_id: companyId, driver_id: driverId },
      });
      if (error || result?.error) throw new Error(result?.error || error?.message || 'تعذّر تعيين السائق.');
      onAssigned?.();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر تعيين السائق.');
    } finally {
      setSaving(null);
    }
  };

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.overlay}><View style={styles.sheet}>
      <View style={styles.header}><Text style={styles.title}>تعيين سائق</Text><TouchableOpacity onPress={onClose}><X size={22} color={colors.text} /></TouchableOpacity></View>
      {!hasPermission('drivers.assign_orders', companyId) ? <Text style={styles.error}>ليس لديك صلاحية لهذه العملية.</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={colors.primary[600]} /> : <FlatList
        data={drivers}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>لا يوجد سائقون متاحون لهذه الشركة.</Text>}
        renderItem={({ item }) => <TouchableOpacity style={styles.driver} disabled={!!saving} onPress={() => assign(item.id)}>
          <View style={styles.driverText}><Text style={styles.driverName}>{item.driver_type === 'global' ? 'سائق عام' : 'سائق الشركة'}</Text><Text style={styles.vehicle}>{item.vehicle_type ?? 'دون مركبة مسجلة'}</Text></View>
          {saving === item.id ? <ActivityIndicator color={colors.primary[600]} /> : <Text style={styles.assign}>تعيين</Text>}
        </TouchableOpacity>}
      />}
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: '82%', gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  driver: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm },
  driverText: { gap: 3 },
  driverName: { color: colors.text, fontWeight: '700' },
  vehicle: { color: colors.textSecondary },
  assign: { color: colors.primary[700], fontWeight: '700' },
  error: { color: colors.error[600] },
  empty: { color: colors.textSecondary, textAlign: 'center', padding: spacing.lg },
});
