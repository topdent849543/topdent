import { Stack, usePathname } from 'expo-router';
import { RequirePermission } from '@/components/RequirePermission';
import { useAuth } from '@/lib/AuthContext';

export default function CompanyLayout() {
  const path = usePathname();
  const { activeCompany } = useAuth();
  const permission = path.endsWith('/team') ? 'users.view'
    : path.endsWith('/drivers') ? 'drivers.view'
    : path.endsWith('/reports') ? 'reports.view'
    : path.endsWith('/settings') ? 'companies.view'
    : path.endsWith('/products') ? 'products.view'
    : path.endsWith('/orders') ? 'orders.view'
    : 'companies.view';
  return <RequirePermission permission={permission} companyId={activeCompany?.id}><Stack screenOptions={{ headerShown: false }} /></RequirePermission>;
}
