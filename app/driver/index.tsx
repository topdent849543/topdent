import { router } from 'expo-router';
import { SafeAreaView, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ArabicText as Text } from '@/components/ArabicText';
import { colors, spacing, radius } from '@/lib/theme';
const cards=[['الطلبات المتاحة','/driver/available-orders'],['طلباتي والتوصيل','/driver/my-orders'],['الإبلاغ عن مشكلة','/driver/problems'],['الملف الشخصي','/driver/profile']] as const;
export default function DriverDashboard(){return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.content}><Text style={s.title}>لوحة السائق</Text><Text style={s.subtitle}>اقبل الطلبات، حدّث حالة التوصيل، وسجّل التحصيل أو أي مشكلة.</Text><View style={s.grid}>{cards.map(([label,path])=><TouchableOpacity key={path} style={s.card} onPress={()=>router.push(path as never)}><Text style={s.cardText}>{label}</Text></TouchableOpacity>)}</View></ScrollView></SafeAreaView>;}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:colors.background},content:{padding:spacing.lg,gap:spacing.md},title:{fontSize:26,fontWeight:'800',color:colors.text},subtitle:{color:colors.textSecondary,lineHeight:22},grid:{gap:spacing.md},card:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.lg,minHeight:72,justifyContent:'center'},cardText:{fontWeight:'700',color:colors.text,fontSize:16}});
