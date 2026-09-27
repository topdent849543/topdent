import type { Membership } from './permissions';

export function getCompanyIds(memberships: Membership[]): string[] {
  return [...new Set(memberships
    .filter((membership) => membership.status === 'active' && membership.company_id)
    .map((membership) => membership.company_id as string))];
}

export function canAccessCompany(memberships: Membership[], companyId: string | null | undefined): boolean {
  if (!companyId) return false;
  return memberships.some((membership) => membership.status === 'active' &&
    (membership.role.key === 'platform_owner' ||
      (membership.role.scope_type === 'company' && membership.company_id === companyId &&
        (!membership.role.company_id || membership.role.company_id === companyId))));
}

export function companyIdsForRole(memberships: Membership[], roleKeys: string[]): string[] {
  const allowed = new Set(roleKeys);
  return [...new Set(memberships
    .filter((membership) => membership.status === 'active' && allowed.has(membership.role.key) && membership.company_id)
    .map((membership) => membership.company_id as string))];
}
