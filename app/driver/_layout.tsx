import { Stack, usePathname } from 'expo-router';
import { RequirePermission } from '@/components/RequirePermission';
export default function DriverLayout(){const path=usePathname();const permission=path.endsWith('/problems')?'drivers.report_problem':'drivers.accept_orders';return <RequirePermission permission={permission}><Stack screenOptions={{headerShown:false}}/></RequirePermission>;}
