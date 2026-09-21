import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing auth header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_banned, is_active, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      return jsonResponse({ error: "Profile not found" }, 404);
    }

    if (profile.is_banned || !profile.is_active) {
      return jsonResponse({ error: "Account suspended or inactive" }, 403);
    }

    const url = new URL(req.url);
    const fullPath = url.pathname;
    const apiIdx = fullPath.indexOf("/merchant-api");
    const path = apiIdx >= 0 ? fullPath.slice(apiIdx + "/merchant-api".length) : fullPath;
    const method = req.method;
    const searchParams = url.searchParams;

    // ── GET /orders — full order details for the merchant ──
    if (path === "/orders" && method === "GET") {
      const statusFilter = searchParams.get("status");
      let query = supabase
        .from("order_items")
        .select("*, order:orders(*), product:products(*)")
        .eq("merchant_id", user.id)
        .order("created_at", { ascending: false });
      if (statusFilter && statusFilter !== "all") {
        query = query.eq("order.status", statusFilter);
      }
      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);

      // Fetch customer profiles
      const orderIds = [...new Set((data || []).map((item: any) => item.order?.id).filter(Boolean))];
      let customerMap: Record<string, any> = {};
      if (orderIds.length > 0) {
        const { data: orders } = await supabase
          .from("orders")
          .select("id, user_id")
          .in("id", orderIds);
        const userIds = [...new Set((orders || []).map((o: any) => o.user_id).filter(Boolean))];
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name, phone")
            .in("id", userIds);
          for (const p of profiles || []) {
            customerMap[p.id] = p;
          }
          const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
          for (const o of orders || []) {
            const au = (authUsers?.users ?? []).find((u: any) => u.id === o.user_id);
            if (au && customerMap[o.user_id]) {
              customerMap[o.user_id].email = au.email ?? "";
            } else if (au) {
              customerMap[o.user_id] = { id: o.user_id, full_name: "", phone: null, email: au.email ?? "" };
            }
          }
        }
      }

      const items = (data || []).map((item: any) => ({
        ...item,
        order: item.order
          ? {
              ...item.order,
              customer: item.order.user_id ? customerMap[item.order.user_id] ?? null : null,
            }
          : null,
      }));

      return jsonResponse({ items });
    }

    // ── POST /orders/:orderId/status — update order status ──
    if (path.match(/^\/orders\/[^/]+\/status$/) && method === "POST") {
      const orderId = path.split("/")[2];
      const body = await req.json();
      const { status, note } = body;

      if (!status) {
        return jsonResponse({ error: "Status is required" }, 400);
      }

      const validStatuses = ["pending", "confirmed", "processing", "shipped", "out_for_delivery", "delivered", "completed", "cancelled", "returned", "refunded"];
      if (!validStatuses.includes(status)) {
        return jsonResponse({ error: "Invalid status" }, 400);
      }

      const { data: result, error: rpcError } = await supabase.rpc("update_order_status", {
        p_order_id: orderId,
        p_new_status: status,
        p_note: note || null,
        p_caller_id: user.id,
      });

      if (rpcError) {
        return jsonResponse({ error: rpcError.message }, 400);
      }

      return jsonResponse({ success: true, status: result });
    }

    // ── GET /orders/:orderId/history — order status history ──
    if (path.match(/^\/orders\/[^/]+\/history$/) && method === "GET") {
      const orderId = path.split("/")[2];

      const { data: history, error } = await supabase
        .from("order_status_history")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);

      // Fetch changer names separately — changed_by references auth.users,
      // not profiles, so PostgREST can't embed it directly via a FK hint.
      const changerIds = [...new Set((history || []).map((h: any) => h.changed_by).filter(Boolean))];
      let changerMap: Record<string, any> = {};
      if (changerIds.length > 0) {
        const { data: changerProfiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", changerIds);
        for (const p of changerProfiles || []) {
          changerMap[p.id] = p;
        }
      }

      const enriched = (history || []).map((h: any) => ({
        ...h,
        changer: h.changed_by ? changerMap[h.changed_by] ?? null : null,
      }));

      return jsonResponse({ history: enriched });
    }

    // ── GET /export/orders — CSV export of merchant orders ──
    if (path === "/export/orders" && method === "GET") {
      const { data, error } = await supabase
        .from("order_items")
        .select("*, order:orders(*), product:products(*)")
        .eq("merchant_id", user.id)
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);

      const csvRows: string[] = [];
      csvRows.push("Order Number,Date,Status,Customer Name,Product Name,Quantity,Unit Price,Subtotal,Merchant Earnings,Payment Status,Payment Method,Tracking Number,Customer Phone");

      for (const item of data || []) {
        const o = item.order;
        if (!o) continue;
        const customerName = (o as any).customer_name || "";
        const customerPhone = (o as any).customer_phone || "";
        const row = [
          escapeCsv(o.order_number || ""),
          escapeCsv(new Date(o.created_at).toLocaleDateString()),
          escapeCsv(o.status || ""),
          escapeCsv(customerName),
          escapeCsv(item.product_name || ""),
          String(item.quantity || 0),
          String(item.unit_price || 0),
          String(item.subtotal || 0),
          String(item.merchant_earnings || 0),
          escapeCsv(o.payment_status || ""),
          escapeCsv(o.payment_method || ""),
          escapeCsv(o.tracking_number || ""),
          escapeCsv(customerPhone),
        ];
        csvRows.push(row.join(","));
      }

      const csv = csvRows.join("\n");
      return new Response(csv, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="merchant-orders-${Date.now()}.csv"` },
      });
    }

    // ── GET /export/products — CSV export of merchant products ──
    if (path === "/export/products" && method === "GET") {
      const { data: products, error } = await supabase
        .from("products")
        .select("*, category:categories(name), images:product_images(image_url, sort_order)")
        .eq("merchant_id", user.id)
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);

      const csvRows: string[] = [];
      csvRows.push("Name,Price,Category,Status,Rating,Review Count,Created At,Image URL");

      for (const p of products || []) {
        const imageUrl = (p as any).images?.[0]?.image_url || "";
        const row = [
          escapeCsv(p.name || ""),
          String(p.price || 0),
          escapeCsv((p as any).category?.name || ""),
          escapeCsv(p.status || ""),
          String(p.rating || 0),
          String(p.review_count || 0),
          escapeCsv(new Date(p.created_at).toLocaleDateString()),
          escapeCsv(imageUrl),
        ];
        csvRows.push(row.join(","));
      }

      const csv = csvRows.join("\n");
      return new Response(csv, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="merchant-products-${Date.now()}.csv"` },
      });
    }

    // ── GET /export/earnings — CSV export of merchant earnings ──
    if (path === "/export/earnings" && method === "GET") {
      const { data: wallet, error: wErr } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (wErr) return jsonResponse({ error: wErr.message }, 500);

      const { data: txns, error: tErr } = await supabase
        .from("wallet_transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (tErr) return jsonResponse({ error: tErr.message }, 500);

      const csvRows: string[] = [];
      csvRows.push("Wallet Summary,,,,,");
      csvRows.push(`Available Balance,${wallet?.available_balance ?? 0}`);
      csvRows.push(`Pending Balance,${wallet?.pending_balance ?? 0}`);
      csvRows.push(`Total Earned,${wallet?.total_earned ?? 0}`);
      csvRows.push(`Total Withdrawn,${wallet?.total_withdrawn ?? 0}`);
      csvRows.push("");
      csvRows.push("Transactions,,,,,");
      csvRows.push("Date,Type,Amount,Description,Status,Order ID");

      for (const t of txns || []) {
        const row = [
          escapeCsv(new Date(t.created_at).toLocaleDateString()),
          escapeCsv(t.type || ""),
          String(t.amount || 0),
          escapeCsv(t.description || ""),
          escapeCsv(t.status || ""),
          escapeCsv(t.order_id || ""),
        ];
        csvRows.push(row.join(","));
      }

      const csv = csvRows.join("\n");
      return new Response(csv, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="merchant-earnings-${Date.now()}.csv"` },
      });
    }

    return jsonResponse({ error: "Not found" }, 404);
  } catch (err) {
    return jsonResponse({ error: (err as Error)?.message || "Internal server error" }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeCsv(value: string): string {
  if (!value) return "";
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
