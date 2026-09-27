-- Company-scoped row-level security policies and direct-write privilege restrictions.
-- Split from the reviewed RBAC rollout to keep schema, policy, finance, and workflow changes auditable.

-- Remove all existing policies on sensitive tables before recreating them: permissive policies
-- combine with OR in PostgreSQL, so a permissive legacy policy would otherwise defeat new rules.
DO $$ DECLARE pol record; BEGIN
  FOR pol IN SELECT schemaname,tablename,policyname FROM pg_policies
    WHERE schemaname='public' AND tablename IN ('companies','roles','permissions','user_memberships','role_permissions','audit_logs','drivers','order_driver_assignments','company_order_fulfillments','company_order_status_history','subscription_plans','subscriptions','profiles','categories','products','product_variants','product_images','coupons','banners','orders','order_items','order_status_history','wallets','wallet_transactions','withdrawal_requests','affiliate_links','affiliate_clicks','wallet_topup_requests','withdrawal_settings')
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',pol.policyname,pol.schemaname,pol.tablename); END LOOP;
END $$;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_driver_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_order_fulfillments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_topup_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY companies_read_scoped ON public.companies FOR SELECT TO authenticated
  USING (owner_user_id=auth.uid() OR public.can_access_company(auth.uid(),id) OR public.has_permission(auth.uid(),'companies.view'));
CREATE POLICY roles_read_authenticated ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY permissions_read_authenticated ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY memberships_read_scoped ON public.user_memberships FOR SELECT TO authenticated
  USING (user_id=auth.uid() OR (company_id IS NOT NULL AND public.has_permission(auth.uid(),'users.view',company_id)) OR public.has_permission(auth.uid(),'users.view'));
CREATE POLICY role_permissions_read_authenticated ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY audit_logs_read_authorized ON public.audit_logs FOR SELECT TO authenticated
  USING ((company_id IS NOT NULL AND public.has_permission(auth.uid(),'audit_logs.view',company_id)) OR public.has_permission(auth.uid(),'audit_logs.view'));
CREATE POLICY drivers_read_scoped ON public.drivers FOR SELECT TO authenticated
  USING (user_id=auth.uid() OR (company_id IS NOT NULL AND public.has_permission(auth.uid(),'drivers.view',company_id)) OR public.has_permission(auth.uid(),'drivers.view'));
CREATE POLICY assignments_read_scoped ON public.order_driver_assignments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.drivers d WHERE d.id=driver_id AND d.user_id=auth.uid()) OR
    (company_id IS NOT NULL AND public.has_permission(auth.uid(),'orders.view',company_id)) OR
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.user_id=auth.uid()) OR
    public.has_permission(auth.uid(),'orders.view',(SELECT o.company_id FROM public.orders o WHERE o.id=order_id)) OR
    public.has_permission(auth.uid(),'orders.view'));
CREATE POLICY company_fulfillments_read_scoped ON public.company_order_fulfillments FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'orders.view',company_id) OR
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.user_id=auth.uid()) OR
    EXISTS (SELECT 1 FROM public.drivers d WHERE d.user_id=auth.uid() AND d.id=assigned_driver_id));
CREATE POLICY company_order_history_read_scoped ON public.company_order_status_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.user_id=auth.uid()) OR
    public.has_permission(auth.uid(),'orders.view',company_id) OR
    EXISTS (SELECT 1 FROM public.order_driver_assignments a JOIN public.drivers d ON d.id=a.driver_id WHERE a.order_id=company_order_status_history.order_id AND a.company_id=company_order_status_history.company_id AND d.user_id=auth.uid()) OR
    public.has_permission(auth.uid(),'orders.view'));
CREATE POLICY subscription_plans_read_active ON public.subscription_plans FOR SELECT TO anon,authenticated USING (is_active=true OR public.has_permission(auth.uid(),'subscriptions.manage'));
CREATE POLICY subscriptions_read_scoped ON public.subscriptions FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'companies.view',company_id) OR public.has_permission(auth.uid(),'subscriptions.manage',company_id));

CREATE POLICY profiles_read_own_or_authorized ON public.profiles FOR SELECT TO authenticated
  USING (id=auth.uid() OR public.has_permission(auth.uid(),'users.view') OR EXISTS (
    SELECT 1 FROM public.user_memberships m WHERE m.user_id=profiles.id AND m.company_id IS NOT NULL AND m.status='active' AND public.has_permission(auth.uid(),'users.view',m.company_id)));
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated WITH CHECK (id=auth.uid());
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING (id=auth.uid()) WITH CHECK (id=auth.uid());

