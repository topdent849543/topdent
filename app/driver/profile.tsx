import { SafeAreaView, StyleSheet, View } from 'react-native';
import { ArabicText as Text } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { colors, spacing, radius } from '@/lib/theme';
export default function DriverProfile(){const {user,profile}=useAuth();return <SafeAreaView style={s.screen}><View style={s.card}><Text style={s.title}>ملفي كسائق</Text><Text style={s.text}>{profile?.full_name??user?.email??'السائق'}</Text><Text style={s.text}>{user?.email??''}</Text><Text style={s.note}>إدارة بيانات السائق ومركبته متاحة لمسؤول الشركة المخوّل.</Text></View></SafeAreaView>;}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:colors.background,padding:spacing.lg},card:{backgroundColor:colors.surface,padding:spacing.lg,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,gap:spacing.md},title:{fontSize:24,fontWeight:'800',color:colors.text},text:{color:colors.text},note:{color:colors.textSecondary,lineHeight:22}});
