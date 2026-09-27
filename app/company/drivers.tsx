import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';
import { CompanyPicker } from '@/components/CompanyPicker';
import { ArabicText as Text } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius } from '@/lib/theme';
export default function CompanyDriversScreen(){
 const {activeCompany}=useAuth(); const [rows,setRows]=useState<any[]>([]); const [loading,setLoading]=useState(true);
 const load=useCallback(async()=>{if(!activeCompany?.id){setRows([]);setLoading(false);return;}setLoading(true);const {data,error}=await supabase.from('drivers').select('id,user_id,driver_type,vehicle_type,vehicle_plate,status,created_at').eq('company_id',activeCompany.id).order('created_at',{ascending:false});if(error){setRows([]);}else{const ids=(data??[]).map((r:any)=>r.user_id);const {data:profiles}=ids.length?await supabase.from('profiles').select('id,full_name').in('id',ids):{data:[]};const names=new Map((profiles??[]).map((p:any)=>[p.id,p.full_name]));setRows((data??[]).map((r:any)=>({...r,name:names.get(r.user_id)??r.user_id})));}setLoading(false);},[activeCompany?.id]);
 useEffect(()=>{load();},[load]);
 return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.content}><Text style={s.title}>سائقو الشركة</Text><CompanyPicker/>{loading?<ActivityIndicator color={colors.primary[600]}/>:rows.map(r=><View key={r.id} style={s.card}><Text style={s.name}>{r.name}</Text><Text style={s.meta}>{r.status} · {r.vehicle_type??'بدون مركبة'}</Text>{r.vehicle_plate?<Text style={s.meta}>رقم المركبة: {r.vehicle_plate}</Text>:null}</View>)}{!loading&&!rows.length?<Text style={s.meta}>لا يوجد سائقون مسجلون لهذه الشركة.</Text>:null}</ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:colors.background},content:{padding:spacing.lg,gap:spacing.md},title:{fontSize:24,fontWeight:'800',color:colors.text},card:{backgroundColor:colors.surface,padding:spacing.md,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,gap:5},name:{fontWeight:'700',color:colors.text},meta:{color:colors.textSecondary}});