CREATE POLICY categories_read_public ON public.categories FOR SELECT TO anon,authenticated USING (true);
CREATE POLICY categories_insert_authorized ON public.categories FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(),'settings.manage'));
CREATE POLICY categories_update_authorized ON public.categories FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(),'settings.manage')) WITH CHECK (public.has_permission(auth.uid(),'settings.manage'));
CREATE POLICY categories_delete_authorized ON public.categories FOR DELETE TO authenticated USING (public.has_permission(auth.uid(),'settings.manage'));

CREATE POLICY products_read_public_or_scoped ON public.products FOR SELECT TO anon,authenticated
  USING ((status='active' AND approval_status='approved') OR
    (company_id IS NOT NULL AND public.has_permission(auth.uid(),'products.view',company_id)) OR
    (merchant_id=auth.uid() AND public.has_permission(auth.uid(),'products.view')) OR
    public.has_permission(auth.uid(),'products.view'));
CREATE POLICY products_insert_authorized ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(),'products.create',company_id) AND approval_status='pending_approval' AND (company_id IS NULL OR public.can_access_company(auth.uid(),company_id)));
CREATE POLICY products_update_authorized ON public.products FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(),'products.edit',company_id) OR public.has_permission(auth.uid(),'products.edit'))
  WITH CHECK ((company_id IS NULL OR public.can_access_company(auth.uid(),company_id)) AND
    (public.has_permission(auth.uid(),'products.edit',company_id) OR public.has_permission(auth.uid(),'products.edit')) AND
    (approval_status IN ('pending_approval','approved','rejected')));
CREATE POLICY products_delete_authorized ON public.products FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(),'products.delete',company_id) OR public.has_permission(auth.uid(),'products.delete'));

CREATE POLICY variants_read_public_or_scoped ON public.product_variants FOR SELECT TO anon,authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id=product_id AND ((p.status='active' AND p.approval_status='approved') OR public.has_permission(auth.uid(),'products.view',p.company_id) OR p.merchant_id=auth.uid())));
CREATE POLICY variants_insert_authorized ON public.product_variants FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.products p WHERE p.id=product_id AND (public.has_permission(auth.uid(),'products.change_stock',p.company_id) OR (p.merchant_id=auth.uid() AND public.has_permission(auth.uid(),'products.create',p.company_id)))));
CREATE POLICY variants_update_authorized ON public.product_variants FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id=product_id AND public.has_permission(auth.uid(),'products.change_stock',p.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.products p WHERE p.id=product_id AND public.has_permission(auth.uid(),'products.change_stock',p.company_id)));
CREATE POLICY variants_delete_authorized ON public.product_variants FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id=product_id AND public.has_permission(auth.uid(),'products.change_stock',p.company_id)));

CREATE POLICY product_images_read_public_or_scoped ON public.product_images FOR SELECT TO anon,authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id=product_id AND ((p.status='active' AND p.approval_status='approved') OR public.has_permission(auth.uid(),'products.view',p.company_id) OR p.merchant_id=auth.uid())));
CREATE POLICY product_images_insert_authorized ON public.product_images FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.products p WHERE p.id=product_id AND (public.has_permission(auth.uid(),'products.edit',p.company_id) OR (p.merchant_id=auth.uid() AND public.has_permission(auth.uid(),'products.create',p.company_id)))));
CREATE POLICY product_images_update_authorized ON public.product_images FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id=product_id AND public.has_permission(auth.uid(),'products.edit',p.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.products p WHERE p.id=product_id AND public.has_permission(auth.uid(),'products.edit',p.company_id)));
CREATE POLICY product_images_delete_authorized ON public.product_images FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id=product_id AND public.has_permission(auth.uid(),'products.edit',p.company_id)));

