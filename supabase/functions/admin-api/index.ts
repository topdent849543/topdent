import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { adminApiPermissions, hasPermission, loadActorAuthorization } from "../_shared/authorization.ts";

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

    const url = new URL(req.url);
    const fullPath = url.pathname;
    const adminApiIndex = fullPath.indexOf("/admin-api");
    const path = adminApiIndex >= 0 ? fullPath.slice(adminApiIndex + "/admin-api".length) : fullPath;
    const method = req.method;
    const searchParams = url.searchParams;
    const authorization = await loadActorAuthorization(supabase, user.id);
    const requiredPermissions = adminApiPermissions(path, method);
    if (!authorization || !authorization.accountActive || !requiredPermissions ||
        !requiredPermissions.every((permission) => hasPermission(authorization, permission))) {
      return jsonResponse({ error: "Permission denied" }, 403);
    }

    // ── GET /stats ──────────────────────────────────────────────
    if (path === "/stats" && method === "GET") {
      const canViewFinance = hasPermission(authorization, "finance.view");
      const [productsResult, ordersResult, usersResult, walletsResult, withdrawalsResult, categoriesResult, featuredResult, variantsResult, companiesResult, pendingProductsResult] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }),
        canViewFinance
          ? supabase.from("orders").select("id,total,status,created_at,collection_status", { count: "exact" })
          : supabase.from("orders").select("id,status,created_at,collection_status", { count: "exact" }),
        supabase.from("profiles").select("id,role,is_banned,is_active", { count: "exact" }),
        canViewFinance ? supabase.from("wallets").select("available_balance,total_earned") : Promise.resolve({ data: [] }),
        canViewFinance ? supabase.from("withdrawal_requests").select("amount,status") : Promise.resolve({ data: [] }),
        supabase.from("categories").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("is_featured", true),
        supabase.from("product_variants").select("product_id,stock"),
        supabase.from("companies").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("approval_status", "pending_approval"),
      ]);

      const orderRows = ((ordersResult.data ?? []) as unknown) as Array<{ status: string; created_at: string; total?: string | number; collection_status?: string }>;
      const totalRevenue = orderRows
        .filter((o: any) => o.status !== "cancelled")
        .reduce((sum: number, o: any) => sum + parseFloat(o.total || "0"), 0);

      const pendingWithdrawals = (withdrawalsResult.data || [])
        .filter((w: any) => w.status === "pending")
        .reduce((sum: number, w: any) => sum + parseFloat(w.amount || "0"), 0);

      const totalPaidOut = (withdrawalsResult.data || [])
        .filter((w: any) => w.status === "approved" || w.status === "paid")
        .reduce((sum: number, w: any) => sum + parseFloat(w.amount || "0"), 0);

      const totalWalletBalance = (walletsResult.data || [])
        .reduce((sum: number, w: any) => sum + parseFloat(w.available_balance || "0"), 0);

      const totalMerchantEarnings = (walletsResult.data || [])
        .reduce((sum: number, w: any) => sum + parseFloat(w.total_earned || "0"), 0);
      const uncollectedAmount = canViewFinance ? orderRows
        .filter((o) => o.collection_status === "pending" && o.status !== "cancelled")
        .reduce((sum, o) => sum + parseFloat(String(o.total || "0")), 0) : null;

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentOrders = orderRows.filter(
        (o: any) => new Date(o.created_at) >= sevenDaysAgo
      );
      const recentRevenue = recentOrders
        .filter((o: any) => o.status !== "cancelled")
        .reduce((sum: number, o: any) => sum + parseFloat(o.total || "0"), 0);

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const todayOrders = orderRows.filter(
        (o: any) => new Date(o.created_at) >= startOfToday
      );
      const todayRevenue = todayOrders
        .filter((o: any) => o.status !== "cancelled")
        .reduce((sum: number, o: any) => sum + parseFloat(o.total || "0"), 0);

      const nonCancelledOrders = orderRows.filter((o) => o.status !== "cancelled");
      const avgOrderValue = nonCancelledOrders.length > 0 ? totalRevenue / nonCancelledOrders.length : 0;

      const ordersByStatus: Record<string, number> = {};
      for (const o of orderRows) {
        ordersByStatus[o.status] = (ordersByStatus[o.status] || 0) + 1;
      }

      // Stock aggregation per product to compute low-stock / out-of-stock counts
      const stockByProduct: Record<string, number> = {};
      for (const v of variantsResult.data || []) {
        stockByProduct[v.product_id] = (stockByProduct[v.product_id] || 0) + (v.stock || 0);
      }
      const stockValues = Object.values(stockByProduct);
      const outOfStockCount = stockValues.filter((s) => s <= 0).length;
      const lowStockCount = stockValues.filter((s) => s > 0 && s <= 5).length;

      const allUsers = usersResult.data || [];
      const stats = {
        totalUsers: usersResult.count || 0,
        totalOrders: ordersResult.count || 0,
        totalProducts: productsResult.count || 0,
        totalCompanies: companiesResult.count || 0,
        pendingProducts: pendingProductsResult.count || 0,
        totalRevenue: canViewFinance ? totalRevenue.toFixed(2) : null,
        pendingWithdrawals: canViewFinance ? pendingWithdrawals.toFixed(2) : null,
        totalPaidOut: canViewFinance ? totalPaidOut.toFixed(2) : null,
        totalWalletBalance: canViewFinance ? totalWalletBalance.toFixed(2) : null,
        totalMerchantEarnings: canViewFinance ? totalMerchantEarnings.toFixed(2) : null,
        uncollectedAmount: uncollectedAmount === null ? null : uncollectedAmount.toFixed(2),
        recentRevenue: canViewFinance ? recentRevenue.toFixed(2) : null,
        recentOrdersCount: recentOrders.length,
        todayRevenue: canViewFinance ? todayRevenue.toFixed(2) : null,
        todayOrdersCount: todayOrders.length,
        avgOrderValue: canViewFinance ? avgOrderValue.toFixed(2) : null,
        ordersByStatus,
        merchants: allUsers.filter((u: any) => u.role === "merchant").length,
        publishers: allUsers.filter((u: any) => u.role === "publisher").length,
        customers: allUsers.filter((u: any) => u.role === "customer").length,
        admins: allUsers.filter((u: any) => u.role === "admin").length,
        bannedUsers: allUsers.filter((u: any) => u.is_banned).length,
        inactiveUsers: allUsers.filter((u: any) => !u.is_active).length,
        totalCategories: categoriesResult.count || 0,
        featuredProductsCount: featuredResult.count || 0,
        outOfStockCount,
        lowStockCount,
      };
      return jsonResponse({ stats });
    }

    // ── GET /users ──────────────────────────────────────────────
    if (path === "/users" && method === "GET") {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);

      const userIds = (profiles || []).map((p: any) => p.id);
      let emailMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        for (const u of authUsers?.users ?? []) {
          emailMap[u.id] = u.email ?? "";
        }
      }

      const users = (profiles || []).map((p: any) => ({ ...p, email: emailMap[p.id] ?? "" }));
      return jsonResponse({ users });
    }

    // ── POST /users/create-merchant ──────────────────────────────
    if (path === "/users/create-merchant" && method === "POST") {
      const body = await req.json();
      const { email, password, full_name, role } = body;

      if (!email || !password || !role) {
        return jsonResponse({ error: "Email, password, and role are required" }, 400);
      }

      const validRoles = ["merchant", "publisher", "admin"];
      if (!validRoles.includes(role)) {
        return jsonResponse({ error: "Invalid role for creation" }, 400);
      }

      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name || email.split("@")[0], role },
      });

      if (createError || !newUser?.user) {
        return jsonResponse({ error: createError?.message || "Failed to create user" }, 500);
      }

      await supabase
        .from("profiles")
        .update({ role, full_name: full_name || email.split("@")[0] })
        .eq("id", newUser.user.id);

      if (role === "merchant" || role === "publisher") {
        await supabase.from("wallets").upsert({ user_id: newUser.user.id });
      }

      return jsonResponse({ success: true, user_id: newUser.user.id });
    }

    // ── PUT /users/:id/role ──────────────────────────────────────
    if (path.match(/^\/users\/[^/]+\/role$/) && method === "PUT") {
      const userId = path.split("/")[2];
      const body = await req.json();
      const { role } = body;

      if (!role) return jsonResponse({ error: "Role required" }, 400);

      const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
      if (error) return jsonResponse({ error: error.message }, 500);

      if (role === "merchant" || role === "publisher") {
        await supabase.from("wallets").upsert({ user_id: userId });
      }

      return jsonResponse({ success: true });
    }

    // ── PUT /users/:id/ban ───────────────────────────────────────
    if (path.match(/^\/users\/[^/]+\/ban$/) && method === "PUT") {
      const userId = path.split("/")[2];
      const body = await req.json();
      const { is_banned } = body;

      const { error } = await supabase.from("profiles").update({ is_banned: !!is_banned }).eq("id", userId);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── PUT /users/:id/active ────────────────────────────────────
    // (frontend calls /active; older code had /status — support both)
    if (path.match(/^\/users\/[^/]+\/(active|status)$/) && method === "PUT") {
      const userId = path.split("/")[2];
      const body = await req.json();
      const { is_active } = body;

      const { error } = await supabase.from("profiles").update({ is_active: !!is_active }).eq("id", userId);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── DELETE /users/:id ────────────────────────────────────────
    if (path.match(/^\/users\/[^/]+$/) && method === "DELETE") {
      const userId = path.split("/")[2];
      const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
      if (deleteError) return jsonResponse({ error: deleteError.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── GET /restrictions/:id ────────────────────────────────────
    if (path.match(/^\/restrictions\/[^/]+$/) && method === "GET") {
      const merchantId = path.split("/")[2];
      const { data, error } = await supabase
        .from("merchant_restrictions")
        .select("*")
        .eq("merchant_id", merchantId)
        .maybeSingle();
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ restrictions: data || null });
    }

    // ── PUT /restrictions/:id ─────────────────────────────────────
    if (path.match(/^\/restrictions\/[^/]+$/) && method === "PUT") {
      const merchantId = path.split("/")[2];
      const body = await req.json();

      const { error } = await supabase.from("merchant_restrictions").upsert({
        merchant_id: merchantId,
        can_upload_products: body.can_upload_products,
        can_upload_reels: body.can_upload_reels,
        can_edit_products: body.can_edit_products,
        can_delete_products: body.can_delete_products,
        restricted_notes: body.restricted_notes,
        updated_at: new Date().toISOString(),
      });
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── GET /products ────────────────────────────────────────────
    if (path === "/products" && method === "GET") {
      // ملاحظة: لا نعتمد على العلاقات المضمّنة (embed) مع profiles لأن كاش المخطط
      // قد لا يحتوي على المفتاح الأجنبي فيظهر خطأ:
      // "Could not find a relationship between 'products' and 'profiles'".
      // لذلك نجلب البيانات ونربطها يدوياً — طريقة مضمونة دائماً.
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);

      const rows = data || [];
      const productIds = rows.map((p: any) => p.id);

      const categoryIds = [...new Set(rows.map((p: any) => p.category_id).filter(Boolean))];
      const categoryMap: Record<string, string> = {};
      if (categoryIds.length > 0) {
        const { data: cats } = await supabase
          .from("categories")
          .select("id, name")
          .in("id", categoryIds);
        for (const c of cats || []) categoryMap[c.id] = c.name;
      }

      const imageMap: Record<string, string | null> = {};
      if (productIds.length > 0) {
        const { data: images } = await supabase
          .from("product_images")
          .select("product_id, image_url, sort_order")
          .in("product_id", productIds)
          .order("sort_order", { ascending: true });
        for (const img of images || []) {
          if (!imageMap[img.product_id]) imageMap[img.product_id] = img.image_url;
        }
      }

      const stockMap: Record<string, number> = {};
      if (productIds.length > 0) {
        const { data: variants } = await supabase
          .from("product_variants")
          .select("product_id, stock")
          .in("product_id", productIds);
        for (const v of variants || []) {
          stockMap[v.product_id] = (stockMap[v.product_id] || 0) + (v.stock || 0);
        }
      }

      const merchantIds = [...new Set(rows.map((p: any) => p.merchant_id).filter(Boolean))];
      const merchantMap: Record<string, { id: string; full_name: string; email: string; phone: string | null }> = {};
      if (merchantIds.length > 0) {
        const { data: merchantProfiles } = await supabase
          .from("profiles")
          .select("id, full_name, phone")
          .in("id", merchantIds);
        for (const m of merchantProfiles || []) {
          merchantMap[m.id] = { id: m.id, full_name: m.full_name || "", email: "", phone: m.phone ?? null };
        }
        const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        for (const u of authUsers?.users ?? []) {
          if (merchantMap[u.id]) merchantMap[u.id].email = u.email ?? "";
        }
        for (const id of merchantIds) {
          if (!merchantMap[id]) merchantMap[id] = { id, full_name: "", email: "", phone: null };
        }
      }

      const products = rows.map((p: any) => ({
        id: p.id,
        name: p.name,
        slug: p.slug || null,
        description: p.description || "",
        price: String(p.price),
        compare_at_price: p.compare_at_price != null ? String(p.compare_at_price) : null,
        category: p.category_id || "",
        category_id: p.category_id || null,
        category_name: categoryMap[p.category_id] || "",
        status: p.status || "active",
        is_featured: !!p.is_featured,
        is_new: !!p.is_new,
        sku: p.sku || "",
        rating: p.rating != null ? Number(p.rating) : 0,
        review_count: p.review_count || 0,
        image_url: imageMap[p.id] || null,
        stock: stockMap[p.id] || 0,
        merchant_id: p.merchant_id,
        created_at: p.created_at,
        merchant: p.merchant_id ? merchantMap[p.merchant_id] ?? null : null,
      }));

      const merchants = Object.values(merchantMap).sort((a, b) =>
        (a.full_name || a.email).localeCompare(b.full_name || b.email, "ar")
      );
      const categories = Object.entries(categoryMap).map(([id, name]) => ({ id, name }));

      return jsonResponse({ products, merchants, categories });
    }

    // ── PATCH /products/:id — edit product (price, status, featured, category…) ──
    if (path.match(/^\/products\/[^/]+$/) && method === "PATCH") {
      const productId = path.split("/")[2];
      const body = await req.json();

      const updates: Record<string, unknown> = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.price !== undefined) updates.price = body.price;
      if (body.compare_at_price !== undefined) updates.compare_at_price = body.compare_at_price;
      if (body.category_id !== undefined) updates.category_id = body.category_id || null;
      if (body.status !== undefined) {
        if (!["active", "draft", "archived"].includes(body.status)) {
          return jsonResponse({ error: "Invalid status" }, 400);
        }
        updates.status = body.status;
      }
      if (body.is_featured !== undefined) updates.is_featured = !!body.is_featured;
      if (body.is_new !== undefined) updates.is_new = !!body.is_new;
      updates.updated_at = new Date().toISOString();

      if (Object.keys(updates).length === 0) {
        return jsonResponse({ error: "No fields to update" }, 400);
      }

      const { error } = await supabase.from("products").update(updates).eq("id", productId);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── DELETE /products/:id ─────────────────────────────────────
    if (path.match(/^\/products\/[^/]+$/) && method === "DELETE") {
      const productId = path.split("/")[2];

      // Delete related images and variants first
      await supabase.from("product_images").delete().eq("product_id", productId);
      await supabase.from("product_variants").delete().eq("product_id", productId);
      await supabase.from("cart_items").delete().eq("product_id", productId);
      await supabase.from("wishlist_items").delete().eq("product_id", productId);

      const { error } = await supabase.from("products").delete().eq("id", productId);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── POST /products/bulk-delete — delete multiple products at once ──
    if (path === "/products/bulk-delete" && method === "POST") {
      const body = await req.json();
      const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
      if (ids.length === 0) return jsonResponse({ error: "No product ids provided" }, 400);

      await supabase.from("product_images").delete().in("product_id", ids);
      await supabase.from("product_variants").delete().in("product_id", ids);
      await supabase.from("cart_items").delete().in("product_id", ids);
      await supabase.from("wishlist_items").delete().in("product_id", ids);

      const { error } = await supabase.from("products").delete().in("id", ids);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, deleted: ids.length });
    }

    // ── GET /orders ─────────────────────────────────────────────
    if (path === "/orders" && method === "GET") {
      const statusFilter = searchParams.get("status");
      let query = supabase
        .from("orders")
        .select("*, items:order_items(*)", { count: "exact" })
        .order("created_at", { ascending: false });
      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);

      const rows = data || [];

      const userIds = [...new Set(rows.map((o: any) => o.user_id).filter(Boolean))];
      const profileMap: Record<string, { full_name: string; phone: string | null; email: string }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, phone")
          .in("id", userIds);
        for (const pr of profiles || []) {
          profileMap[pr.id] = { full_name: pr.full_name || "", phone: pr.phone ?? null, email: "" };
        }
        const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        for (const u of authUsers?.users ?? []) {
          if (profileMap[u.id]) profileMap[u.id].email = u.email ?? "";
        }
      }

      const orderProductIds = [
        ...new Set(rows.flatMap((o: any) => (o.items || []).map((i: any) => i.product_id)).filter(Boolean)),
      ];
      const productMerchant: Record<string, string> = {};
      if (orderProductIds.length > 0) {
        const { data: prods } = await supabase
          .from("products")
          .select("id, merchant_id")
          .in("id", orderProductIds);
        for (const pr of prods || []) if (pr.merchant_id) productMerchant[pr.id] = pr.merchant_id;
      }
      const orderMerchantIds = [...new Set(Object.values(productMerchant))];
      const merchantNames: Record<string, string> = {};
      if (orderMerchantIds.length > 0) {
        const { data: ms } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", orderMerchantIds);
        for (const m of ms || []) merchantNames[m.id] = m.full_name || "";
      }

      const orders = rows.map((o: any) => {
        const merchantIdsForOrder = [
          ...new Set((o.items || []).map((i: any) => productMerchant[i.product_id]).filter(Boolean)),
        ] as string[];
        return {
          id: o.id,
          user_id: o.user_id,
          order_number: o.order_number || null,
          total: String(o.total),
          subtotal: o.subtotal != null ? String(o.subtotal) : null,
          status: o.status,
          payment_status: o.payment_status || null,
          payment_method: o.payment_method || null,
          tracking_number: o.tracking_number || null,
          carrier: o.carrier || null,
          created_at: o.created_at,
          affiliate_code: o.affiliate_code || null,
          affiliate_user_id: o.affiliate_user_id || null,
          profile: o.user_id ? profileMap[o.user_id] ?? null : null,
          items: o.items || [],
          merchant_ids: merchantIdsForOrder,
          merchant_names: merchantIdsForOrder.map((id: string) => merchantNames[id] || ""),
        };
      });

      const merchants = Object.entries(merchantNames)
        .map(([id, full_name]) => ({ id, full_name }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name, "ar"));

      return jsonResponse({ orders, count: rows.length, merchants });
    }


    // ── GET /chats — كل المحادثات مع بيانات كاملة (للأدمن) ──────
    if (path === "/chats" && method === "GET") {
      const { data, error } = await supabase
        .from("chats")
        .select("*")
        .order("last_message_at", { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);

      const rows = data || [];
      const userIds = [
        ...new Set(rows.flatMap((c: any) => [c.customer_id, c.merchant_id]).filter(Boolean)),
      ];
      const productIds = [...new Set(rows.map((c: any) => c.product_id).filter(Boolean))];

      const peopleMap: Record<string, { id: string; full_name: string; phone: string | null; email: string }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, phone")
          .in("id", userIds);
        for (const p of profiles || []) {
          peopleMap[p.id] = { id: p.id, full_name: p.full_name || "", phone: p.phone ?? null, email: "" };
        }
        const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        for (const u of authUsers?.users ?? []) {
          if (peopleMap[u.id]) peopleMap[u.id].email = u.email ?? "";
        }
      }

      const productMap: Record<string, { id: string; name: string; slug: string | null; price: string }> = {};
      if (productIds.length > 0) {
        const { data: prods } = await supabase
          .from("products")
          .select("id, name, slug, price")
          .in("id", productIds);
        for (const p of prods || []) {
          productMap[p.id] = { id: p.id, name: p.name, slug: p.slug ?? null, price: String(p.price) };
        }
      }

      const counts: Record<string, number> = {};
      const { data: msgRows } = await supabase.from("chat_messages").select("chat_id");
      for (const m of msgRows || []) counts[m.chat_id] = (counts[m.chat_id] || 0) + 1;

      const chats = rows.map((c: any) => ({
        ...c,
        customer: c.customer_id ? peopleMap[c.customer_id] ?? null : null,
        merchant: c.merchant_id ? peopleMap[c.merchant_id] ?? null : null,
        product: c.product_id ? productMap[c.product_id] ?? null : null,
        message_count: counts[c.id] || 0,
      }));

      return jsonResponse({ chats });
    }

    // ── GET /chats/:id/messages — قراءة محادثة كاملة (للأدمن) ────
    if (path.match(/^\/chats\/[^/]+\/messages$/) && method === "GET") {
      const chatId = path.split("/")[2];
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ messages: data || [] });
    }

    // ── DELETE /chats/:id — حذف كامل للمحادثة (الأدمن فقط) ───────
    if (path.match(/^\/chats\/[^/]+$/) && method === "DELETE") {
      const chatId = path.split("/")[2];
      await supabase.from("chat_messages").delete().eq("chat_id", chatId);
      const { error } = await supabase.from("chats").delete().eq("id", chatId);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── GET /withdrawals ─────────────────────────────────────────
    if (path === "/withdrawals" && method === "GET") {
      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select("*, profile:profiles!user_id(full_name, role)")
        .order("created_at", { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);

      // Fetch emails separately
      const userIds = [...new Set((data || []).map((w: any) => w.user_id).filter(Boolean))];
      let emailMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        for (const u of authUsers?.users ?? []) {
          emailMap[u.id] = u.email ?? "";
        }
      }

      const withdrawals = (data || []).map((w: any) => ({
        ...w,
        profile: w.profile ? { ...w.profile, email: emailMap[w.user_id] ?? "" } : null,
      }));
      return jsonResponse({ withdrawals });
    }

    // ── PUT /withdrawals/:id ─────────────────────────────────────
    if (path.match(/^\/withdrawals\/[^/]+$/) && method === "PUT") {
      const withdrawalId = path.split("/")[2];
      const body = await req.json();
      const { status, admin_notes } = body;

      const { data: withdrawal, error: fetchError } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .eq("id", withdrawalId)
        .maybeSingle();
      if (fetchError || !withdrawal) return jsonResponse({ error: "Withdrawal not found" }, 404);

      const { error } = await supabase
        .from("withdrawal_requests")
        .update({
          status,
          admin_notes: admin_notes || null,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", withdrawalId);
      if (error) return jsonResponse({ error: error.message }, 500);

      // Deduct from wallet when approved or paid
      if ((status === "approved" || status === "paid") && withdrawal.status !== "approved" && withdrawal.status !== "paid") {
        const { data: wallet } = await supabase
          .from("wallets")
          .select("available_balance")
          .eq("user_id", withdrawal.user_id)
          .maybeSingle();

        if (wallet) {
          const newBalance = Math.max(0, parseFloat(wallet.available_balance || "0") - parseFloat(withdrawal.amount));
          const updateData: any = {
            available_balance: newBalance.toFixed(2),
            updated_at: new Date().toISOString(),
          };
          if (status === "paid") {
            updateData.total_withdrawn = (parseFloat(wallet.available_balance || "0") > parseFloat(withdrawal.amount)
              ? parseFloat(withdrawal.amount)
              : parseFloat(wallet.available_balance || "0")).toFixed(2);
          }
          await supabase
            .from("wallets")
            .update(updateData)
            .eq("user_id", withdrawal.user_id);
        }
      }

      return jsonResponse({ success: true });
    }

    // ── POST /withdrawals/batch-pay ──────────────────────────────
    if (path === "/withdrawals/batch-pay" && method === "POST") {
      const body = await req.json();
      const { ids } = body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return jsonResponse({ error: "No withdrawal IDs provided" }, 400);
      }

      let successCount = 0;
      let failCount = 0;
      const errors: string[] = [];

      for (const id of ids) {
        const { data: withdrawal, error: fetchError } = await supabase
          .from("withdrawal_requests")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (fetchError || !withdrawal) {
          failCount++;
          errors.push(`Withdrawal ${id} not found`);
          continue;
        }

        if (withdrawal.status === "paid" || withdrawal.status === "approved") {
          failCount++;
          errors.push(`Withdrawal ${id} already processed`);
          continue;
        }

        const { error: updateError } = await supabase
          .from("withdrawal_requests")
          .update({
            status: "paid",
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (updateError) {
          failCount++;
          errors.push(`Failed to update ${id}: ${updateError.message}`);
          continue;
        }

        const { data: wallet } = await supabase
          .from("wallets")
          .select("available_balance, total_withdrawn")
          .eq("user_id", withdrawal.user_id)
          .maybeSingle();

        if (wallet) {
          const newBalance = Math.max(0, parseFloat(wallet.available_balance || "0") - parseFloat(withdrawal.amount));
          await supabase
            .from("wallets")
            .update({
              available_balance: newBalance.toFixed(2),
              total_withdrawn: (parseFloat(wallet.total_withdrawn || "0") + parseFloat(withdrawal.amount)).toFixed(2),
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", withdrawal.user_id);
        }

        successCount++;
      }

      return jsonResponse({ successCount, failCount, errors });
    }

    // ── GET /merchants — list all merchants with sales stats ──────────
    if (path === "/merchants" && method === "GET") {
      const { data: merchants, error } = await supabase
        .from("profiles")
        .select("id, full_name, is_active, is_banned, created_at")
        .eq("role", "merchant")
        .order("created_at", { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);

      // Fetch emails
      let emailMap: Record<string, string> = {};
      if ((merchants || []).length > 0) {
        const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        for (const u of authUsers?.users ?? []) {
          emailMap[u.id] = u.email ?? "";
        }
      }

      // Fetch sales summary from the view
      const { data: salesData } = await supabase
        .from("merchant_sales_summary")
        .select("*");

      const salesMap: Record<string, any> = {};
      for (const s of salesData || []) {
        salesMap[s.merchant_id] = s;
      }

      // Fetch product counts and order counts
      const merchantIds = (merchants || []).map((m: any) => m.id);
      let productCountMap: Record<string, number> = {};
      let orderCountMap: Record<string, number> = {};

      if (merchantIds.length > 0) {
        const { data: products } = await supabase
          .from("products")
          .select("merchant_id")
          .in("merchant_id", merchantIds);
        for (const p of products || []) {
          productCountMap[p.merchant_id] = (productCountMap[p.merchant_id] || 0) + 1;
        }

        const { data: orderItems } = await supabase
          .from("order_items")
          .select("merchant_id, order_id")
          .in("merchant_id", merchantIds);
        for (const oi of orderItems || []) {
          orderCountMap[oi.merchant_id] = (orderCountMap[oi.merchant_id] || 0) + 1;
        }
      }

      const result = (merchants || []).map((m: any) => {
        const sales = salesMap[m.id];
        return {
          id: m.id,
          full_name: m.full_name,
          email: emailMap[m.id] ?? "",
          is_active: m.is_active,
          is_banned: m.is_banned,
          created_at: m.created_at,
          product_count: productCountMap[m.id] || 0,
          order_count: orderCountMap[m.id] || 0,
          total_sales: sales?.total_sales ? String(sales.total_sales) : "0",
          total_earnings: sales?.total_earnings ? String(sales.total_earnings) : "0",
          pending_earnings: sales?.pending_earnings ? String(sales.pending_earnings) : "0",
          available_balance: sales?.available_balance ? String(sales.available_balance) : "0",
        };
      });

      // Sort by total_sales descending (top sellers first)
      result.sort((a: any, b: any) => parseFloat(b.total_sales) - parseFloat(a.total_sales));

      return jsonResponse({ merchants: result });
    }

    // ── GET /merchants/:id — merchant detail ──────────────────────────
    if (path.match(/^\/merchants\/[^/]+$/) && method === "GET") {
      const merchantId = path.split("/")[2];

      const { data: merchant, error: mErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", merchantId)
        .maybeSingle();
      if (mErr || !merchant) return jsonResponse({ error: "Merchant not found" }, 404);

      let email = "";
      const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const au = (authUsers?.users ?? []).find((u: any) => u.id === merchantId);
      if (au) email = au.email ?? "";

      const { data: wallet } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", merchantId)
        .maybeSingle();

      const { data: products } = await supabase
        .from("products")
        .select("*, category:categories(name), images:product_images(image_url)")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false });

      const { data: orderItems } = await supabase
        .from("order_items")
        .select("*, order:orders(*), product:products(name)")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false });

      const { data: reels } = await supabase
        .from("reels")
        .select("*")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false });

      const { data: restrictions } = await supabase
        .from("merchant_restrictions")
        .select("*")
        .eq("merchant_id", merchantId)
        .maybeSingle();

      // Fetch customer info for orders
      const orderIds = [...new Set((orderItems || []).map((oi: any) => oi.order?.id).filter(Boolean))];
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
        }
      }

      const enrichedOrderItems = (orderItems || []).map((item: any) => ({
        ...item,
        order: item.order
          ? {
              ...item.order,
              customer: item.order.user_id ? customerMap[item.order.user_id] ?? null : null,
            }
          : null,
      }));

      // Compute stats
      const totalSales = (orderItems || []).reduce((sum: number, oi: any) => sum + parseFloat(oi.subtotal || "0"), 0);
      const totalEarnings = (orderItems || []).reduce((sum: number, oi: any) => sum + parseFloat(oi.merchant_earnings || "0"), 0);
      const pendingEarnings = (orderItems || [])
        .filter((oi: any) => oi.hold_until && new Date(oi.hold_until) > new Date())
        .reduce((sum: number, oi: any) => sum + parseFloat(oi.merchant_earnings || "0"), 0);

      return jsonResponse({
        merchant: { ...merchant, email },
        wallet: wallet || null,
        products: products || [],
        orderItems: enrichedOrderItems,
        reels: reels || [],
        restrictions: restrictions || null,
        stats: {
          product_count: products?.length || 0,
          order_count: orderItems?.length || 0,
          reel_count: reels?.length || 0,
          total_sales: totalSales.toFixed(2),
          total_earnings: totalEarnings.toFixed(2),
          pending_earnings: pendingEarnings.toFixed(2),
          available_balance: wallet?.available_balance ? String(wallet.available_balance) : "0",
          pending_balance: wallet?.pending_balance ? String(wallet.pending_balance) : "0",
        },
      });
    }

    // ── GET /export/users — CSV export of all users ───────────────────
    if (path === "/export/users" && method === "GET") {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);

      let emailMap: Record<string, string> = {};
      if ((profiles || []).length > 0) {
        const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        for (const u of authUsers?.users ?? []) {
          emailMap[u.id] = u.email ?? "";
        }
      }

      const csvRows: string[] = [];
      csvRows.push("Full Name,Email,Role,Phone,Active,Banned,Created At");
      for (const p of profiles || []) {
        csvRows.push([
          escapeCsv(p.full_name || ""),
          escapeCsv(emailMap[p.id] || ""),
          escapeCsv(p.role || "customer"),
          escapeCsv(p.phone || ""),
          p.is_active ? "Yes" : "No",
          p.is_banned ? "Yes" : "No",
          escapeCsv(new Date(p.created_at).toLocaleDateString()),
        ].join(","));
      }
      return csvResponse(csvRows.join("\n"), "admin-users");
    }

    // ── GET /export/orders — CSV export of all orders ─────────────────
    if (path === "/export/orders" && method === "GET") {
      const { data: orders, error } = await supabase
        .from("orders")
        .select("*, profile:profiles!user_id(full_name, phone), items:order_items(product_name, quantity, unit_price, subtotal, merchant_earnings)")
        .order("created_at", { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);

      let emailMap: Record<string, string> = {};
      const userIds = [...new Set((orders || []).map((o: any) => o.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        for (const u of authUsers?.users ?? []) {
          emailMap[u.id] = u.email ?? "";
        }
      }

      const csvRows: string[] = [];
      csvRows.push("Order Number,Date,Status,Customer Name,Customer Email,Customer Phone,Total,Payment Method,Payment Status,Tracking Number,Items Count");
      for (const o of orders || []) {
        const itemCount = (o as any).items?.length || 0;
        csvRows.push([
          escapeCsv(o.order_number || ""),
          escapeCsv(new Date(o.created_at).toLocaleDateString()),
          escapeCsv(o.status || ""),
          escapeCsv((o as any).profile?.full_name || ""),
          escapeCsv(emailMap[o.user_id] || ""),
          escapeCsv((o as any).profile?.phone || ""),
          String(o.total || 0),
          escapeCsv(o.payment_method || ""),
          escapeCsv(o.payment_status || ""),
          escapeCsv(o.tracking_number || ""),
          String(itemCount),
        ].join(","));
      }
      return csvResponse(csvRows.join("\n"), "admin-orders");
    }

    // ── GET /export/merchants — CSV export of all merchants ───────────
    if (path === "/export/merchants" && method === "GET") {
      const { data: merchants, error } = await supabase
        .from("profiles")
        .select("id, full_name, is_active, is_banned, created_at")
        .eq("role", "merchant")
        .order("created_at", { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);

      let emailMap: Record<string, string> = {};
      if ((merchants || []).length > 0) {
        const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        for (const u of authUsers?.users ?? []) {
          emailMap[u.id] = u.email ?? "";
        }
      }

      const { data: salesData } = await supabase.from("merchant_sales_summary").select("*");
      const salesMap: Record<string, any> = {};
      for (const s of salesData || []) {
        salesMap[s.merchant_id] = s;
      }

      const csvRows: string[] = [];
      csvRows.push("Merchant Name,Email,Products,Orders,Total Sales,Total Earnings,Pending Earnings,Available Balance,Active,Banned,Created At");
      for (const m of merchants || []) {
        const sales = salesMap[m.id];
        csvRows.push([
          escapeCsv(m.full_name || ""),
          escapeCsv(emailMap[m.id] || ""),
          String(sales?.product_count || 0),
          String(sales?.order_count || 0),
          String(sales?.total_sales || 0),
          String(sales?.total_earnings || 0),
          String(sales?.pending_earnings || 0),
          String(sales?.available_balance || 0),
          m.is_active ? "Yes" : "No",
          m.is_banned ? "Yes" : "No",
          escapeCsv(new Date(m.created_at).toLocaleDateString()),
        ].join(","));
      }
      return csvResponse(csvRows.join("\n"), "admin-merchants");
    }

    // ── GET /export/products — CSV export of all products ─────────────
    if (path === "/export/products" && method === "GET") {
      const { data: products, error } = await supabase
        .from("products")
        .select("*, category:categories(name), merchant:profiles!merchant_id(full_name)")
        .order("created_at", { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);

      const productIds = (products || []).map((p: any) => p.id);
      let imageMap: Record<string, string | null> = {};
      if (productIds.length > 0) {
        const { data: images } = await supabase
          .from("product_images")
          .select("product_id, image_url, sort_order")
          .in("product_id", productIds)
          .order("sort_order", { ascending: true });
        for (const img of images || []) {
          if (!imageMap[img.product_id]) imageMap[img.product_id] = img.image_url;
        }
      }

      const csvRows: string[] = [];
      csvRows.push("Name,Price,Category,Merchant,Status,Rating,Review Count,Created At,Image URL");
      for (const p of products || []) {
        csvRows.push([
          escapeCsv(p.name || ""),
          String(p.price || 0),
          escapeCsv((p as any).category?.name || ""),
          escapeCsv((p as any).merchant?.full_name || ""),
          escapeCsv(p.status || ""),
          String(p.rating || 0),
          String(p.review_count || 0),
          escapeCsv(new Date(p.created_at).toLocaleDateString()),
          escapeCsv(imageMap[p.id] || ""),
        ].join(","));
      }
      return csvResponse(csvRows.join("\n"), "admin-products");
    }

    // ── GET /export/withdrawals — CSV export of all withdrawals ───────
    if (path === "/export/withdrawals" && method === "GET") {
      const { data: withdrawals, error } = await supabase
        .from("withdrawal_requests")
        .select("*, profile:profiles!user_id(full_name, role)")
        .order("created_at", { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 500);

      const csvRows: string[] = [];
      csvRows.push("User Name,Role,Amount,Status,Payment Info,Admin Notes,Invoice Number,Requested At,Processed At");
      for (const w of withdrawals || []) {
        csvRows.push([
          escapeCsv((w as any).profile?.full_name || ""),
          escapeCsv((w as any).profile?.role || ""),
          String(w.amount || 0),
          escapeCsv(w.status || ""),
          escapeCsv(w.payment_info || ""),
          escapeCsv(w.admin_notes || ""),
          escapeCsv(w.invoice_number || ""),
          escapeCsv(new Date(w.created_at).toLocaleDateString()),
          w.processed_at ? escapeCsv(new Date(w.processed_at).toLocaleDateString()) : "",
        ].join(","));
      }
      return csvResponse(csvRows.join("\n"), "admin-withdrawals");
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

function csvResponse(csv: string, filename: string) {
  return new Response(csv, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}-${Date.now()}.csv"`,
    },
  });
}
