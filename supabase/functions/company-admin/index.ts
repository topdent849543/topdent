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
    const bearer = req.headers.get("Authorization");
    if (!bearer?.startsWith("Bearer ")) return reply({ error: "Authentication required" }, 401);
    const { data: { user }, error } = await db.auth.getUser(bearer.slice(7));
    if (error || !user) return reply({ error: "Unauthorized" }, 401);
    const authz = await loadActorAuthorization(db, user.id);
    if (!authz?.accountActive) return reply({ error: "Account is inactive or unauthorized" }, 403);
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.action !== "string") return reply({ error: "Invalid request" }, 400);

    if (body.action === "list-subscriptions") {
      if (!hasPermission(authz, "subscriptions.manage")) return reply({ error: "Permission denied" }, 403);
      const [companies, subscriptions, plans] = await Promise.all([
        db.from("companies").select("id,name,slug,status").order("name"),
        db.from("subscriptions").select("id,company_id,plan_id,status,current_period_start,current_period_end,cancel_at_period_end,created_at").order("created_at", { ascending: false }),
        db.from("subscription_plans").select("id,key,name,price,currency,interval,product_limit,is_active").order("name"),
      ]);
      if (companies.error || subscriptions.error || plans.error) return reply({ error: "Unable to load subscription data" }, 500);
      return reply({ companies: companies.data ?? [], subscriptions: subscriptions.data ?? [], plans: plans.data ?? [] });
    }

    if (body.action === "create-subscription-plan") {
      if (!hasPermission(authz, "subscriptions.manage")) return reply({ error: "Permission denied" }, 403);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const key = typeof body.key === "string" ? body.key.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") : "";
      const price = typeof body.price === "number" ? body.price : Number(body.price);
      const interval = body.interval === "year" ? "year" : body.interval === "month" ? "month" : null;
      const productLimit = body.product_limit === null || body.product_limit === undefined ? null : Number(body.product_limit);
      if (!name || !key || !Number.isFinite(price) || price < 0 || !interval || (productLimit !== null && (!Number.isInteger(productLimit) || productLimit < 0))) return reply({ error: "Plan name, key, valid non-negative price, interval, and product limit are required" }, 400);
      const { data: plan, error: planError } = await db.from("subscription_plans").insert({ key, name, price, interval, product_limit: productLimit, currency: typeof body.currency === "string" ? body.currency : "USD", is_active: true }).select("id,key,name,price,currency,interval,product_limit,is_active").single();
      if (planError || !plan) return reply({ error: "Unable to create subscription plan" }, 400);
      await db.from("audit_logs").insert({ actor_user_id: user.id, action: "subscription.plan_created", resource_type: "subscription_plan", resource_id: plan.id, after_data: plan });
      return reply({ success: true, plan });
    }

    if (body.action === "manage-subscription") {
      if (!hasPermission(authz, "subscriptions.manage")) return reply({ error: "Permission denied" }, 403);
      const companyId = typeof body.company_id === "string" ? body.company_id : "";
      const status = typeof body.status === "string" ? body.status : "";
      const planId = typeof body.plan_id === "string" ? body.plan_id : null;
      const validStatuses = ["trialing", "active", "past_due", "canceled", "expired"];
      if (!companyId || !validStatuses.includes(status)) return reply({ error: "Company and valid subscription status are required" }, 400);
      const { data: company } = await db.from("companies").select("id").eq("id", companyId).maybeSingle();
      if (!company) return reply({ error: "Company not found" }, 404);
      if (planId) {
        const { data: plan } = await db.from("subscription_plans").select("id,is_active").eq("id", planId).maybeSingle();
        if (!plan || !plan.is_active) return reply({ error: "Subscription plan is unavailable" }, 400);
      }
      const { data: beforeRows } = await db.from("subscriptions").select("id,plan_id,status,current_period_start,current_period_end,cancel_at_period_end").eq("company_id", companyId).order("created_at", { ascending: false }).limit(1);
      const before = beforeRows?.[0] ?? null;
      const patch = { plan_id: planId, status, current_period_start: typeof body.current_period_start === "string" ? body.current_period_start : new Date().toISOString(), current_period_end: typeof body.current_period_end === "string" ? body.current_period_end : null, cancel_at_period_end: body.cancel_at_period_end === true, updated_at: new Date().toISOString() };
      const result = before
        ? await db.from("subscriptions").update(patch).eq("id", before.id).select("id,company_id,plan_id,status,current_period_start,current_period_end,cancel_at_period_end").single()
        : await db.from("subscriptions").insert({ ...patch, company_id: companyId }).select("id,company_id,plan_id,status,current_period_start,current_period_end,cancel_at_period_end").single();
      if (result.error || !result.data) return reply({ error: "Unable to save subscription" }, 500);
      await db.from("audit_logs").insert({ actor_user_id: user.id, company_id: companyId, action: "subscription.updated", resource_type: "subscription", resource_id: result.data.id, before_data: before, after_data: result.data, reason: typeof body.reason === "string" ? body.reason : null });
      return reply({ success: true, subscription: result.data });
    }

    if (body.action === "create-company") {
      if (!hasPermission(authz, "companies.create")) return reply({ error: "Permission denied" }, 403);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const slug = typeof body.slug === "string" ? body.slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") : "";
      if (!name || !slug) return reply({ error: "Company name and slug are required" }, 400);
      const managerId = typeof body.manager_user_id === "string" ? body.manager_user_id : null;
      if (managerId) {
        const { data: target } = await db.from("profiles").select("id,is_active,is_banned").eq("id", managerId).maybeSingle();
        if (!target || target.is_active === false || target.is_banned === true) return reply({ error: "Manager account is unavailable" }, 400);
      }
      const isOwner = hasRole(authz, "platform_owner");
      const { data: company, error: insertError } = await db.from("companies").insert({
        name, slug, status: isOwner ? "active" : "pending", owner_user_id: managerId,
        logo_url: typeof body.logo_url === "string" ? body.logo_url : null,
        description: typeof body.description === "string" ? body.description : null,
        phone: typeof body.phone === "string" ? body.phone : null,
        whatsapp: typeof body.whatsapp === "string" ? body.whatsapp : null,
        email: typeof body.email === "string" ? body.email : null,
        address: typeof body.address === "string" ? body.address : null,
      }).select("id,name,slug,status,owner_user_id").single();
      if (insertError || !company) return reply({ error: "Unable to create company" }, 400);
      if (managerId && isOwner && company.status === "active") {
        const { data: role } = await db.from("roles").select("id").eq("key", "company_manager").single();
        if (!role) return reply({ error: "Company manager role is not configured" }, 503);
        const { data: membership, error: membershipError } = await db.from("user_memberships").upsert({ user_id: managerId, role_id: role.id, company_id: company.id, status: "active", assigned_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "user_id,role_id,company_id" }).select("id").single();
        if (membershipError || !membership) return reply({ error: "Company created but manager assignment failed" }, 500);
        await db.from("audit_logs").insert({ actor_user_id: user.id, company_id: company.id, action: "membership.company_manager_assigned", resource_type: "user_membership", resource_id: membership.id, after_data: { user_id: managerId, role: "company_manager" } });
      }
      await db.from("audit_logs").insert({ actor_user_id: user.id, company_id: company.id, action: "company.created", resource_type: "company", resource_id: company.id, after_data: { name, slug, status: company.status } });
      return reply({ success: true, company });
    }

    const companyId = typeof body.company_id === "string" ? body.company_id : "";
    if (!companyId) return reply({ error: "Company scope is required" }, 400);
    const inCompany = companyIds(authz).includes(companyId);

    if (body.action === "update-company") {
      if (!inCompany || !hasPermission(authz, "companies.edit", companyId)) return reply({ error: "Company scope or permission denied" }, 403);
      const patch: Record<string, string | null> = {};
      for (const field of ["name", "logo_url", "description", "phone", "whatsapp", "email", "address"] as const) {
        if (typeof body[field] === "string") patch[field] = body[field] as string;
      }
      if (typeof body.governorate_id === "string" || body.governorate_id === null) patch.governorate_id = body.governorate_id as string | null;
      if (!Object.keys(patch).length) return reply({ error: "No editable company fields were supplied" }, 400);
      const { data: before } = await db.from("companies").select("*").eq("id", companyId).maybeSingle();
      const { error: updateError } = await db.from("companies").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", companyId);
      if (updateError) return reply({ error: "Unable to update company" }, 400);
      await db.from("audit_logs").insert({ actor_user_id: user.id, company_id: companyId, action: "company.updated", resource_type: "company", resource_id: companyId, before_data: before, after_data: patch });
      return reply({ success: true });
    }

    if (body.action === "activate-company") {
      if (!hasRole(authz, "platform_owner")) return reply({ error: "Platform owner required" }, 403);
      const { data: before } = await db.from("companies").select("status").eq("id", companyId).maybeSingle();
      if (!before || !["pending", "suspended"].includes(before.status)) return reply({ error: "Company cannot be activated" }, 409);
      const { error: updateError } = await db.from("companies").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", companyId);
      if (updateError) return reply({ error: "Unable to activate company" }, 400);
      await db.from("audit_logs").insert({ actor_user_id: user.id, company_id: companyId, action: "company.activated", resource_type: "company", resource_id: companyId, before_data: before, after_data: { status: "active" }, reason: typeof body.reason === "string" ? body.reason : null });
      return reply({ success: true });
    }

    if (body.action === "suspend-company") {
      if (!hasPermission(authz, "companies.suspend") || !hasRole(authz, "platform_owner", "platform_admin")) return reply({ error: "Platform permission required" }, 403);
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!reason) return reply({ error: "A reason is required" }, 400);
      const { data: before } = await db.from("companies").select("status").eq("id", companyId).maybeSingle();
      if (!before) return reply({ error: "Company not found" }, 404);
      const { error: updateError } = await db.from("companies").update({ status: "suspended", updated_at: new Date().toISOString() }).eq("id", companyId);
      if (updateError) return reply({ error: "Unable to suspend company" }, 400);
      await db.from("audit_logs").insert({ actor_user_id: user.id, company_id: companyId, action: "company.suspended", resource_type: "company", resource_id: companyId, before_data: before, after_data: { status: "suspended" }, reason });
      return reply({ success: true });
    }

    if (body.action === "assign-company-manager") {
      if (!hasRole(authz, "platform_owner") && (!hasRole(authz, "platform_admin") || !hasPermission(authz, "users.change_role"))) return reply({ error: "Platform owner or authorized platform admin required" }, 403);
      const managerId = typeof body.user_id === "string" ? body.user_id : "";
      if (!managerId) return reply({ error: "User is required" }, 400);
      const { data: company } = await db.from("companies").select("id,status").eq("id", companyId).maybeSingle();
      const { data: target } = await db.from("profiles").select("id,is_active,is_banned").eq("id", managerId).maybeSingle();
      if (!company || company.status !== "active" || !target || target.is_active === false || target.is_banned === true) return reply({ error: "Company or target account is unavailable" }, 400);
      const { data: role } = await db.from("roles").select("id").eq("key", "company_manager").single();
      if (!role) return reply({ error: "Company manager role is not configured" }, 503);
      const { data: existing } = await db.from("user_memberships").select("id,status").eq("user_id", managerId).eq("role_id", role.id).eq("company_id", companyId).maybeSingle();
      let membershipId = existing?.id;
      if (existing) {
        const { error: updateError } = await db.from("user_memberships").update({ status: "active", assigned_by: user.id, updated_at: new Date().toISOString() }).eq("id", existing.id);
        if (updateError) return reply({ error: "Unable to assign manager" }, 500);
      } else {
        const { data: created, error: insertError } = await db.from("user_memberships").insert({ user_id: managerId, role_id: role.id, company_id: companyId, status: "active", assigned_by: user.id }).select("id").single();
        if (insertError || !created) return reply({ error: "Unable to assign manager" }, 500);
        membershipId = created.id;
      }
      await db.from("companies").update({ owner_user_id: managerId, updated_at: new Date().toISOString() }).eq("id", companyId);
      await db.from("audit_logs").insert({ actor_user_id: user.id, company_id: companyId, action: "membership.company_manager_assigned", resource_type: "user_membership", resource_id: membershipId, after_data: { user_id: managerId, role: "company_manager" } });
      return reply({ success: true, membership_id: membershipId });
    }

    return reply({ error: "Unknown action" }, 404);
  } catch {
    return reply({ error: "Request could not be completed" }, 500);
  }
});
