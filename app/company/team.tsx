import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { CompanyPicker } from '@/components/CompanyPicker';
import { ArabicText as Text } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius } from '@/lib/theme';

type Member = { id: string; user_id: string; role_id: string; status: string; role?: string; name?: string; active?: boolean };
export default function CompanyTeamScreen() {
  const { activeCompany, hasPermission } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [roleKey, setRoleKey] = useState<'company_admin'|'company_driver'>('company_admin');
  const load = useCallback(async () => {
    if (!activeCompany?.id) { setMembers([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from('user_memberships').select('id,user_id,role_id,status').eq('company_id', activeCompany.id).order('created_at');
    if (error) { setLoading(false); Alert.alert('Error', error.message); return; }
    const rows = (data ?? []) as Member[];
    const roleIds = [...new Set(rows.map((r) => r.role_id))];
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const [roles, profiles] = await Promise.all([
      roleIds.length ? supabase.from('roles').select('id,name,key').in('id', roleIds) : Promise.resolve({ data: [] }),
      userIds.length ? supabase.from('profiles').select('id,full_name,is_active').in('id', userIds) : Promise.resolve({ data: [] }),
    ]);
    const roleMap = new Map((roles.data ?? []).map((r: any) => [r.id, `${r.name} (${r.key})`]));
    const profileMap = new Map((profiles.data ?? []).map((p: any) => [p.id, p]));
    setMembers(rows.map((r) => { const p: any = profileMap.get(r.user_id); return { ...r, role: roleMap.get(r.role_id) ?? 'Role', name: p?.full_name ?? r.user_id, active: p?.is_active !== false }; }));
    setLoading(false);
  }, [activeCompany?.id]);
  useEffect(() => { load(); }, [load]);
  const createMember = async () => {
    if (!activeCompany?.id || !name.trim() || !email.trim() || password.length < 8) { Alert.alert('Required', 'Enter a name, valid email, and password of at least 8 characters.'); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('user-admin', { body: { action: 'create-user', company_id: activeCompany.id, full_name: name.trim(), email: email.trim(), password, role_key: roleKey } });
    setBusy(false);
    if (error || data?.error) { Alert.alert('Unable to create user', data?.error ?? error?.message); return; }
    setName(''); setEmail(''); setPassword(''); Alert.alert('Success', 'Company account created.'); await load();
  };
  const disableMember = (member: Member) => Alert.alert('Remove company membership?', `Remove ${member.name} from this company? Their account and other memberships will remain active.`, [
    { text: 'Cancel', style: 'cancel' }, { text: 'Remove member', style: 'destructive', onPress: async () => {
      const { data, error } = await supabase.functions.invoke('user-admin', { body: { action: 'disable-user', company_id: activeCompany?.id, user_id: member.user_id, reason: 'Disabled by company administrator' } });
      if (error || data?.error) Alert.alert('Unable to disable', data?.error ?? error?.message); else load();
    } },
  ]);
  const mayCreate = !!activeCompany?.id && hasPermission('users.create', activeCompany.id);
  const mayDisable = !!activeCompany?.id && hasPermission('users.disable', activeCompany.id);
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>فريق الشركة</Text><CompanyPicker />
    {loading ? <ActivityIndicator color={colors.primary[600]} /> : members.map((m) => <View key={m.id} style={styles.card}>
      <Text style={styles.member}>{m.name}</Text><Text style={styles.meta}>{m.role} · {m.status}{m.active ? '' : ' · Disabled'}</Text>
      {mayDisable && m.active ? <TouchableOpacity onPress={() => disableMember(m)}><Text style={styles.danger}>إزالة العضو من الشركة</Text></TouchableOpacity> : null}
    </View>)}
    {!members.length && !loading ? <Text style={styles.meta}>لا يوجد أعضاء مرتبطون بهذه الشركة بعد.</Text> : null}
    {mayCreate ? <View style={styles.form}><Text style={styles.heading}>إضافة عضو</Text>
      <View style={styles.roleRow}>{(['company_admin','company_driver'] as const).map((r) => <TouchableOpacity key={r} style={[styles.role, roleKey===r&&styles.roleActive]} onPress={() => setRoleKey(r)}><Text style={styles.roleText}>{r==='company_admin'?'مسؤول شركة':'سائق شركة'}</Text></TouchableOpacity>)}</View>
      <TextInput value={name} onChangeText={setName} placeholder="الاسم الكامل" style={styles.input} />
      <TextInput value={email} onChangeText={setEmail} placeholder="البريد الإلكتروني" autoCapitalize="none" keyboardType="email-address" style={styles.input} />
      <TextInput value={password} onChangeText={setPassword} placeholder="كلمة المرور المؤقتة (8 أحرف على الأقل)" secureTextEntry style={styles.input} />
      <TouchableOpacity disabled={busy} style={styles.primary} onPress={createMember}><Text style={styles.primaryText}>{busy?'جارٍ الإنشاء…':'إنشاء الحساب وإسناد الدور'}</Text></TouchableOpacity>
    </View> : null}
  </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:colors.background},content:{padding:spacing.lg,gap:spacing.md},title:{fontSize:24,fontWeight:'800',color:colors.text},heading:{fontSize:18,fontWeight:'700',color:colors.text},card:{backgroundColor:colors.surface,padding:spacing.md,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,gap:6},member:{fontWeight:'700',color:colors.text},meta:{color:colors.textSecondary},danger:{color:colors.error[600],fontWeight:'700',marginTop:6},form:{backgroundColor:colors.surface,padding:spacing.md,borderRadius:radius.md,gap:spacing.sm,borderWidth:1,borderColor:colors.border},roleRow:{flexDirection:'row',gap:spacing.sm},role:{padding:spacing.sm,borderWidth:1,borderColor:colors.border,borderRadius:radius.sm},roleActive:{borderColor:colors.primary[600],backgroundColor:colors.primary[50]},roleText:{color:colors.text,fontWeight:'600'},input:{borderWidth:1,borderColor:colors.border,borderRadius:radius.sm,padding:spacing.sm,color:colors.text},primary:{backgroundColor:colors.primary[700],padding:spacing.md,borderRadius:radius.sm,alignItems:'center'},primaryText:{color:colors.white,fontWeight:'700'}});
