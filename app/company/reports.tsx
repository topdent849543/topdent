import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';
import { CompanyPicker } from '@/components/CompanyPicker';
import { ArabicText as Text } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius } from '@/lib/theme';
export default function CompanyReportsScreen(){
 const {activeCompany,hasPermission}=useAuth();const [loading,setLoading]=useState(true);const [counts,setCounts]=useState<Record<string,number>>({});const [earnings,setEarnings]=useState<number|null>(null);
 const load=useCallback(async()=>{if(!activeCompany?.id){setLoading(false);return;}setLoading(true);const {data}=await supabase.from('company_order_fulfillments').select('status').eq('company_id',activeCompany.id);const next:Record<string,number>={};for(const row of data??[])next[row.status]=(next[row.status]??0)+1;setCounts(next);if(hasPermission('finance.view',activeCompany.id)){const {data:items}=await supabase.from('order_items').select('merchant_earnings').eq('company_id',activeCompany.id);setEarnings((items??[]).reduce((sum:any,row:any)=>sum+Number(row.merchant_earnings??0),0));}else setEarnings(null);setLoading(false);},[activeCompany?.id,hasPermission]);
 useEffect(()=>{load();},[load]);
 return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.content}><Text style={s.title}>تقارير الشركة</Text><CompanyPicker/>{loading?<ActivityIndicator color={colors.primary[600]}/>:<><View style={s.card}><Text style={s.heading}>الطلبات حسب الحالة</Text>{Object.entries(counts).map(([status,count])=><View key={status} style={s.row}><Text style={s.label}>{status}</Text><Text style={s.value}>{count}</Text></View>)}{!Object.keys(counts).length?<Text style={s.label}>لا توجد طلبات مسجلة.</Text>:null}</View>{earnings!==null?<View style={s.card}><Text style={s.heading}>إجمالي مستحقات المنتجات</Text><Text style={s.total}>{earnings.toLocaleString()} ل.س</Text><Text style={s.label}>تظهر هذه البيانات للأعضاء المخولين مالياً فقط.</Text></View>:null}</>}</ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:colors.background},content:{padding:spacing.lg,gap:spacing.md},title:{fontSize:24,fontWeight:'800',color:colors.text},card:{backgroundColor:colors.surface,padding:spacing.md,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,gap:spacing.sm},heading:{fontWeight:'700',fontSize:18,color:colors.text},row:{flexDirection:'row',justifyContent:'space-between'},label:{color:colors.textSecondary},value:{color:colors.text,fontWeight:'700'},total:{fontSize:22,fontWeight:'800',color:colors.primary[700]}});
