import type { SupabaseClient } from "npm:@supabase/supabase-js@2.58.0";

export type AuthorizationMembership = {
  id: string;
  roleId: string;
  roleKey: string;
  scopeType: "platform" | "company" | "self";
  roleCompanyId: string | null;
  companyId: string | null;
  permissions: Set<string>;
};

export type ActorAuthorization = {
  userId: string;
  accountActive: boolean;
  memberships: AuthorizationMembership[];
};

export async function loadActorAuthorization(client: SupabaseClient, userId: string): Promise<ActorAuthorization | null> {
  const [{ data: profile, error: profileError }, { data: membershipRows, error: membershipError }] = await Promise.all([
    client.from("profiles").select("id,is_active,is_banned").eq("id", userId).maybeSingle(),
    client.from("user_memberships").select("id,user_id,role_id,company_id,status").eq("user_id", userId).eq("status", "active"),
  ]);
  if (profileError || membershipError || !profile) return null;
  const active = profile.is_active !== false && profile.is_banned !== true;
  if (!active) return { userId, accountActive: false, memberships: [] };
  const memberships = (membershipRows ?? []) as Array<{ id: string; role_id: string; company_id: string | null }>;
  if (!memberships.length) return { userId, accountActive: true, memberships: [] };

  const roleIds = [...new Set(memberships.map((membership) => membership.role_id))];
  const { data: roles, error: rolesError } = await client.from("roles").select("id,key,scope_type,company_id").in("id", roleIds);
  if (rolesError) return null;
  const roleById = new Map((roles ?? []).map((role: { id: string; key: string; scope_type: string; company_id: string | null }) => [role.id, role]));
  const { data: grants, error: grantsError } = await client.from("role_permissions").select("role_id,permission_id").in("role_id", roleIds);
  if (grantsError) return null;
  const permissionIds = [...new Set((grants ?? []).map((grant: { permission_id: string }) => grant.permission_id))];
  const { data: permissions, error: permissionsError } = permissionIds.length
    ? await client.from("permissions").select("id,key").in("id", permissionIds)
    : { data: [], error: null };
  if (permissionsError) return null;
  const permissionById = new Map((permissions ?? []).map((permission: { id: string; key: string }) => [permission.id, permission.key]));
  const permissionsByRole = new Map<string, Set<string>>();
  for (const grant of (grants ?? []) as Array<{ role_id: string; permission_id: string }>) {
    const key = permissionById.get(grant.permission_id);
    if (!key) continue;
    const keys = permissionsByRole.get(grant.role_id) ?? new Set<string>();
    keys.add(key);
    permissionsByRole.set(grant.role_id, keys);
  }

  return {
    userId,
    accountActive: true,
    memberships: memberships.flatMap((membership) => {
      const role = roleById.get(membership.role_id) as { id: string; key: string; scope_type: "platform" | "company" | "self"; company_id: string | null } | undefined;
      if (!role) return [];
      return [{
        id: membership.id,
        roleId: membership.role_id,
        roleKey: role.key,
        scopeType: role.scope_type,
        roleCompanyId: role.company_id,
        companyId: membership.company_id,
        permissions: permissionsByRole.get(membership.role_id) ?? new Set<string>(),
      }];
    }),
  };
}

export function hasPermission(authz: ActorAuthorization, permission: string, companyId?: string | null): boolean {
  if (!authz.accountActive) return false;
  return authz.memberships.some((membership) => {
    if (membership.roleKey === "platform_owner") return true;
    if (!membership.permissions.has(permission)) return false;
    if (membership.scopeType === "platform") return membership.companyId === null;
    if (membership.scopeType === "company") return !!companyId && membership.companyId === companyId && (!membership.roleCompanyId || membership.roleCompanyId === companyId);
    return membership.scopeType === "self" && membership.companyId === null;
  });
}

export function hasRole(authz: ActorAuthorization, ...roleKeys: string[]): boolean {
  return authz.accountActive && authz.memberships.some((membership) => roleKeys.includes(membership.roleKey));
}

