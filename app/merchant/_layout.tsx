import { Stack, usePathname } from 'expo-router';
import { RequirePermission } from '@/components/RequirePermission';
import { useAuth } from '@/lib/AuthContext';

function permissionForPath(pathname: string): string {
  if (pathname.startsWith('/merchant/orders')) return 'orders.view';
  if (pathname.startsWith('/merchant/products') || pathname.startsWith('/merchant/reels')) return 'products.view';
  if (pathname.startsWith('/merchant/wallet') || pathname.startsWith('/merchant/withdrawals')) return 'finance.view';
  if (pathname.startsWith('/merchant/chats')) return 'users.view';
  return 'reports.view';
}

export default function MerchantLayout() {
  const pathname = usePathname();
  const { activeCompany } = useAuth();
  return (
    <RequirePermission permission={permissionForPath(pathname)} companyId={activeCompany?.id}>
      <Stack screenOptions={{ headerShown: false }} />
    </RequirePermission>
  );
}
