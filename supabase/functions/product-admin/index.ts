import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { hasPermission, loadActorAuthorization } from "../_shared/authorization.ts";

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
    const actor = await loadActorAuthorization(db, user.id);
    if (!actor?.accountActive) return reply({ error: "Account is inactive or unauthorized" }, 403);
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.action !== "string" || typeof body.product_id !== "string") return reply({ error: "Product and action are required" }, 400);
    const { data: product } = await db.from("products").select("id,company_id,status,approval_status,rejection_reason,merchant_id,name").eq("id", body.product_id).maybeSingle();
    if (!product || !product.company_id) return reply({ error: "Product not found" }, 404);
    const actions: Record<string, { permission: string; update: Record<string, unknown> }> = {
      "approve-product": { permission: "products.approve", update: { approval_status: "approved", rejection_reason: null, approved_by: user.id, approved_at: new Date().toISOString() } },
      "reject-product": { permission: "products.reject", update: { approval_status: "rejected", status: "inactive", rejection_reason: typeof body.reason === "string" ? body.reason.trim() : "" } },
      "archive-product": { permission: "products.archive", update: { status: "archived" } },
    };
    const operation = actions[body.action];
    if (!operation) return reply({ error: "Unknown action" }, 404);
    if (!hasPermission(actor, operation.permission, product.company_id)) return reply({ error: "Permission denied" }, 403);
    if (body.action === "reject-product" && !(operation.update.rejection_reason as string)) return reply({ error: "A rejection reason is required" }, 400);
    if (body.action === "approve-product" && product.approval_status !== "pending_approval") return reply({ error: "Only pending products may be approved" }, 409);
    if (body.action === "approve-product") {
      const { data: subscription } = await db.from("subscriptions").select("id").eq("company_id", product.company_id)
        .in("status", ["trialing", "active"]).or(`current_period_end.is.null,current_period_end.gt.${new Date().toISOString()}`).limit(1).maybeSingle();
      if (!subscription) return reply({ error: "An active subscription is required before publishing" }, 409);
      const { data: company } = await db.from("companies").select("status").eq("id", product.company_id).maybeSingle();
      if (company?.status !== "active") return reply({ error: "Company is not active" }, 409);
    }
    const { error: updateError } = await db.from("products").update(operation.update).eq("id", product.id).eq("company_id", product.company_id);
    if (updateError) return reply({ error: "Unable to apply product operation" }, 400);
    await db.from("audit_logs").insert({ actor_user_id: user.id, company_id: product.company_id, action: `product.${body.action}`, resource_type: "product", resource_id: product.id, before_data: { status: product.status, approval_status: product.approval_status }, after_data: operation.update, reason: typeof body.reason === "string" ? body.reason : null });
    return reply({ success: true, product_id: product.id });
  } catch {
    return reply({ error: "Request could not be completed" }, 500);
  }
});
