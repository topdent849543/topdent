import { useCallback, useEffect, useState } from 'react';
import { Alert, ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { CompanyPicker } from '@/components/CompanyPicker';
import { ArabicText as Text } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius } from '@/lib/theme';
export default function CompanySettingsScreen(){
 const {activeCompany,hasPermission,refreshAuthorization}=useAuth();const [data,setData]=useState<any>(null);const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{if(!activeCompany?.id)return;const {data,error}=await supabase.from('companies').select('id,name,description,phone,whatsapp,email,address,status').eq('id',activeCompany.id).maybeSingle();if(error)Alert.alert('Error',error.message);else setData(data);},[activeCompany?.id]);useEffect(()=>{load();},[load]);
 const update=(key:string,value:string)=>setData((v:any)=>({...v,[key]:value}));
 const save=async()=>{if(!activeCompany?.id||!data)return;setBusy(true);const {data:result,error}=await supabase.functions.invoke('company-admin',{body:{action:'update-company',company_id:activeCompany.id,name:data.name,description:data.description,phone:data.phone,whatsapp:data.whatsapp,email:data.email,address:data.address}});setBusy(false);if(error||result?.error)Alert.alert('Unable to save',result?.error??error?.message);else{Alert.alert('Saved','Company details updated.');await refreshAuthorization();}};
 const editable=!!activeCompany?.id&&hasPermission('companies.edit',activeCompany.id);
 return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.content}><Text style={s.title}>إعدادات الشركة</Text><CompanyPicker/>{!data?<ActivityIndicator color={colors.primary[600]}/>:<><Text style={s.status}>الحالة: {data.status}</Text>{(['name','description','phone','whatsapp','email','address'] as const).map(k=><TextInput key={k} value={data[k]??''} onChangeText={v=>update(k,v)} editable={editable} placeholder={k} style={s.input}/ >)}{editable?<TouchableOpacity style={s.button} disabled={busy} onPress={save}><Text style={s.buttonText}>{busy?'جارٍ الحفظ…':'حفظ التغييرات'}</Text></TouchableOpacity>:<Text style={s.status}>لا تملك صلاحية تعديل إعدادات هذه الشركة.</Text>}</>}</ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:colors.background},content:{padding:spacing.lg,gap:spacing.md},title:{fontSize:24,fontWeight:'800',color:colors.text},status:{color:colors.textSecondary},input:{borderWidth:1,borderColor:colors.border,borderRadius:radius.sm,padding:spacing.md,color:colors.text,backgroundColor:colors.surface},button:{backgroundColor:colors.primary[700],borderRadius:radius.sm,padding:spacing.md,alignItems:'center'},buttonText:{color:colors.white,fontWeight:'700'}});
