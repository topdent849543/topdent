import type { ReactNode } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from 'react-native';
import { ShieldX } from 'lucide-react-native';
import { useAuth } from '@/lib/AuthContext';
import { colors, spacing } from '@/lib/theme';
import { ArabicText as Text } from '@/components/ArabicText';
export function RequireAnyPermission({permissions,children,platformOnly=false}:{permissions:string[];children:ReactNode;platformOnly?:boolean}){const {loading,user,hasPermission,hasPlatformPermission}=useAuth();if(loading)return <SafeAreaView style={s.container}><ActivityIndicator color={colors.primary[600]}/></SafeAreaView>;if(!user||!permissions.some(p=>platformOnly?hasPlatformPermission(p):hasPermission(p)))return <SafeAreaView style={s.container}><View style={s.card}><ShieldX size={42} color={colors.error[500]}/><Text style={s.title}>غير مصرح بالوصول</Text><Text style={s.message}>لا تملك صلاحية لأي قسم في لوحة المنصة.</Text></View></SafeAreaView>;return <>{children}</>;}
const s=StyleSheet.create({container:{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:colors.background,padding:spacing.lg},card:{alignItems:'center',gap:spacing.md,maxWidth:360},title:{color:colors.text,fontSize:20,fontWeight:'700'},message:{color:colors.textSecondary,textAlign:'center',lineHeight:24}});
