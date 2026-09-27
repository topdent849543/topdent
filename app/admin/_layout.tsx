import { Stack, usePathname } from 'expo-router';
import { RequirePermission } from '@/components/RequirePermission';
import { useAuth } from '@/lib/AuthContext';

function permissionForPath(pathname: string): string {
  if (pathname === '/admin' || pathname === '/admin/') return 'reports.view';
  if (pathname.startsWith('/admin/orders')) return 'orders.view';
  if (pathname.startsWith('/admin/products')) return 'products.view';
  if (pathname.startsWith('/admin/users')) return 'users.view';
  if (pathname.startsWith('/admin/roles')) return 'roles.view';
  if (pathname.startsWith('/admin/audit')) return 'audit_logs.view';
  if (pathname.startsWith('/admin/drivers')) return 'drivers.view';
  if (pathname.startsWith('/admin/reports')) return 'reports.view';
  if (pathname.startsWith('/admin/merchants')) return 'companies.view';
  if (pathname.startsWith('/admin/withdrawals') || pathname.startsWith('/admin/payment-requests') || pathname.startsWith('/admin/payment-methods')) return 'finance.view';
  if (pathname.startsWith('/admin/categories') || pathname.startsWith('/admin/banners') || pathname.startsWith('/admin/settings') || pathname.startsWith('/admin/ai-settings') || pathname.startsWith('/admin/shipping-branches')) return 'settings.manage';
  if (pathname.startsWith('/admin/chats') || pathname.startsWith('/admin/support')) return 'users.view';
  return 'reports.view';
}

export default function AdminLayout() {
  const pathname = usePathname();
  const { activeCompany } = useAuth();
  return (
    <RequirePermission permission={permissionForPath(pathname)} companyId={activeCompany?.id}>
      <Stack screenOptions={{ headerShown: false }} />
    </RequirePermission>
  );
}
