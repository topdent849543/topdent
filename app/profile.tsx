import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, User, Save, Lock, Globe, Bell } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import { ArabicText as Text, ArabicTextInput as TextInput } from '@/components/ArabicText';
import { DeleteAccountButton } from '@/components/DeleteAccountButton';
import { t } from '@/lib/i18n';

export default function ProfileScreen() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
        default_currency: 'SYP',
        default_language: profile?.default_language ?? 'en',
      });
    setSaving(false);
    if (error) {
      Alert.alert(t('Error'), error.message);
      return;
    }
    await refreshProfile();
    Alert.alert(t('Success'), t('Profile updated successfully'));
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Edit Profile</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        <View style={styles.avatarSection}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <User size={40} color={colors.white} />
            </View>
          )}
          <Text style={styles.email}>{user?.email}</Text>
        </View>
        <View style={styles.formCard}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Enter your name"
          />
          <Text style={styles.label}>Email</Text>
          <View style={styles.disabledInput}>
            <Text style={styles.disabledText}>{user?.email}</Text>
          </View>
          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Enter your phone"
            keyboardType="phone-pad"
          />
          <View style={{ height: spacing.md }} />
          <Button title={saving ? 'Saving...' : 'Save Changes'} onPress={save} loading={saving} fullWidth />
        </View>
        <View style={styles.menuCard}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => Alert.alert(t('Change Password'), t('Contact support to change your password.'))}
          >
            <View style={styles.menuIcon}>
              <Lock size={20} color={colors.primary[600]} />
            </View>
            <Text style={styles.menuLabel}>Change Password</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuIcon}>
              <Globe size={20} color={colors.primary[600]} />
            </View>
            <Text style={styles.menuLabel}>Language & Currency</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]}>
            <View style={styles.menuIcon}>
              <Bell size={20} color={colors.primary[600]} />
            </View>
            <Text style={styles.menuLabel}>Notification Settings</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>
        <Button
          title="Sign Out"
          onPress={() => {
            signOut();
            router.replace('/(tabs)');
          }}
          variant="outline"
          fullWidth
        />
        <DeleteAccountButton variant="button" />
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
  avatarSection: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  email: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.sm,
  },
  label: {
    ...typography.bodySmall,
    fontWeight: '600',
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
    backgroundColor: colors.background,
  },
  disabledInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.neutral[100],
  },
  disabledText: {
    ...typography.body,
    color: colors.textMuted,
  },
  menuCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    flex: 1,
    ...typography.body,
    color: colors.text,
  },
  chevron: {
    fontSize: 24,
    color: colors.neutral[400],
  },
});
