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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !serviceKey || !anonKey) return reply({ error: "Server configuration unavailable" }, 503);
    const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const bearer = req.headers.get("Authorization");
    if (!bearer?.startsWith("Bearer ")) return reply({ error: "Authentication required" }, 401);
    const token = bearer.slice(7);
    const { data: { user }, error } = await service.auth.getUser(token);
    if (error || !user) return reply({ error: "Unauthorized" }, 401);
    const actor = await loadActorAuthorization(service, user.id);
    if (!actor?.accountActive) return reply({ error: "Account is inactive or unauthorized" }, 403);
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.action !== "string" || typeof body.company_id !== "string" || (body.action !== "eligible-drivers" && typeof body.order_id !== "string")) return reply({ error: "Action, order, and company are required" }, 400);
    const companyId = body.company_id;
    const orderId = typeof body.order_id === "string" ? body.order_id : "";
    const userDb = createClient(url, anonKey, { global: { headers: { Authorization: bearer } }, auth: { persistSession: false, autoRefreshToken: false } });

    if (body.action === "eligible-drivers") {
      if (!hasPermission(actor, "drivers.assign_orders", companyId)) return reply({ error: "Permission denied" }, 403);
      const { data: drivers, error: driverError } = await service.from("drivers").select("id,driver_type,company_id,vehicle_type,vehicle_plate,status")
        .eq("status", "active").or(`driver_type.eq.global,company_id.eq.${companyId}`);
      if (driverError) return reply({ error: "Unable to load eligible drivers" }, 500);
      return reply({ drivers: drivers ?? [] });
    }

    if (body.action === "assign-driver") {
      if (typeof body.driver_id !== "string") return reply({ error: "Driver is required" }, 400);
      if (!hasPermission(actor, "drivers.assign_orders", companyId)) return reply({ error: "Permission denied" }, 403);
      const { data, error: rpcError } = await userDb.rpc("assign_company_order_driver", { p_order_id: orderId, p_company_id: companyId, p_driver_id: body.driver_id });
      if (rpcError) return reply({ error: "Unable to assign driver" }, 409);
      return reply({ success: true, assignment_id: data });
    }

    const transitions: Record<string, { status: string; permission: string; requiresReason?: boolean }> = {
      "review-order": { status: "under_review", permission: "orders.review" },
      "approve-order": { status: "approved", permission: "orders.approve" },
      "reject-order": { status: "rejected", permission: "orders.reject", requiresReason: true },
      "confirm-final-review": { status: typeof body.status === "string" ? body.status : "final_review", permission: "orders.review" },
    };
    let transition = transitions[body.action];
    if (body.action === "transition-order") {
      const nextStatus = typeof body.next_status === "string" ? body.next_status : "";
      const permissionByStatus: Record<string, string> = {
        under_review: "orders.review", approved: "orders.approve", rejected: "orders.reject", cancelled: "orders.cancel",
        preparing: "orders.prepare", ready_for_delivery: "orders.mark_ready", waiting_for_driver: "orders.assign_driver",
        final_review: "orders.review", completed: "orders.approve", archived: "orders.archive",
      };
      if (!permissionByStatus[nextStatus]) return reply({ error: "Transition is not supported by this operation" }, 400);
      transition = { status: nextStatus, permission: permissionByStatus[nextStatus], requiresReason: ["rejected", "cancelled"].includes(nextStatus) };
    }
    if (!transition) return reply({ error: "Unknown action" }, 404);
    if (!hasPermission(actor, transition.permission, companyId)) return reply({ error: "Permission denied" }, 403);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (transition.requiresReason && !reason) return reply({ error: "A reason is required" }, 400);
    const { data, error: rpcError } = await userDb.rpc("transition_company_fulfillment", {
      p_order_id: orderId, p_company_id: companyId, p_next_status: transition.status, p_reason: reason || null,
    });
    if (rpcError) return reply({ error: "Order transition rejected" }, 409);
    return reply({ success: true, status: data });
  } catch {
    return reply({ error: "Request could not be completed" }, 500);
  }
});
