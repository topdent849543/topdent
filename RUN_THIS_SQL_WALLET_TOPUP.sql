/*
# Wallet Top-up (Recharge) System

## Overview
Adds a complete, admin-reviewed wallet recharge flow:

1. Admin defines the available payment methods (Sham Cash, Syriatel Cash, Bemo Bank,
   Money Transfer, …) together with the payment instructions and the payment
   address/account the customer must transfer money to.
2. The customer opens the wallet, picks a method, reads the instructions, enters the
   transferred amount (SYP or USD) plus the transfer reference number and/or a photo
   of the receipt, then submits the request.
3. The request lands in the admin "Payment Requests" screen with every detail.
   The admin can APPROVE it (entering the USD amount that will be credited plus an
   optional note) or REJECT it (with an optional reason).
4. Approving credits the customer wallet, writes a wallet transaction and notifies
   the customer. Rejecting notifies the customer with the reason.

## New / Updated Tables
- `payment_methods`   (created if missing, extended with payment address fields)
- `wallet_topup_requests` (new)
- `wallet_transactions.type` CHECK extended with 'topup' and 'payment'

## Security
- RLS on both tables.
- Everyone (anon + authenticated) may read ACTIVE payment methods only.
- Admins (public.is_admin()) fully manage payment methods and all top-up requests.
- Customers may create and read ONLY their own top-up requests, and may never
  change status/amount once submitted (updates are admin-only, done through
  SECURITY DEFINER RPCs).
*/

-- ════════════════════════════════════════════════════════════
-- 0. Safety: make sure the admin helper exists
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = COALESCE(p_user_id, auth.uid()) AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 1. PAYMENT METHODS
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  type          text NOT NULL DEFAULT 'mobile_wallet',
  provider      text NOT NULL DEFAULT '',
  instructions  text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Extra columns (added defensively so existing installs are upgraded in place)
ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS account_name   text;
ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS account_number text;
ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS extra_info     text;
ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS currency       text NOT NULL DEFAULT 'both';
ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS logo_url       text;
ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS sort_order     integer NOT NULL DEFAULT 0;
ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS min_amount     numeric(12,2);
ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS max_amount     numeric(12,2);
ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS updated_at     timestamptz NOT NULL DEFAULT now();

-- Widen the allowed type / currency values without breaking existing rows
ALTER TABLE public.payment_methods DROP CONSTRAINT IF EXISTS payment_methods_type_check;
ALTER TABLE public.payment_methods
  ADD CONSTRAINT payment_methods_type_check
  CHECK (type IN ('mobile_wallet','bank','transfer','cash','crypto','other'));

ALTER TABLE public.payment_methods DROP CONSTRAINT IF EXISTS payment_methods_currency_check;
ALTER TABLE public.payment_methods
  ADD CONSTRAINT payment_methods_currency_check
  CHECK (currency IN ('SYP','USD','both'));

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.payment_methods TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;

DROP POLICY IF EXISTS "payment_methods_select_active" ON public.payment_methods;
CREATE POLICY "payment_methods_select_active" ON public.payment_methods
  FOR SELECT TO anon, authenticated
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "payment_methods_admin_insert" ON public.payment_methods;
CREATE POLICY "payment_methods_admin_insert" ON public.payment_methods
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "payment_methods_admin_update" ON public.payment_methods;
CREATE POLICY "payment_methods_admin_update" ON public.payment_methods
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "payment_methods_admin_delete" ON public.payment_methods;
CREATE POLICY "payment_methods_admin_delete" ON public.payment_methods
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_payment_methods_active ON public.payment_methods(is_active, sort_order);

DROP TRIGGER IF EXISTS trg_payment_methods_updated_at ON public.payment_methods;
CREATE TRIGGER trg_payment_methods_updated_at
  BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ════════════════════════════════════════════════════════════
