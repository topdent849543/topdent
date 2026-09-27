import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { hasPermission, hasRole, loadActorAuthorization } from "../_shared/authorization.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Driver = { id: string; user_id: string; driver_type: "global" | "company"; company_id: string | null; status: string };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !serviceKey || !anonKey) return reply({ error: "Server configuration unavailable" }, 503);
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const bearer = req.headers.get("Authorization");
    if (!bearer?.startsWith("Bearer ")) return reply({ error: "Authentication required" }, 401);
    const token = bearer.slice(7);
    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user) return reply({ error: "Unauthorized" }, 401);
    const authz = await loadActorAuthorization(db, user.id);
    if (!authz?.accountActive || !hasRole(authz, "global_driver", "company_driver")) return reply({ error: "Active driver membership required" }, 403);
    const { data: driver, error: driverError } = await db.from("drivers").select("id,user_id,driver_type,company_id,status").eq("user_id", user.id).maybeSingle() as { data: Driver | null; error: unknown };
    if (driverError || !driver || driver.status !== "active") return reply({ error: "Active driver profile required" }, 403);
    if ((driver.driver_type === "company" && !hasRole(authz, "company_driver")) || (driver.driver_type === "global" && !hasRole(authz, "global_driver"))) return reply({ error: "Driver type does not match membership" }, 403);
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.action !== "string") return reply({ error: "Action is required" }, 400);
    const userDb = createClient(url, anonKey, { global: { headers: { Authorization: bearer } }, auth: { persistSession: false, autoRefreshToken: false } });

    if (body.action === "available-orders") {
      if (!hasPermission(authz, "drivers.accept_orders", driver.company_id)) return reply({ error: "Permission denied" }, 403);
      let query = db.from("company_order_fulfillments").select("order_id,company_id,status,delivery_type,delivery_fee,delivery_slot,assigned_driver_id")
        .eq("status", "waiting_for_driver").order("updated_at", { ascending: true }).limit(100);
      if (driver.driver_type === "company" && driver.company_id) query = query.eq("company_id", driver.company_id);
      const { data: fulfillments, error } = await query;
      if (error) return reply({ error: "Unable to load available orders" }, 500);
      const eligible = (fulfillments ?? []).filter((row: { assigned_driver_id: string | null }) => !row.assigned_driver_id || row.assigned_driver_id === driver.id);
      const orderIds = eligible.map((row: { order_id: string }) => row.order_id);
      const companyIds = [...new Set(eligible.map((row: { company_id: string }) => row.company_id))];
      const [{ data: orders }, { data: companies }] = await Promise.all([
        orderIds.length ? db.from("orders").select("id,order_number,created_at").in("id", orderIds) : Promise.resolve({ data: [] }),
        companyIds.length ? db.from("companies").select("id,name").in("id", companyIds) : Promise.resolve({ data: [] }),
      ]);
      const orderById = new Map((orders ?? []).map((row: { id: string }) => [row.id, row]));
      const companyById = new Map((companies ?? []).map((row: { id: string }) => [row.id, row]));
      return reply({ orders: eligible.map((row: { order_id: string; company_id: string; status: string; delivery_type: string | null; delivery_fee: number | null; delivery_slot: string | null }) => ({
        ...row, order: orderById.get(row.order_id) ?? null, company: companyById.get(row.company_id) ?? null,
      })) });
    }

    if (body.action === "my-orders") {
      const { data: assignments, error } = await db.from("order_driver_assignments")
        .select("id,order_id,company_id,accepted_at,started_at,arrived_at,delivered_at,collection_status,problem_type,problem_note")
        .eq("driver_id", driver.id).order("created_at", { ascending: false }).limit(100);
      if (error) return reply({ error: "Unable to load assigned orders" }, 500);
      const orderIds = [...new Set((assignments ?? []).map((row: { order_id: string }) => row.order_id))];
      const { data: orders } = orderIds.length ? await db.from("orders").select("id,order_number,status,shipping_address,customer_name,customer_phone,delivery_slot").in("id", orderIds) : { data: [] };
      const orderById = new Map((orders ?? []).map((row: { id: string }) => [row.id, row]));
      return reply({ assignments: (assignments ?? []).map((row: { order_id: string }) => ({ ...row, order: orderById.get(row.order_id) ?? null })) });
    }

    const orderId = typeof body.order_id === "string" ? body.order_id : "";
    const companyId = typeof body.company_id === "string" ? body.company_id : "";
    if (!orderId || !companyId) return reply({ error: "Order and company are required" }, 400);
    if (driver.driver_type === "company" && driver.company_id !== companyId) return reply({ error: "Company scope denied" }, 403);

    if (body.action === "accept-order") {
      if (!hasPermission(authz, "drivers.accept_orders", companyId)) return reply({ error: "Permission denied" }, 403);
      const { data, error } = await userDb.rpc("accept_company_fulfillment_order", { p_order_id: orderId, p_company_id: companyId });
      if (error) return reply({ error: "Order is unavailable or already assigned" }, 409);
      return reply({ success: true, assignment_id: data });
    }

    if (body.action === "confirm-collection") {
      if (!hasPermission(authz, "drivers.confirm_collection", companyId)) return reply({ error: "Permission denied" }, 403);
      const assignmentId = typeof body.assignment_id === "string" ? body.assignment_id : "";
      const status = body.status === "collected" ? "collected" : body.status === "not_collected" ? "not_collected" : "";
      const note = typeof body.note === "string" ? body.note.trim() : null;
      if (!assignmentId || !status || (status === "not_collected" && !note)) return reply({ error: "Valid collection status and reason are required" }, 400);
      const { error } = await userDb.rpc("record_driver_collection", { p_assignment_id: assignmentId, p_status: status, p_note: note });
      if (error) return reply({ error: "Collection could not be recorded" }, 409);
      return reply({ success: true });
    }

    const transitionActions: Record<string, { status: string; permission: string }> = {
      "start-delivery": { status: "out_for_delivery", permission: "drivers.accept_orders" },
      "mark-arrived": { status: "arrived", permission: "drivers.confirm_delivery" },
      "confirm-delivery": { status: "delivered", permission: "drivers.confirm_delivery" },
      "report-problem": { status: "delivery_failed", permission: "drivers.report_problem" },
    };
    const transition = transitionActions[body.action];
    if (!transition) return reply({ error: "Unknown action" }, 404);
    if (!hasPermission(authz, transition.permission, companyId)) return reply({ error: "Permission denied" }, 403);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (body.action === "report-problem" && !reason) return reply({ error: "A problem reason is required" }, 400);
    const { data, error } = await userDb.rpc("transition_company_fulfillment", {
      p_order_id: orderId, p_company_id: companyId, p_next_status: transition.status, p_reason: reason || null,
    });
    if (error) return reply({ error: "Delivery status transition rejected" }, 409);
    if (body.action === "report-problem") {
      const { data: assignment } = await db.from("order_driver_assignments").select("id")
        .eq("order_id", orderId).eq("company_id", companyId).eq("driver_id", driver.id).maybeSingle();
      if (assignment) await db.from("order_driver_assignments").update({ problem_type: typeof body.problem_type === "string" ? body.problem_type.slice(0, 80) : "other", problem_note: reason, updated_at: new Date().toISOString() }).eq("id", assignment.id);
    }
    return reply({ success: true, status: data });
  } catch {
    return reply({ error: "Request could not be completed" }, 500);
  }
});
