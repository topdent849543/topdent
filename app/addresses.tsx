import { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, Plus, MapPin, Edit2, Trash2, X, Check } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { LoadingState } from '@/components/LoadingState';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import type { Address } from '@/lib/supabase';
import { ArabicText as Text, ArabicTextInput as TextInput } from '@/components/ArabicText';
import { t } from '@/lib/i18n';

export default function AddressesScreen() {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    country: '',
    city: '',
    street: '',
    postal_code: '',
    is_default: false,
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false });
    setAddresses((data as Address[]) ?? []);
  }, [user]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openAddForm = () => {
    setEditing(null);
    setForm({ full_name: '', phone: '', country: '', city: '', street: '', postal_code: '', is_default: false });
    setShowForm(true);
  };

  const openEditForm = (addr: Address) => {
    setEditing(addr);
    setForm({
      full_name: addr.full_name,
      phone: addr.phone,
      country: addr.country,
      city: addr.city,
      street: addr.street,
      postal_code: addr.postal_code ?? '',
      is_default: addr.is_default,
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!user) return;
    if (!form.full_name.trim() || !form.phone.trim() || !form.country.trim() || !form.city.trim() || !form.street.trim()) {
      Alert.alert(t('Missing info'), t('Please fill in all required fields'));
      return;
    }
    setSaving(true);
    if (form.is_default) {
      await supabase
        .from('addresses')
        .update({ is_default: false })
        .eq('user_id', user.id);
    }
    if (editing) {
      await supabase
        .from('addresses')
        .update({
          full_name: form.full_name.trim(),
          phone: form.phone.trim(),
          country: form.country.trim(),
          city: form.city.trim(),
          street: form.street.trim(),
          postal_code: form.postal_code.trim() || null,
          is_default: form.is_default,
        })
        .eq('id', editing.id);
    } else {
      await supabase.from('addresses').insert({
        user_id: user.id,
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        country: form.country.trim(),
        city: form.city.trim(),
        street: form.street.trim(),
        postal_code: form.postal_code.trim() || null,
        is_default: form.is_default,
      });
    }
    setSaving(false);
    setShowForm(false);
    await load();
  };

  const remove = (addr: Address) => {
    Alert.alert(
      t('Delete Address'),
      t('Are you sure you want to delete this address?'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: async () => {
            await supabase.from(t('addresses')).delete().eq(t('id'), addr.id);
            await load();
          },
        },
      ]
    );
  };

  if (loading) return <LoadingState />;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>My Addresses</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={openAddForm}>
          <Plus size={24} color={colors.primary[600]} />
        </TouchableOpacity>
      </View>
      <FlatList
        data={addresses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <EmptyState
            icon={<MapPin size={64} color={colors.neutral[300]} />}
            title="No addresses"
            message="Add an address for faster checkout"
            action={<Button title="Add Address" onPress={openAddForm} />}
          />
        }
        renderItem={({ item }) => (
          <View style={styles.addressCard}>
            <View style={styles.addressHeader}>
              <View style={styles.addressIcon}>
                <MapPin size={20} color={colors.primary[600]} />
              </View>
              {item.is_default ? (
                <View style={styles.defaultBadge}>
                  <Text style={styles.defaultText}>Default</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.addressName}>{item.full_name}</Text>
            <Text style={styles.addressText}>{item.street}</Text>
            <Text style={styles.addressText}>
              {item.city}, {item.country}
              {item.postal_code ? ` ${item.postal_code}` : ''}
            </Text>
            <Text style={styles.addressText}>{item.phone}</Text>
            <View style={styles.addressActions}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => openEditForm(item)}
              >
                <Edit2 size={16} color={colors.primary[600]} />
                <Text style={styles.actionText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => remove(item)}
              >
                <Trash2 size={16} color={colors.error[500]} />
                <Text style={[styles.actionText, { color: colors.error[500] }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
      {showForm ? (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editing ? 'Edit Address' : 'Add Address'}</Text>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              <Text style={styles.label}>Full Name *</Text>
              <TextInput style={styles.input} value={form.full_name} onChangeText={v => setForm({ ...form, full_name: v })} />
              <Text style={styles.label}>Phone *</Text>
              <TextInput style={styles.input} value={form.phone} onChangeText={v => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
              <Text style={styles.label}>Country *</Text>
              <TextInput style={styles.input} value={form.country} onChangeText={v => setForm({ ...form, country: v })} />
              <Text style={styles.label}>City *</Text>
              <TextInput style={styles.input} value={form.city} onChangeText={v => setForm({ ...form, city: v })} />
              <Text style={styles.label}>Street Address *</Text>
              <TextInput style={styles.input} value={form.street} onChangeText={v => setForm({ ...form, street: v })} />
              <Text style={styles.label}>Postal Code</Text>
              <TextInput style={styles.input} value={form.postal_code} onChangeText={v => setForm({ ...form, postal_code: v })} />
              <TouchableOpacity
                style={styles.defaultRow}
                onPress={() => setForm({ ...form, is_default: !form.is_default })}
              >
                <View style={[styles.checkbox, form.is_default && styles.checkboxActive]}>
                  {form.is_default ? <Check size={16} color={colors.white} /> : null}
                </View>
                <Text style={styles.defaultLabel}>Set as default address</Text>
              </TouchableOpacity>
              <Button title={saving ? 'Saving...' : 'Save Address'} onPress={save} loading={saving} fullWidth />
            </ScrollView>
          </View>
        </View>
      ) : null}
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
  addressCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  addressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  addressIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultBadge: {
    backgroundColor: colors.success[50],
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  defaultText: {
    ...typography.caption,
    color: colors.success[700],
    fontWeight: '600',
  },
  addressName: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  addressText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  addressActions: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    ...typography.h4,
    color: colors.text,
  },
  label: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.background,
  },
  defaultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  defaultLabel: {
    ...typography.bodySmall,
    color: colors.text,
  },
});