-- 2. WALLET TOP-UP REQUESTS
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.wallet_topup_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_method_id  uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  method_name        text NOT NULL,
  method_account     text,
  amount             numeric(14,2) NOT NULL CHECK (amount > 0),
  currency           text NOT NULL DEFAULT 'SYP' CHECK (currency IN ('SYP','USD')),
  transfer_reference text,
  receipt_url        text,
  sender_name        text,
  customer_note      text,
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  credited_amount    numeric(12,2),
  admin_note         text,
  rejection_reason   text,
  reviewed_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_topup_proof_required
    CHECK (COALESCE(NULLIF(trim(transfer_reference), ''), NULLIF(trim(receipt_url), '')) IS NOT NULL)
);

ALTER TABLE public.wallet_topup_requests ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.wallet_topup_requests TO authenticated;
GRANT UPDATE ON public.wallet_topup_requests TO authenticated;
GRANT ALL ON public.wallet_topup_requests TO service_role;

DROP POLICY IF EXISTS "topup_select_own_or_admin" ON public.wallet_topup_requests;
CREATE POLICY "topup_select_own_or_admin" ON public.wallet_topup_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "topup_insert_own" ON public.wallet_topup_requests;
CREATE POLICY "topup_insert_own" ON public.wallet_topup_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending' AND credited_amount IS NULL);

DROP POLICY IF EXISTS "topup_update_admin" ON public.wallet_topup_requests;
CREATE POLICY "topup_update_admin" ON public.wallet_topup_requests
  FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_topup_user    ON public.wallet_topup_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_topup_status  ON public.wallet_topup_requests(status, created_at DESC);

DROP TRIGGER IF EXISTS trg_topup_updated_at ON public.wallet_topup_requests;
CREATE TRIGGER trg_topup_updated_at
  BEFORE UPDATE ON public.wallet_topup_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ════════════════════════════════════════════════════════════
-- 3. WALLET TRANSACTIONS: allow 'topup' / 'payment' / 'refund'
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN ('credit','debit','pending_credit','pending_release','withdrawal','adjustment','topup','payment','refund'));

-- ════════════════════════════════════════════════════════════
-- 4. RPC: approve a top-up request (admin only)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.approve_wallet_topup(
  p_request_id uuid,
  p_amount_usd numeric,
  p_admin_note text DEFAULT NULL
) RETURNS public.wallet_topup_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller  uuid := auth.uid();
  v_req     public.wallet_topup_requests;
  v_wallet  public.wallets;
