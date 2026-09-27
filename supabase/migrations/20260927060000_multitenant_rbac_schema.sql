-- RBAC schema, compatibility backfill, permission helpers, and company-scope triggers.
-- Split from the reviewed RBAC rollout to keep schema, policy, finance, and workflow changes auditable.

-- TopDent multi-company RBAC foundation.
-- Idempotent, additive migration: preserves existing orders/products and legacy profiles.role.
-- Apply after the currently deployed schema. Do not run against a production database without
-- first taking a database backup and reviewing the generated data backfill.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  description text,
  phone text,
  whatsapp text,
  email text,
  governorate_id uuid,
  address text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','archived')),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('platform','company','self')),
  is_system_role boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS user_memberships_unique_scope
  ON public.user_memberships(user_id, role_id, COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS user_memberships_user_status_idx ON public.user_memberships(user_id,status);
CREATE INDEX IF NOT EXISTS user_memberships_company_status_idx ON public.user_memberships(company_id,status);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_actor_created_idx ON public.audit_logs(actor_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_company_created_idx ON public.audit_logs(company_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_type text NOT NULL CHECK (driver_type IN ('global','company')),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  vehicle_type text,
  vehicle_plate text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','unavailable')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drivers_company_scope_check CHECK ((driver_type='company' AND company_id IS NOT NULL) OR (driver_type='global' AND company_id IS NULL))
);

CREATE TABLE IF NOT EXISTS public.order_driver_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  started_at timestamptz,
  arrived_at timestamptz,
  delivered_at timestamptz,
  collection_status text NOT NULL DEFAULT 'pending' CHECK (collection_status IN ('pending','collected','not_collected')),
  collection_note text,
  problem_type text,
  problem_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS order_driver_assignments_unique_scope
  ON public.order_driver_assignments(order_id,driver_id,COALESCE(company_id,'00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS order_driver_assignments_driver_idx ON public.order_driver_assignments(driver_id,created_at DESC);
CREATE INDEX IF NOT EXISTS order_driver_assignments_order_idx ON public.order_driver_assignments(order_id);

CREATE TABLE IF NOT EXISTS public.company_order_fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'new',
  collection_status text NOT NULL DEFAULT 'pending' CHECK (collection_status IN ('pending','collected','not_collected')),
  collection_note text,
  rejection_reason text,
  cancel_reason text,
  assigned_driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id,company_id)
);
CREATE INDEX IF NOT EXISTS company_order_fulfillments_company_status_idx ON public.company_order_fulfillments(company_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS public.company_order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_order_status_history_scope_idx ON public.company_order_status_history(order_id,company_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  price numeric(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  currency text NOT NULL DEFAULT 'USD',
  interval text NOT NULL DEFAULT 'month' CHECK (interval IN ('month','year')),
  product_limit integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing','active','past_due','canceled','expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscriptions_company_status_idx ON public.subscriptions(company_id,status,current_period_end DESC);

-- Compatibility columns. Legacy profile roles remain available for old clients, but are no longer
-- authoritative for any policy or server authorization decision.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'customer';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending_approval';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_type text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_fee numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_slot text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS collection_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS final_review_status text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.order_driver_assignments ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

-- Preserve the legacy order states while adding the validated TopDent workflow states.
DO $$ DECLARE c record; BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='public.orders'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%payment_status%'
  LOOP EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I',c.conname); END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.orders'::regclass AND conname='orders_topdent_status_check') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_topdent_status_check CHECK (status IN (
      'pending','confirmed','processing','shipped','out_for_delivery','delivered','completed','cancelled','returned','refunded',
      'new','under_review','approved','preparing','ready_for_delivery','waiting_for_driver','arrived','final_review','delivery_failed','archived','rejected'
    ));
  END IF;
END $$;

-- Seed the fixed system roles and permission vocabulary.
INSERT INTO public.roles(key,name,scope_type,is_system_role) VALUES
 ('platform_owner','Platform Owner','platform',true),
 ('platform_admin','Platform Admin','platform',true),
 ('company_manager','Company Manager','company',true),
 ('company_admin','Company Admin','company',true),
 ('global_driver','Global Driver','self',true),
 ('company_driver','Company Driver','company',true),
 ('customer','Customer','self',true),
 ('publisher','Publisher / Affiliate','self',true)
ON CONFLICT (key) DO UPDATE SET name=EXCLUDED.name,scope_type=EXCLUDED.scope_type,is_system_role=true,updated_at=now();

INSERT INTO public.permissions(key,description) VALUES
 ('products.view','View products'),('products.create','Create products'),('products.edit','Edit products'),('products.delete','Delete products'),('products.archive','Archive products'),('products.approve','Approve products'),('products.reject','Reject products'),('products.change_price','Change product prices'),('products.change_stock','Change stock'),('products.publish','Publish products'),
 ('orders.view','View orders'),('orders.review','Review orders'),('orders.approve','Approve orders'),('orders.reject','Reject orders'),('orders.cancel','Cancel orders'),('orders.prepare','Prepare orders'),('orders.mark_ready','Mark orders ready'),('orders.assign_driver','Assign drivers'),('orders.change_status','Change order status'),('orders.confirm_delivery','Confirm delivery'),('orders.confirm_collection','Confirm collections'),('orders.archive','Archive orders'),
 ('companies.view','View companies'),('companies.create','Create companies'),('companies.edit','Edit companies'),('companies.suspend','Suspend companies'),('companies.manage_team','Manage company team'),('users.view','View users'),('users.create','Create users'),('users.disable','Disable users'),('users.change_role','Change user roles'),('roles.view','View roles'),('roles.create','Create roles'),('roles.edit_permissions','Edit permissions'),('roles.assign','Assign roles'),
 ('drivers.view','View drivers'),('drivers.create','Create drivers'),('drivers.edit','Edit drivers'),('drivers.disable','Disable drivers'),('drivers.assign_orders','Assign deliveries'),('drivers.accept_orders','Accept deliveries'),('drivers.confirm_delivery','Confirm delivery'),('drivers.confirm_collection','Confirm collections'),('drivers.report_problem','Report delivery problems'),('shipping.view','View shipping'),('shipping.manage_settings','Manage shipping settings'),
 ('finance.view','View finance'),('finance.confirm_collection','Confirm collections'),('finance.manage_topups','Manage top-ups'),('finance.manage_withdrawals','Manage withdrawals'),('reports.view','View reports'),('reports.export','Export reports'),
 ('banners.manage','Manage banners'),('coupons.manage','Manage coupons'),('notifications.send','Send notifications'),('audit_logs.view','View audit logs'),('settings.manage','Manage settings'),('subscriptions.manage','Manage subscriptions'),('affiliate.manage_self','Manage own affiliate links and earnings'),('withdrawals.create','Create own withdrawal requests'),('wallet.topup.create','Create own wallet top-up requests')
ON CONFLICT (key) DO NOTHING;

-- Deliberately explicit least-privilege presets. Platform owners bypass the grant table; platform
-- admins do not. A platform owner may change grants through a trusted administrative operation.
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.key='platform_admin' AND p.key IN ('orders.view','products.view','drivers.view','reports.view')
ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.key='company_manager' AND p.key IN (
 'products.view','products.create','products.edit','products.delete','products.archive','products.change_price','products.change_stock','products.publish',
 'orders.view','orders.review','orders.approve','orders.prepare','orders.mark_ready','orders.assign_driver','orders.change_status','orders.confirm_delivery',
 'companies.view','companies.edit','companies.manage_team','users.view','users.create','users.disable','roles.view','roles.create','roles.edit_permissions','roles.assign',
 'drivers.view','drivers.create','drivers.edit','drivers.disable','drivers.assign_orders','shipping.view','finance.view','withdrawals.create','reports.view','reports.export','settings.manage'
)
ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.key='company_admin' AND p.key IN (
 'products.view','products.create','products.edit','products.change_stock','orders.view','orders.prepare','orders.mark_ready',
 'companies.view','users.view','drivers.view','drivers.assign_orders','shipping.view','reports.view'
)
ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.key IN ('global_driver','company_driver') AND p.key IN ('drivers.view','drivers.accept_orders','drivers.confirm_delivery','drivers.confirm_collection','drivers.report_problem','orders.view')
ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.key='customer' AND p.key IN ('orders.view','orders.cancel','wallet.topup.create')
ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.key='publisher' AND p.key IN ('affiliate.manage_self','withdrawals.create')
ON CONFLICT DO NOTHING;

-- Each legacy merchant receives a separate company; we never place unrelated merchants in one
-- shared default company. Existing products and line items are linked using their legacy owner.
INSERT INTO public.companies(name,slug,status,owner_user_id)
SELECT COALESCE(NULLIF(btrim(p.full_name),''),'Legacy merchant'), 'legacy-'||replace(p.id::text,'-',''), 'active', p.id
FROM public.profiles p WHERE p.role::text='merchant'
ON CONFLICT (slug) DO NOTHING;
UPDATE public.products pr SET company_id=c.id
FROM public.companies c WHERE pr.company_id IS NULL AND pr.merchant_id=c.owner_user_id;
UPDATE public.order_items oi SET company_id=c.id
FROM public.companies c WHERE oi.company_id IS NULL AND oi.merchant_id=c.owner_user_id;
INSERT INTO public.company_order_fulfillments(order_id,company_id,status)
SELECT o.id,oi.company_id,CASE WHEN o.status IN ('pending','new') THEN 'new' WHEN o.status IN ('confirmed','approved') THEN 'approved' WHEN o.status IN ('processing','preparing') THEN 'preparing' WHEN o.status IN ('shipped','out_for_delivery') THEN 'out_for_delivery' WHEN o.status IN ('delivered','completed') THEN 'delivered' WHEN o.status='cancelled' THEN 'cancelled' ELSE 'new' END
FROM public.orders o JOIN public.order_items oi ON oi.order_id=o.id
WHERE oi.company_id IS NOT NULL
GROUP BY o.id,oi.company_id,o.status
ON CONFLICT(order_id,company_id) DO NOTHING;
UPDATE public.orders o SET company_id=x.company_id
FROM (
  SELECT order_id, (array_agg(DISTINCT company_id))[1] AS company_id
  FROM public.order_items WHERE company_id IS NOT NULL GROUP BY order_id HAVING count(DISTINCT company_id)=1
) x WHERE o.id=x.order_id AND o.company_id IS NULL;
UPDATE public.products SET approval_status='approved' WHERE approval_status='pending_approval' AND status='active';

-- All existing users retain a customer membership; legacy privileged roles receive a separate
-- membership mapped conservatively. Legacy admins become platform_admin, never platform_owner.
INSERT INTO public.user_memberships(user_id,role_id,company_id,status)
SELECT p.id,r.id,NULL,'active' FROM public.profiles p JOIN public.roles r ON r.key='customer'
ON CONFLICT DO NOTHING;
INSERT INTO public.user_memberships(user_id,role_id,company_id,status)
SELECT p.id,r.id,c.id,'active' FROM public.profiles p JOIN public.roles r ON r.key='company_manager'
JOIN public.companies c ON c.owner_user_id=p.id WHERE p.role::text='merchant'
ON CONFLICT DO NOTHING;
INSERT INTO public.user_memberships(user_id,role_id,company_id,status)
SELECT p.id,r.id,NULL,'active' FROM public.profiles p JOIN public.roles r ON r.key='publisher' WHERE p.role::text='publisher'
ON CONFLICT DO NOTHING;
INSERT INTO public.user_memberships(user_id,role_id,company_id,status)
SELECT p.id,r.id,NULL,'active' FROM public.profiles p JOIN public.roles r ON r.key='platform_admin' WHERE p.role::text='admin'
ON CONFLICT DO NOTHING;

-- New registrations always receive customer membership; only the low-risk affiliate role may be
-- self-selected. Company and platform roles are never accepted from auth metadata.
CREATE OR REPLACE FUNCTION public.create_signup_memberships()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_customer uuid; v_publisher uuid; v_membership uuid;
BEGIN
  SELECT id INTO v_customer FROM public.roles WHERE key='customer';
  INSERT INTO public.user_memberships(user_id,role_id,company_id,status) VALUES(NEW.id,v_customer,NULL,'active')
    ON CONFLICT DO NOTHING;
  IF COALESCE(NEW.raw_user_meta_data->>'signup_requested_role','')='publisher' THEN
    SELECT id INTO v_publisher FROM public.roles WHERE key='publisher';
    INSERT INTO public.user_memberships(user_id,role_id,company_id,status) VALUES(NEW.id,v_publisher,NULL,'active')
      ON CONFLICT DO NOTHING RETURNING id INTO v_membership;
    IF v_membership IS NOT NULL THEN
      INSERT INTO public.audit_logs(actor_user_id,action,resource_type,resource_id,after_data,reason)
      VALUES(NEW.id,'membership.self_enrolled','user_membership',v_membership::text,jsonb_build_object('role','publisher'),'Public publisher signup choice');
    END IF;
    INSERT INTO public.wallets(user_id) VALUES(NEW.id) ON CONFLICT(user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS auth_user_create_topdent_memberships ON auth.users;
CREATE TRIGGER auth_user_create_topdent_memberships AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_signup_memberships();

CREATE OR REPLACE FUNCTION public.request_publisher_membership()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_user uuid:=auth.uid(); v_role uuid; v_membership uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=v_user AND COALESCE(is_active,true) AND NOT COALESCE(is_banned,false)) THEN
    RAISE EXCEPTION 'Account is not active' USING ERRCODE='42501';
  END IF;
  SELECT id INTO v_role FROM public.roles WHERE key='publisher';
  SELECT id INTO v_membership FROM public.user_memberships WHERE user_id=v_user AND role_id=v_role AND company_id IS NULL;
  IF v_membership IS NULL THEN
    INSERT INTO public.user_memberships(user_id,role_id,company_id,status) VALUES(v_user,v_role,NULL,'active') RETURNING id INTO v_membership;
  ELSE
    UPDATE public.user_memberships SET status='active',updated_at=now() WHERE id=v_membership;
  END IF;
  INSERT INTO public.wallets(user_id) VALUES(v_user) ON CONFLICT(user_id) DO NOTHING;
  INSERT INTO public.audit_logs(actor_user_id,action,resource_type,resource_id,after_data,reason)
    VALUES(v_user,'membership.publisher_requested','user_membership',v_membership::text,jsonb_build_object('role','publisher'),'Self-service affiliate enrollment');
  RETURN v_membership;
END $$;
REVOKE ALL ON FUNCTION public.request_publisher_membership() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_publisher_membership() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_access_company(p_user_id uuid,p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(p_user_id IS NOT NULL AND p_company_id IS NOT NULL AND
   (p_user_id=auth.uid() OR COALESCE(auth.jwt()->>'role','')='service_role') AND
   EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=p_user_id AND COALESCE(p.is_active,true) AND NOT COALESCE(p.is_banned,false)) AND
   EXISTS (SELECT 1 FROM public.user_memberships m JOIN public.roles r ON r.id=m.role_id
           WHERE m.user_id=p_user_id AND m.status='active' AND
            (r.key='platform_owner' OR (r.scope_type='company' AND m.company_id=p_company_id AND (r.company_id IS NULL OR r.company_id=p_company_id)))),false)
$$;

CREATE OR REPLACE FUNCTION public.has_permission(p_user_id uuid,p_permission text,p_company_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(p_user_id IS NOT NULL AND p_permission IS NOT NULL AND
   (p_user_id=auth.uid() OR COALESCE(auth.jwt()->>'role','')='service_role') AND
   EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=p_user_id AND COALESCE(p.is_active,true) AND NOT COALESCE(p.is_banned,false)) AND
   (EXISTS (SELECT 1 FROM public.user_memberships m JOIN public.roles r ON r.id=m.role_id
            WHERE m.user_id=p_user_id AND m.status='active' AND r.key='platform_owner' AND m.company_id IS NULL)
    OR EXISTS (SELECT 1 FROM public.user_memberships m JOIN public.roles r ON r.id=m.role_id
               JOIN public.role_permissions rp ON rp.role_id=r.id JOIN public.permissions perm ON perm.id=rp.permission_id
               WHERE m.user_id=p_user_id AND m.status='active' AND perm.key=p_permission AND
                 ((r.scope_type='platform' AND m.company_id IS NULL) OR
                  (r.scope_type='company' AND m.company_id IS NOT NULL AND p_company_id IS NOT NULL AND m.company_id=p_company_id AND (r.company_id IS NULL OR r.company_id=p_company_id)) OR
                  (r.scope_type='self' AND m.company_id IS NULL)))),false)
$$;
REVOKE ALL ON FUNCTION public.can_access_company(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.has_permission(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_access_company(uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid,text,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT COALESCE(public.has_permission(p_user_id,'settings.manage') AND EXISTS (
    SELECT 1 FROM public.user_memberships m JOIN public.roles r ON r.id=m.role_id
    WHERE m.user_id=p_user_id AND m.status='active' AND m.company_id IS NULL AND r.scope_type='platform'
  ),false)
$$;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated,service_role;

-- Company-level legacy ownership bridge: new client inserts receive the user's single managed
-- company where possible, without allowing a client to choose another company's scope.
CREATE OR REPLACE FUNCTION public.assign_product_company_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_company_id uuid;
BEGIN
  IF COALESCE(auth.jwt()->>'role','')='service_role' THEN RETURN NEW; END IF;
  IF NEW.company_id IS NOT NULL AND NOT public.can_access_company(auth.uid(),NEW.company_id) THEN
    RAISE EXCEPTION 'Company scope denied' USING ERRCODE='42501';
  END IF;
  IF NEW.company_id IS NULL AND NEW.merchant_id=auth.uid() THEN
    SELECT m.company_id INTO v_company_id FROM public.user_memberships m JOIN public.roles r ON r.id=m.role_id
      WHERE m.user_id=auth.uid() AND m.status='active' AND r.key IN ('company_manager','company_admin') AND m.company_id IS NOT NULL LIMIT 1;
    NEW.company_id:=v_company_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS products_assign_company_scope ON public.products;
CREATE TRIGGER products_assign_company_scope BEFORE INSERT OR UPDATE OF company_id,merchant_id ON public.products
FOR EACH ROW EXECUTE FUNCTION public.assign_product_company_scope();

CREATE OR REPLACE FUNCTION public.guard_product_mutations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_company uuid; v_actor uuid:=auth.uid();
BEGIN
  IF COALESCE(auth.jwt()->>'role','')='service_role' THEN RETURN NEW; END IF;
  v_company:=COALESCE(NEW.company_id,CASE WHEN TG_OP='UPDATE' THEN OLD.company_id ELSE NULL END);
  IF TG_OP='INSERT' THEN
    IF NEW.approval_status<>'pending_approval' OR (NEW.merchant_id IS NOT NULL AND NEW.merchant_id<>v_actor) THEN
      RAISE EXCEPTION 'New seller products must be submitted for approval' USING ERRCODE='42501';
    END IF;
    IF NEW.status='active' AND NEW.approval_status='approved' AND v_company IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.subscriptions s WHERE s.company_id=v_company AND s.status IN ('trialing','active') AND (s.current_period_end IS NULL OR s.current_period_end>now())
    ) THEN RAISE EXCEPTION 'An active company subscription is required to publish products' USING ERRCODE='42501'; END IF;
  ELSE
    IF NEW.price IS DISTINCT FROM OLD.price AND NOT public.has_permission(v_actor,'products.change_price',v_company) THEN
      RAISE EXCEPTION 'Price change permission required' USING ERRCODE='42501';
    END IF;
    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status AND NOT public.has_permission(v_actor,'products.approve',v_company) THEN
      RAISE EXCEPTION 'Product approval permission required' USING ERRCODE='42501';
    END IF;
    IF NEW.merchant_id IS DISTINCT FROM OLD.merchant_id OR NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
      IF NOT public.has_permission(v_actor,'products.approve',v_company) THEN RAISE EXCEPTION 'Protected product fields cannot be changed' USING ERRCODE='42501'; END IF;
    END IF;
    IF NEW.status='active' AND OLD.status IS DISTINCT FROM 'active' THEN
      IF NOT public.has_permission(v_actor,'products.publish',v_company) THEN RAISE EXCEPTION 'Product publish permission required' USING ERRCODE='42501'; END IF;
    END IF;
    IF NEW.status='active' AND NEW.approval_status='approved' AND (OLD.status IS DISTINCT FROM 'active' OR OLD.approval_status IS DISTINCT FROM 'approved')
      AND v_company IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.company_id=v_company AND s.status IN ('trialing','active') AND (s.current_period_end IS NULL OR s.current_period_end>now())) THEN
      RAISE EXCEPTION 'An active company subscription is required to publish products' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS products_guard_sensitive_fields ON public.products;
CREATE TRIGGER products_guard_sensitive_fields BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.guard_product_mutations();

CREATE OR REPLACE FUNCTION public.assign_order_item_company_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_company_id uuid;
BEGIN
  IF NEW.company_id IS NULL AND NEW.product_id IS NOT NULL THEN
    SELECT company_id INTO v_company_id FROM public.products WHERE id=NEW.product_id;
    NEW.company_id:=v_company_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS order_items_assign_company_scope ON public.order_items;
CREATE TRIGGER order_items_assign_company_scope BEFORE INSERT OR UPDATE OF product_id,company_id ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.assign_order_item_company_scope();

CREATE OR REPLACE FUNCTION public.ensure_company_order_fulfillment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.company_id IS NOT NULL THEN
    INSERT INTO public.company_order_fulfillments(order_id,company_id,status)
    VALUES(NEW.order_id,NEW.company_id,'new') ON CONFLICT(order_id,company_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS order_items_create_company_fulfillment ON public.order_items;
CREATE TRIGGER order_items_create_company_fulfillment AFTER INSERT OR UPDATE OF company_id ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.ensure_company_order_fulfillment();
