import { useMemo, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react-native';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ArabicText as Text } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { colors, radius, spacing } from '@/lib/theme';

export function CompanyPicker() {
  const { companies, memberships, activeCompany, setActiveCompany } = useAuth();
  const [open, setOpen] = useState(false);
  const available = useMemo(() => {
    const ids = new Set(memberships.filter((membership) => membership.status === 'active' && membership.company_id)
      .map((membership) => membership.company_id));
    return (companies ?? []).filter((company) => ids.has(company.id));
  }, [companies, memberships]);

  if (!activeCompany || available.length < 2) return null;
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen((value) => !value)} accessibilityRole="button">
        <Text style={styles.triggerText}>{activeCompany.name}</Text>
        <ChevronDown size={18} color={colors.primary[700]} />
      </TouchableOpacity>
      {open ? <View style={styles.menu}>
        {available.map((company) => (
          <TouchableOpacity key={company.id} style={styles.option} onPress={() => { setActiveCompany(company.id); setOpen(false); }}>
            <Text style={styles.optionText}>{company.name}</Text>
            {company.id === activeCompany.id ? <Check size={16} color={colors.success[600]} /> : null}
          </TouchableOpacity>
        ))}
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative', zIndex: 10, marginTop: spacing.sm },
  trigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  triggerText: { color: colors.text, fontWeight: '600' },
  menu: { marginTop: spacing.xs, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden' },
  option: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  optionText: { color: colors.text },
});