BEGIN
  IF v_caller IS NULL OR NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'Only administrators can review top-up requests';
  END IF;

  IF p_amount_usd IS NULL OR p_amount_usd <= 0 THEN
    RAISE EXCEPTION 'Credited amount must be greater than zero';
  END IF;

  SELECT * INTO v_req FROM public.wallet_topup_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'Top-up request not found';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been reviewed';
  END IF;

  -- Make sure the customer has a wallet
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_req.user_id FOR UPDATE;
  IF v_wallet.id IS NULL THEN
    INSERT INTO public.wallets (user_id) VALUES (v_req.user_id) RETURNING * INTO v_wallet;
  END IF;

  UPDATE public.wallets
     SET available_balance = available_balance + p_amount_usd,
         updated_at        = now()
   WHERE id = v_wallet.id;

  INSERT INTO public.wallet_transactions (wallet_id, user_id, type, amount, description, status)
  VALUES (
    v_wallet.id,
    v_req.user_id,
    'topup',
    p_amount_usd,
    'شحن محفظة عبر ' || v_req.method_name ||
      CASE WHEN v_req.transfer_reference IS NOT NULL
           THEN ' - رقم العملية: ' || v_req.transfer_reference ELSE '' END,
    'completed'
  );

  UPDATE public.wallet_topup_requests
     SET status          = 'approved',
         credited_amount = p_amount_usd,
         admin_note      = NULLIF(trim(COALESCE(p_admin_note, '')), ''),
         reviewed_by     = v_caller,
         reviewed_at     = now(),
         updated_at      = now()
   WHERE id = p_request_id
  RETURNING * INTO v_req;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_req.user_id,
    'wallet_topup_approved',
    'تم شحن محفظتك بنجاح',
    'تمت الموافقة على طلب الشحن وإضافة $' || to_char(p_amount_usd, 'FM999999990.00') || ' إلى محفظتك.' ||
      CASE WHEN v_req.admin_note IS NOT NULL THEN E'\nملاحظة الإدارة: ' || v_req.admin_note ELSE '' END,
    jsonb_build_object('topup_request_id', v_req.id, 'amount_usd', p_amount_usd, 'status', 'approved')
  );

  RETURN v_req;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_wallet_topup(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_wallet_topup(uuid, numeric, text) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 5. RPC: reject a top-up request (admin only)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reject_wallet_topup(
  p_request_id uuid,
  p_reason text DEFAULT NULL
) RETURNS public.wallet_topup_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_req    public.wallet_topup_requests;
BEGIN
  IF v_caller IS NULL OR NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'Only administrators can review top-up requests';
  END IF;

  SELECT * INTO v_req FROM public.wallet_topup_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'Top-up request not found';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been reviewed';
  END IF;

  UPDATE public.wallet_topup_requests
     SET status           = 'rejected',
         rejection_reason = NULLIF(trim(COALESCE(p_reason, '')), ''),
         reviewed_by      = v_caller,
         reviewed_at      = now(),
         updated_at       = now()
   WHERE id = p_request_id
  RETURNING * INTO v_req;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_req.user_id,
    'wallet_topup_rejected',
    'تم رفض عملية شحن المحفظة',
    'نأسف، تم رفض طلب شحن المحفظة الخاص بك.' ||
      CASE WHEN v_req.rejection_reason IS NOT NULL
           THEN E'\nسبب الرفض: ' || v_req.rejection_reason ELSE '' END,
    jsonb_build_object('topup_request_id', v_req.id, 'status', 'rejected')
  );

  RETURN v_req;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_wallet_topup(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_wallet_topup(uuid, text) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 6. Seed the default Syrian payment methods (only when empty)
-- ════════════════════════════════════════════════════════════
INSERT INTO public.payment_methods (name, type, provider, instructions, account_name, account_number, currency, sort_order, is_active)
SELECT * FROM (VALUES
  ('شام كاش', 'mobile_wallet', 'Sham Cash',
   E'1. افتح تطبيق شام كاش.\n2. اختر تحويل الأموال إلى المحفظة أدناه.\n3. أدخل المبلغ المطلوب وأكد التحويل.\n4. انسخ رقم عملية التحويل وأدخله في الحقل المخصص أو ارفع صورة الإيصال.',
   'إدارة المتجر', '0000000000', 'SYP', 1, true),
  ('سيرياتيل كاش', 'mobile_wallet', 'Syriatel Cash',
   E'1. اذهب إلى خدمة سيرياتيل كاش (*555#) أو التطبيق.\n2. اختر تحويل إلى محفظة ثم أدخل الرقم أدناه.\n3. أدخل المبلغ وأكد العملية.\n4. أدخل رقم عملية التحويل أو ارفع صورة الرسالة المؤكدة.',
   'إدارة المتجر', '0000000000', 'SYP', 2, true),
  ('بنك بيمو', 'bank', 'Bemo Saudi Fransi',
   E'1. توجه إلى أقرب فرع بنك بيمو أو استخدم الخدمة الإلكترونية.\n2. حوّل المبلغ إلى رقم الحساب أدناه.\n3. احتفظ بإشعار التحويل.\n4. أدخل رقم الإشعار أو ارفع صورته.',
   'إدارة المتجر', 'SY00 0000 0000 0000', 'both', 3, true),
  ('حوالة', 'transfer', 'Money Transfer',
   E'1. توجه إلى أي مكتب حوالات معتمد.\n2. أرسل الحوالة إلى الاسم الموضح أدناه.\n3. احتفظ برقم الحوالة.\n4. أدخل رقم الحوالة أو ارفع صورة الوصل.',
   'إدارة المتجر', 'يرجى التواصل مع الدعم لتفاصيل الحوالة', 'both', 4, true)
) AS seed(name, type, provider, instructions, account_name, account_number, currency, sort_order, is_active)
WHERE NOT EXISTS (SELECT 1 FROM public.payment_methods);
