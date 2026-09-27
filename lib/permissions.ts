export type ScopeType = 'platform' | 'company' | 'self';

export type Membership = {
  id: string;
  user_id: string;
  role_id: string;
  company_id: string | null;
  status: 'active' | 'suspended' | 'revoked';
  role: { key: string; name: string; scope_type: ScopeType; company_id?: string | null };
  permissions: string[];
};

export type CompanySummary = {
  id: string;
  name: string;
  slug: string;
  status: 'pending' | 'active' | 'suspended' | 'archived';
};

export function hasPermissionInMemberships(
  memberships: Membership[],
  permission: string,
  companyId?: string | null,
): boolean {
  return memberships.some((membership) => {
    if (membership.status !== 'active') return false;
    if (!membership.permissions.includes(permission)) return false;
    if (membership.role.key === 'platform_owner') return true;
    if (membership.role.scope_type === 'platform') return membership.company_id === null;
    if (membership.role.scope_type === 'company') {
      return membership.company_id !== null && (!companyId || membership.company_id === companyId) &&
        (!membership.role.company_id || membership.role.company_id === membership.company_id);
    }
    return membership.role.scope_type === 'self' && membership.company_id === null;
  });
}

export function hasPlatformPermissionInMemberships(memberships: Membership[], permission: string): boolean {
  return memberships.some((membership) => {
    if (membership.status !== 'active' || membership.company_id !== null) return false;
    if (membership.role.key === 'platform_owner') return true;
    return membership.role.scope_type === 'platform' && membership.permissions.includes(permission);
  });
}

export function canAccessCompanyInMemberships(memberships: Membership[], companyId: string): boolean {
  return memberships.some((membership) =>
    membership.status === 'active' &&
    (membership.role.key === 'platform_owner' ||
      (membership.role.scope_type === 'company' && membership.company_id === companyId &&
        (!membership.role.company_id || membership.role.company_id === companyId))),
  );
}

export function activeRoleKeys(memberships: Membership[]): Set<string> {
  return new Set(memberships.filter((m) => m.status === 'active').map((m) => m.role.key));
}
