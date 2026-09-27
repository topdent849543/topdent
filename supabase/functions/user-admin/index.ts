import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { companyIds, hasPermission, hasRole, loadActorAuthorization } from "../_shared/authorization.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return reply({ error: "Server configuration unavailable" }, 503);
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return reply({ error: "Authentication required" }, 401);
    const { data: { user }, error: authError } = await db.auth.getUser(authorization.slice(7));
    if (authError || !user) return reply({ error: "Unauthorized" }, 401);
    const actor = await loadActorAuthorization(db, user.id);
    if (!actor?.accountActive) return reply({ error: "Account is inactive or unauthorized" }, 403);
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.action !== "string") return reply({ error: "Invalid request" }, 400);
    const companyId = typeof body.company_id === "string" ? body.company_id : null;
    const isOwner = hasRole(actor, "platform_owner");
    const isPlatformAdmin = hasRole(actor, "platform_admin");

    if (body.action === "create-user") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
      const roleKey = typeof body.role_key === "string" ? body.role_key : "customer";
      if (!email || password.length < 8 || !fullName) return reply({ error: "Valid email, 8-character password, and full name are required" }, 400);
      const requestedCompanyRole = ["company_manager", "company_admin", "company_driver"].includes(roleKey) || roleKey.startsWith("custom-");
      if (roleKey === "platform_owner") return reply({ error: "Platform owner cannot be created through user administration" }, 403);
      if (requestedCompanyRole && !companyId) return reply({ error: "Company scope is required" }, 400);
      const isCompanyManager = hasRole(actor, "company_manager");
      if (isCompanyManager) {
        if (!companyId || !companyIds(actor).includes(companyId) || !hasPermission(actor, "users.create", companyId)) return reply({ error: "Company scope or permission denied" }, 403);
        if (!["company_admin", "company_driver"].includes(roleKey) && !roleKey.startsWith("custom-")) return reply({ error: "Company managers may create only company admins, company drivers, or scoped custom roles" }, 403);
      } else if (!isOwner && !isPlatformAdmin && (!hasPermission(actor, "users.create") || (requestedCompanyRole && !companyId))) {
        return reply({ error: "Permission denied" }, 403);
      }
      const { data: role } = await db.from("roles").select("id,key,scope_type,company_id").eq("key", roleKey).maybeSingle();
      if (!role || role.key === "platform_owner" || (role.scope_type === "platform" && !isOwner) || (role.company_id && role.company_id !== companyId)) return reply({ error: "Role assignment is not permitted" }, 403);
      const companyRole = role.scope_type === "company";
      if (companyRole && (!companyId || (role.company_id && role.company_id !== companyId))) return reply({ error: "Company scope is required" }, 403);
      const { data: created, error: createError } = await db.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name: fullName, signup_requested_role: roleKey === "publisher" ? "publisher" : "customer" },
      });
      if (createError || !created.user) return reply({ error: "Unable to create user" }, 400);
      const userId = created.user.id;
      const legacyRole = ["company_manager", "company_admin"].includes(roleKey) ? "merchant" : roleKey === "publisher" ? "publisher" : "customer";
      await db.from("profiles").upsert({ id: userId, full_name: fullName, role: legacyRole });
      if (roleKey !== "customer") {
        const { error: membershipError } = await db.from("user_memberships").upsert({ user_id: userId, role_id: role.id, company_id: companyRole ? companyId : null, status: "active", assigned_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "user_id,role_id,company_id" });
        if (membershipError) {
          await db.auth.admin.deleteUser(userId);
          return reply({ error: "Unable to create scoped membership" }, 500);
        }
      }
      if (roleKey === "company_driver" || roleKey === "global_driver") {
        const { error: driverError } = await db.from("drivers").upsert({
          user_id: userId,
          driver_type: roleKey === "company_driver" ? "company" : "global",
          company_id: roleKey === "company_driver" ? companyId : null,
          status: "active",
        }, { onConflict: "user_id" });
        if (driverError) {
          await db.from("user_memberships").update({ status: "revoked" }).eq("user_id", userId).eq("role_id", role.id);
          await db.auth.admin.deleteUser(userId);
          return reply({ error: "Unable to create driver profile" }, 500);
        }
      }
      if (roleKey === "publisher") await db.from("wallets").upsert({ user_id: userId });
      await db.from("audit_logs").insert({ actor_user_id: user.id, company_id: companyId, action: "user.created", resource_type: "user", resource_id: userId, after_data: { email, role: roleKey, company_id: companyRole ? companyId : null } });
      return reply({ success: true, user_id: userId });
    }

    if (body.action === "disable-user") {
      const targetId = typeof body.user_id === "string" ? body.user_id : "";
      if (!targetId) return reply({ error: "Target user is required" }, 400);
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!reason) return reply({ error: "A reason is required" }, 400);
      if (!isOwner && !isPlatformAdmin) {
        if (!companyId || !companyIds(actor).includes(companyId) || !hasPermission(actor, "users.disable", companyId)) return reply({ error: "Permission denied" }, 403);
        const { data: scopedMembership } = await db.from("user_memberships").select("id,role_id,status").eq("user_id", targetId).eq("company_id", companyId).eq("status", "active").limit(1).maybeSingle();
        if (!scopedMembership) return reply({ error: "Target user is outside this company" }, 403);
        const { error: revokeError } = await db.from("user_memberships").update({ status: "revoked", updated_at: new Date().toISOString() }).eq("id", scopedMembership.id);
        if (revokeError) return reply({ error: "Unable to revoke company membership" }, 500);
        await db.from("audit_logs").insert({ actor_user_id: user.id, company_id: companyId, action: "membership.revoked", resource_type: "user_membership", resource_id: scopedMembership.id, before_data: { user_id: targetId, status: scopedMembership.status }, after_data: { status: "revoked" }, reason });
        return reply({ success: true, membership_revoked: true });
      } else if (!hasPermission(actor, "users.disable") && !isOwner) return reply({ error: "Permission denied" }, 403);
      const { data: ownerRole } = await db.from("roles").select("id").eq("key", "platform_owner").single();
      if (!ownerRole) return reply({ error: "Platform owner role is not configured" }, 503);
      const { data: ownerMemberships } = await db.from("user_memberships").select("id,user_id").eq("role_id", ownerRole.id).eq("status", "active");
      if (ownerMemberships?.some((membership: { user_id: string }) => membership.user_id === targetId) && (ownerMemberships?.length ?? 0) <= 1) return reply({ error: "Cannot disable the last platform owner" }, 409);
      const { data: before } = await db.from("profiles").select("is_active,is_banned").eq("id", targetId).maybeSingle();
      if (!before) return reply({ error: "User not found" }, 404);
      const { error: updateError } = await db.from("profiles").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", targetId);
      if (updateError) return reply({ error: "Unable to disable user" }, 500);
      await db.from("audit_logs").insert({ actor_user_id: user.id, company_id: companyId, action: "user.disabled", resource_type: "user", resource_id: targetId, before_data: before, after_data: { is_active: false }, reason });
      return reply({ success: true });
    }

    if (body.action === "change-user-role") {
      const targetId = typeof body.user_id === "string" ? body.user_id : "";
      const roleKey = typeof body.role_key === "string" ? body.role_key : "";
      if (!targetId || !roleKey || roleKey === "platform_owner") return reply({ error: "Valid user and non-owner role are required" }, 400);
      const platformBase = Deno.env.get("SUPABASE_URL")!.replace(/\/$/, "");
      const response = await fetch(`${platformBase}/functions/v1/role-admin`, {
        method: "POST",
        headers: { Authorization: authorization, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign-role", user_id: targetId, role_key: roleKey, company_id: companyId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return reply({ error: typeof result.error === "string" ? result.error : "Role assignment denied" }, response.status);
      return reply({ success: true });
    }
    return reply({ error: "Unknown action" }, 404);
  } catch {
    return reply({ error: "Request could not be completed" }, 500);
  }
});