export function companyIds(authz: ActorAuthorization): string[] {
  return [...new Set(authz.memberships
    .filter((membership) => membership.scopeType === "company" && membership.companyId)
    .map((membership) => membership.companyId as string))];
}

export function adminApiPermissions(path: string, method: string): string[] | null {
  const verb = method.toUpperCase();
  if (path === "/stats" && verb === "GET") return ["reports.view"];
  if (path === "/users" && verb === "GET") return ["users.view"];
  if (path === "/users/create-merchant" && verb === "POST") return ["users.create"];
  if (/^\/users\/[^/]+\/role$/.test(path) && verb === "PUT") return ["users.change_role"];
  if (/^\/users\/[^/]+\/(ban|active|status)$/.test(path) && verb === "PUT") return ["users.disable"];
  if (/^\/users\/[^/]+$/.test(path) && verb === "DELETE") return ["users.disable"];
  if (/^\/restrictions\/[^/]+$/.test(path)) return ["companies.manage_team"];
  if (path === "/products" && verb === "GET") return ["products.view"];
  if (path === "/products/bulk-delete" && verb === "POST") return ["products.delete"];
  if (/^\/products\/[^/]+$/.test(path) && verb === "PATCH") return ["products.edit"];
  if (/^\/products\/[^/]+$/.test(path) && verb === "DELETE") return ["products.delete"];
  if (path === "/orders" && verb === "GET") return ["orders.view"];
  if (path === "/chats" && verb === "GET") return ["users.view"];
  if (/^\/chats\/[^/]+\/messages$/.test(path) && verb === "GET") return ["users.view"];
  if (/^\/chats\/[^/]+$/.test(path) && verb === "DELETE") return ["users.view"];
  if (path === "/withdrawals" && verb === "GET") return ["finance.view"];
  if (/^\/withdrawals\/[^/]+$/.test(path) && verb === "PUT") return ["finance.manage_withdrawals"];
  if (path === "/withdrawals/batch-pay" && verb === "POST") return ["finance.manage_withdrawals"];
  if (path === "/merchants" && verb === "GET") return ["companies.view"];
  if (/^\/merchants\/[^/]+$/.test(path) && verb === "GET") return ["companies.view"];
  if (path === "/export/users" && verb === "GET") return ["users.view", "reports.export"];
  if (path === "/export/orders" && verb === "GET") return ["orders.view", "reports.export"];
  if (path === "/export/merchants" && verb === "GET") return ["companies.view", "reports.export"];
  if (path === "/export/products" && verb === "GET") return ["products.view", "reports.export"];
  if (path === "/export/withdrawals" && verb === "GET") return ["finance.view", "reports.export"];
  return null;
}

export function merchantApiPermission(path: string, method: string, body?: Record<string, unknown>): string | null {
  const verb = method.toUpperCase();
  if (path === "/orders" && verb === "GET") return "orders.view";
  if (/^\/orders\/[^/]+\/status$/.test(path) && verb === "POST") {
    const status = String(body?.status ?? "");
    if (status === "confirmed" || status === "approved") return "orders.approve";
    if (status === "processing" || status === "preparing") return "orders.prepare";
    if (status === "shipped" || status === "ready_for_delivery") return "orders.mark_ready";
    if (status === "delivered") return "orders.confirm_delivery";
    if (status === "cancelled") return "orders.cancel";
    if (status === "rejected") return "orders.reject";
    if (status === "waiting_for_driver") return "orders.assign_driver";
    return "orders.change_status";
  }
  if (/^\/orders\/[^/]+\/history$/.test(path) && verb === "GET") return "orders.view";
  if (path === "/export/orders" && verb === "GET") return "orders.view";
  if (path === "/export/products" && verb === "GET") return "products.view";
  if (path === "/export/earnings" && verb === "GET") return "finance.view";
  return null;
}
