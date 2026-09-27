import type { ReactNode } from 'react';
import { useAuth } from '@/lib/AuthContext';

export function PermissionGate({
  permission,
  companyId,
  children,
  fallback = null,
}: {
  permission: string;
  companyId?: string | null;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { hasPermission } = useAuth();
  return hasPermission(permission, companyId) ? <>{children}</> : <>{fallback}</>;
}