CREATE POLICY coupons_read_public ON public.coupons FOR SELECT TO anon,authenticated USING (true);
CREATE POLICY coupons_insert_authorized ON public.coupons FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(),'coupons.manage'));
CREATE POLICY coupons_update_authorized ON public.coupons FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(),'coupons.manage')) WITH CHECK (public.has_permission(auth.uid(),'coupons.manage'));
CREATE POLICY coupons_delete_authorized ON public.coupons FOR DELETE TO authenticated USING (public.has_permission(auth.uid(),'coupons.manage'));
CREATE POLICY banners_read_public ON public.banners FOR SELECT TO anon,authenticated USING (true);
CREATE POLICY banners_insert_authorized ON public.banners FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(),'banners.manage'));
CREATE POLICY banners_update_authorized ON public.banners FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(),'banners.manage')) WITH CHECK (public.has_permission(auth.uid(),'banners.manage'));
CREATE POLICY banners_delete_authorized ON public.banners FOR DELETE TO authenticated USING (public.has_permission(auth.uid(),'banners.manage'));

CREATE POLICY orders_read_owner_or_scoped ON public.orders FOR SELECT TO authenticated
  USING (user_id=auth.uid() OR (company_id IS NOT NULL AND public.has_permission(auth.uid(),'orders.view',company_id)) OR
    EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id=id AND ((oi.company_id IS NOT NULL AND public.has_permission(auth.uid(),'orders.view',oi.company_id)) OR (oi.merchant_id=auth.uid() AND public.has_permission(auth.uid(),'orders.view')))) OR
    EXISTS (SELECT 1 FROM public.order_driver_assignments a JOIN public.drivers d ON d.id=a.driver_id WHERE a.order_id=id AND d.user_id=auth.uid()));
CREATE POLICY orders_insert_owner ON public.orders FOR INSERT TO authenticated
  WITH CHECK (user_id=auth.uid() AND status IN ('pending','new'));
CREATE POLICY order_items_read_owner_or_scoped ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.user_id=auth.uid()) OR
    (company_id IS NOT NULL AND public.has_permission(auth.uid(),'orders.view',company_id)) OR
    (merchant_id=auth.uid() AND public.has_permission(auth.uid(),'orders.view')));
CREATE POLICY order_items_insert_owner ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.user_id=auth.uid()));
CREATE POLICY order_status_history_read_scoped ON public.order_status_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.user_id=auth.uid()) OR
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.company_id IS NOT NULL AND public.has_permission(auth.uid(),'orders.view',o.company_id)) OR
    EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id=order_status_history.order_id AND oi.company_id IS NOT NULL AND public.has_permission(auth.uid(),'orders.view',oi.company_id)) OR
    EXISTS (SELECT 1 FROM public.order_driver_assignments a JOIN public.drivers d ON d.id=a.driver_id WHERE a.order_id=order_status_history.order_id AND d.user_id=auth.uid()) OR
    public.has_permission(auth.uid(),'orders.view'));

CREATE POLICY wallets_read_owner_or_finance ON public.wallets FOR SELECT TO authenticated
  USING (user_id=auth.uid() OR public.has_permission(auth.uid(),'finance.view') OR public.has_permission(auth.uid(),'finance.manage_withdrawals'));
CREATE POLICY wallets_insert_own_zero ON public.wallets FOR INSERT TO authenticated
  WITH CHECK (user_id=auth.uid() AND available_balance=0 AND pending_balance=0 AND total_earned=0 AND total_withdrawn=0 AND public.has_permission(auth.uid(),'wallet.topup.create'));
CREATE POLICY wallet_transactions_read_owner_or_finance ON public.wallet_transactions FOR SELECT TO authenticated
  USING (user_id=auth.uid() OR public.has_permission(auth.uid(),'finance.view') OR public.has_permission(auth.uid(),'finance.manage_withdrawals'));
CREATE POLICY withdrawal_requests_read_owner_or_finance ON public.withdrawal_requests FOR SELECT TO authenticated
  USING (user_id=auth.uid() OR public.has_permission(auth.uid(),'finance.manage_withdrawals'));
CREATE POLICY withdrawal_requests_insert_owner ON public.withdrawal_requests FOR INSERT TO authenticated
  WITH CHECK (user_id=auth.uid() AND status='pending' AND public.has_permission(auth.uid(),'withdrawals.create'));
CREATE POLICY affiliate_links_read_owner ON public.affiliate_links FOR SELECT TO authenticated
  USING (user_id=auth.uid() AND public.has_permission(auth.uid(),'affiliate.manage_self'));
CREATE POLICY affiliate_links_insert_owner ON public.affiliate_links FOR INSERT TO authenticated
  WITH CHECK (user_id=auth.uid() AND public.has_permission(auth.uid(),'affiliate.manage_self'));
