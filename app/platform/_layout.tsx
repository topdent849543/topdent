import { Stack, usePathname } from 'expo-router';
import { RequireAnyPermission } from '@/components/RequireAnyPermission';
import { RequirePermission } from '@/components/RequirePermission';

const overviewPermissions = [
  'orders.view', 'products.view', 'drivers.view', 'users.view', 'companies.view',
  'roles.view', 'audit_logs.view', 'finance.view', 'reports.view',
  'subscriptions.manage', 'settings.manage',
];

function permissionForPath(pathname: string): string {
  if (pathname.endsWith('/orders')) return 'orders.view';
  if (pathname.endsWith('/products')) return 'products.view';
  if (pathname.endsWith('/drivers')) return 'drivers.view';
  if (pathname.endsWith('/users')) return 'users.view';
  if (pathname.endsWith('/companies')) return 'companies.view';
  if (pathname.endsWith('/roles')) return 'roles.view';
  if (pathname.endsWith('/audit') || pathname.endsWith('/audit-logs')) return 'audit_logs.view';
  if (pathname.endsWith('/finance')) return 'finance.view';
  if (pathname.endsWith('/subscriptions')) return 'subscriptions.manage';
  if (pathname.endsWith('/settings')) return 'settings.manage';
  return 'reports.view';
}

export default function PlatformLayout() {
  const pathname = usePathname();
  if (pathname === '/platform' || pathname === '/platform/') {
    return <RequireAnyPermission permissions={overviewPermissions} platformOnly><Stack screenOptions={{ headerShown: false }} /></RequireAnyPermission>;
  }
  return <RequirePermission permission={permissionForPath(pathname)} platformOnly><Stack screenOptions={{ headerShown: false }} /></RequirePermission>;
}
