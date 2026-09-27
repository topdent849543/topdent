import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { companyIds, hasPermission, hasRole, loadActorAuthorization } from "../_shared/authorization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "Server configuration unavailable" }, 503);
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.slice(7));
    if (userError || !user) return json({ error: "Unauthorized" }, 401);
    const actor = await loadActorAuthorization(supabase, user.id);
    if (!actor?.accountActive) return json({ error: "Account is inactive or unauthorized" }, 403);
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.action !== "string") return json({ error: "Invalid request" }, 400);

    if (body.action === "create-role") {
      const scopeType = body.scope_type;
      const companyId = typeof body.company_id === "string" ? body.company_id : null;
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const rawKey = typeof body.key === "string" ? body.key : name;
      const key = rawKey.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
      const permissionKeys = Array.isArray(body.permissions) ? body.permissions.filter((value): value is string => typeof value === "string") : [];
      if (!name || !key || scopeType !== "company" || !companyId || permissionKeys.length === 0) {
        return json({ error: "A company role name, company scope, and permission list are required" }, 400);
      }
      if (!hasRole(actor, "platform_owner") && (!hasPermission(actor, "roles.create", companyId) || !companyIds(actor).includes(companyId))) {
        return json({ error: "Permission denied" }, 403);
      }
      if (!hasPermission(actor, "roles.edit_permissions", companyId) && !hasRole(actor, "platform_owner")) {
        return json({ error: "Permission denied" }, 403);
      }
      if (permissionKeys.some((permission) => !hasPermission(actor, permission, companyId))) {
        return json({ error: "A role cannot grant permissions that the actor does not hold" }, 403);
      }
      const { data: permissionRows, error: permissionError } = await supabase.from("permissions").select("id,key").in("key", permissionKeys);
      if (permissionError || !permissionRows || permissionRows.length !== new Set(permissionKeys).size) return json({ error: "Unknown permission key" }, 400);
      const { data: role, error: roleError } = await supabase.from("roles").insert({
        key: `custom-${companyId.slice(0, 8)}-${key}`,
        name,
        scope_type: "company",
        company_id: companyId,
        is_system_role: false,
        created_by: user.id,
      }).select("id,key,name,scope_type,company_id").single();
      if (roleError || !role) return json({ error: "Unable to create role" }, 400);
      const { error: grantError } = await supabase.from("role_permissions").insert(permissionRows.map((permission: { id: string }) => ({
        role_id: role.id, permission_id: permission.id, granted_by: user.id,
      })));
      if (grantError) return json({ error: "Role was created but permission assignment failed" }, 500);
      await supabase.from("audit_logs").insert({
        actor_user_id: user.id, company_id: companyId, action: "role.created", resource_type: "role", resource_id: role.id,
        after_data: { key: role.key, name, scope_type: "company", permissions: permissionKeys },
      });
      return json({ success: true, role });
    }

    if (body.action === "update-role-permissions") {
      if (!hasRole(actor, "platform_owner")) return json({ error: "Platform owner required" }, 403);
      const roleId = typeof body.role_id === "string" ? body.role_id : "";
      const permissionKeys = Array.isArray(body.permissions) ? body.permissions.filter((value): value is string => typeof value === "string") : [];
      if (!roleId || !permissionKeys.length) return json({ error: "Role and non-empty permissions are required" }, 400);
      const { data: role } = await supabase.from("roles").select("id,key,company_id").eq("id", roleId).maybeSingle();
      if (!role || role.key === "platform_owner") return json({ error: "Role cannot be modified" }, 400);
      const { data: permissionRows, error: permissionError } = await supabase.from("permissions").select("id,key").in("key", permissionKeys);
      if (permissionError || !permissionRows || permissionRows.length !== new Set(permissionKeys).size) return json({ error: "Unknown permission key" }, 400);
      const { data: oldRows } = await supabase.from("role_permissions").select("permission_id").eq("role_id", roleId);
      const { error: deleteError } = await supabase.from("role_permissions").delete().eq("role_id", roleId);
      if (deleteError) return json({ error: "Unable to update permissions" }, 500);
      const { error: insertError } = await supabase.from("role_permissions").insert(permissionRows.map((permission: { id: string }) => ({
        role_id: roleId, permission_id: permission.id, granted_by: user.id,
      })));
      if (insertError) return json({ error: "Unable to update permissions" }, 500);
      await supabase.from("audit_logs").insert({
        actor_user_id: user.id, company_id: role.company_id, action: "role.permissions_updated", resource_type: "role", resource_id: roleId,
        before_data: { permission_ids: (oldRows ?? []).map((row: { permission_id: string }) => row.permission_id) },
        after_data: { permission_keys: permissionKeys },
      });
      return json({ success: true });
    }

    if (body.action === "assign-role" || body.action === "revoke-role") {
      const userId = typeof body.user_id === "string" ? body.user_id : "";
      const roleKey = typeof body.role_key === "string" ? body.role_key : "";
      const companyId = typeof body.company_id === "string" ? body.company_id : null;
      if (!userId || !roleKey) return json({ error: "Target user and role are required" }, 400);
      if (roleKey === "platform_owner") return json({ error: "Platform owner roles require the protected bootstrap/transfer procedure" }, 403);
      const isOwner = hasRole(actor, "platform_owner");
      const isPlatformAdmin = hasRole(actor, "platform_admin");
      if (!isOwner && roleKey === "platform_admin") return json({ error: "Only the platform owner may assign platform admins" }, 403);
      const companyScoped = ["company_manager", "company_admin", "company_driver"].includes(roleKey) || roleKey.startsWith("custom-");
      if (companyScoped && !companyId) return json({ error: "Company scope is required" }, 400);
      if (!isOwner && !isPlatformAdmin) {
        if (!companyId || !companyIds(actor).includes(companyId) || !hasPermission(actor, "users.change_role", companyId)) {
          return json({ error: "Permission denied" }, 403);
        }
        if (!["company_admin", "company_driver"].includes(roleKey) && !roleKey.startsWith("custom-")) return json({ error: "Company managers may assign only company admins, scoped custom roles, or drivers" }, 403);
      }
      const { data: role } = await supabase.from("roles").select("id,key,scope_type,company_id").eq("key", roleKey).maybeSingle();
      if (!role) return json({ error: "Unknown role" }, 400);
      if (role.scope_type === "platform" && !isOwner) return json({ error: "Only the platform owner may assign or revoke platform roles" }, 403);
      if (role.scope_type === "company" && role.company_id && role.company_id !== companyId) return json({ error: "Role belongs to another company" }, 403);
      if (role.scope_type === "company" && !companyId) return json({ error: "Company scope is required" }, 400);
      if (companyId) {
        const { data: company } = await supabase.from("companies").select("id,status").eq("id", companyId).maybeSingle();
        if (!company || company.status !== "active") return json({ error: "Company is unavailable" }, 400);
      }
      const { data: target } = await supabase.from("profiles").select("id,is_active,is_banned").eq("id", userId).maybeSingle();
      if (!target || target.is_active === false || target.is_banned === true) return json({ error: "Target account is unavailable" }, 400);
      let currentQuery = supabase.from("user_memberships").select("id,status").eq("user_id", userId).eq("role_id", role.id);
      currentQuery = companyId ? currentQuery.eq("company_id", companyId) : currentQuery.is("company_id", null);
      const { data: current } = await currentQuery.maybeSingle();
      if (body.action === "revoke-role") {
        if (!current) return json({ success: true });
        if (userId === user.id && roleKey === "platform_owner") return json({ error: "You cannot revoke your own last platform owner role" }, 409);
        const { error } = await supabase.from("user_memberships").update({ status: "revoked", updated_at: new Date().toISOString() }).eq("id", current.id);
        if (error) return json({ error: "Unable to revoke membership" }, 500);
        if (roleKey === "company_driver" || roleKey === "global_driver") await supabase.from("drivers").update({ status: "suspended", updated_at: new Date().toISOString() }).eq("user_id", userId);
        await supabase.from("audit_logs").insert({ actor_user_id: user.id, company_id: companyId, action: "membership.revoked", resource_type: "user_membership", resource_id: current.id, before_data: { user_id: userId, role: roleKey, status: current.status }, after_data: { status: "revoked" } });
        return json({ success: true });
      }
      if (current) {
        const { error } = await supabase.from("user_memberships").update({ status: "active", assigned_by: user.id, updated_at: new Date().toISOString() }).eq("id", current.id);
        if (error) return json({ error: "Unable to activate membership" }, 500);
        if (roleKey === "company_driver" || roleKey === "global_driver") {
          const { error: driverError } = await supabase.from("drivers").upsert({ user_id: userId, driver_type: roleKey === "company_driver" ? "company" : "global", company_id: roleKey === "company_driver" ? companyId : null, status: "active" }, { onConflict: "user_id" });
          if (driverError) return json({ error: "Unable to activate driver profile" }, 500);
        }
        await supabase.from("audit_logs").insert({ actor_user_id: user.id, company_id: companyId, action: "membership.role_assigned", resource_type: "user_membership", resource_id: current.id, before_data: { status: current.status }, after_data: { user_id: userId, role: roleKey, status: "active" } });
        return json({ success: true, membership_id: current.id });
      }
      const { data: membership, error } = await supabase.from("user_memberships").insert({
        user_id: userId, role_id: role.id, company_id: companyScoped ? companyId : null, status: "active", assigned_by: user.id,
      }).select("id").single();
      if (error || !membership) return json({ error: "Unable to assign membership" }, 500);
      if (roleKey === "company_driver" || roleKey === "global_driver") {
        const { error: driverError } = await supabase.from("drivers").upsert({ user_id: userId, driver_type: roleKey === "company_driver" ? "company" : "global", company_id: roleKey === "company_driver" ? companyId : null, status: "active" }, { onConflict: "user_id" });
        if (driverError) return json({ error: "Unable to create driver profile" }, 500);
      }
      await supabase.from("audit_logs").insert({ actor_user_id: user.id, company_id: companyId, action: "membership.role_assigned", resource_type: "user_membership", resource_id: membership.id, after_data: { user_id: userId, role: roleKey } });
      return json({ success: true, membership_id: membership.id });
    }
    return json({ error: "Unknown action" }, 404);
  } catch {
    return json({ error: "Request could not be completed" }, 500);
  }
});