CREATE POLICY affiliate_links_update_owner ON public.affiliate_links FOR UPDATE TO authenticated
  USING (user_id=auth.uid() AND public.has_permission(auth.uid(),'affiliate.manage_self'))
  WITH CHECK (user_id=auth.uid() AND public.has_permission(auth.uid(),'affiliate.manage_self'));
CREATE POLICY affiliate_links_delete_owner ON public.affiliate_links FOR DELETE TO authenticated
  USING (user_id=auth.uid() AND public.has_permission(auth.uid(),'affiliate.manage_self'));
CREATE POLICY affiliate_clicks_read_owner ON public.affiliate_clicks FOR SELECT TO authenticated
  USING (user_id=auth.uid() AND public.has_permission(auth.uid(),'affiliate.manage_self'));
CREATE POLICY affiliate_clicks_insert_valid_link ON public.affiliate_clicks FOR INSERT TO anon,authenticated
  WITH CHECK ((user_id IS NULL OR user_id=auth.uid()) AND EXISTS (
    SELECT 1 FROM public.affiliate_links l WHERE l.id=affiliate_link_id AND l.product_id=product_id AND l.is_active=true));
CREATE POLICY wallet_topups_read_owner_or_finance ON public.wallet_topup_requests FOR SELECT TO authenticated
  USING (user_id=auth.uid() OR public.has_permission(auth.uid(),'finance.manage_topups'));
CREATE POLICY wallet_topups_insert_owner ON public.wallet_topup_requests FOR INSERT TO authenticated
  WITH CHECK (user_id=auth.uid() AND status='pending' AND credited_amount IS NULL AND public.has_permission(auth.uid(),'wallet.topup.create'));
CREATE POLICY withdrawal_settings_read_owner_or_finance ON public.withdrawal_settings FOR SELECT TO authenticated
  USING (user_id=auth.uid() OR public.has_permission(auth.uid(),'finance.manage_withdrawals'));
CREATE POLICY withdrawal_settings_insert_owner ON public.withdrawal_settings FOR INSERT TO authenticated
  WITH CHECK (user_id=auth.uid() AND public.has_permission(auth.uid(),'withdrawals.create'));
CREATE POLICY withdrawal_settings_update_owner ON public.withdrawal_settings FOR UPDATE TO authenticated
  USING (user_id=auth.uid() AND public.has_permission(auth.uid(),'withdrawals.create'))
  WITH CHECK (user_id=auth.uid() AND public.has_permission(auth.uid(),'withdrawals.create'));

-- Do not permit direct writes to membership/grant/audit records or direct client-side order status
-- edits. Edge Functions and these checked RPCs are the privileged mutation boundary.
REVOKE INSERT,UPDATE,DELETE ON public.roles,public.permissions,public.user_memberships,public.role_permissions,public.audit_logs,public.drivers,public.order_driver_assignments,public.company_order_fulfillments,public.company_order_status_history,public.subscriptions,public.order_status_history FROM anon,authenticated;
REVOKE UPDATE ON public.orders FROM anon,authenticated;
REVOKE DELETE ON public.orders FROM anon,authenticated;
REVOKE UPDATE,DELETE ON public.order_items FROM anon,authenticated;
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE(full_name,phone,avatar_url,default_currency,default_language,updated_at) ON public.profiles TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.wallets,public.wallet_transactions,public.withdrawal_requests,public.affiliate_clicks,public.wallet_topup_requests,public.withdrawal_settings FROM authenticated;
GRANT INSERT ON public.withdrawal_requests,public.wallet_topup_requests TO authenticated;
GRANT INSERT(user_id) ON public.wallets TO authenticated;
GRANT INSERT(user_id,min_threshold,payment_method,account_details) ON public.withdrawal_settings TO authenticated;
GRANT UPDATE(min_threshold,payment_method,account_details,updated_at) ON public.withdrawal_settings TO authenticated;
GRANT INSERT(user_id,product_id,affiliate_code) ON public.affiliate_links TO authenticated;
GRANT DELETE ON public.affiliate_links TO authenticated;
REVOKE UPDATE ON public.affiliate_links FROM authenticated;
GRANT SELECT ON public.wallets,public.wallet_transactions,public.withdrawal_requests,public.affiliate_links,public.affiliate_clicks,public.wallet_topup_requests,public.withdrawal_settings TO authenticated;
