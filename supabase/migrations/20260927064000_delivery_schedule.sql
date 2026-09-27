-- Delivery appointment metadata is set only inside the authenticated order-placement transaction.
-- Speed is a fulfillment preference; the existing configured flat shipping fee remains authoritative.
ALTER TABLE public.company_order_fulfillments
  ADD COLUMN IF NOT EXISTS delivery_type text,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_slot text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_type text,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_slot text;

ALTER TABLE public.company_order_fulfillments
  DROP CONSTRAINT IF EXISTS company_order_fulfillments_delivery_type_check;
ALTER TABLE public.company_order_fulfillments
  ADD CONSTRAINT company_order_fulfillments_delivery_type_check
  CHECK (delivery_type IS NULL OR delivery_type IN ('standard','express'));

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_delivery_type_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_delivery_type_check
  CHECK (delivery_type IS NULL OR delivery_type IN ('standard','express'));

CREATE OR REPLACE FUNCTION public.sync_order_delivery_to_company_fulfillments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  UPDATE public.company_order_fulfillments
     SET delivery_type=NEW.delivery_type,
         delivery_fee=COALESCE(NEW.delivery_fee,0),
         delivery_slot=NEW.delivery_slot,
         updated_at=now()
   WHERE order_id=NEW.id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_order_delivery_to_company_fulfillments() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS orders_sync_delivery_to_company_fulfillments ON public.orders;
CREATE TRIGGER orders_sync_delivery_to_company_fulfillments
AFTER UPDATE OF delivery_type,delivery_fee,delivery_slot ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_order_delivery_to_company_fulfillments();

-- This wrapper calls the existing atomic cart/payment RPC and then stores delivery preferences
-- before commit. Any validation/update error rolls back the original order and wallet debit.
CREATE OR REPLACE FUNCTION public.place_order_from_cart_with_delivery(
  p_shipping_branch_id uuid,
  p_affiliate_code text,
  p_delivery_type text,
  p_delivery_slot timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_result jsonb;
  v_order_id uuid;
  v_shipping_fee numeric(12,2):=0;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  IF p_delivery_type NOT IN ('standard','express') THEN
    RAISE EXCEPTION 'Choose a valid delivery speed' USING ERRCODE='22023';
  END IF;
  IF p_delivery_slot IS NULL OR p_delivery_slot<=now() OR p_delivery_slot>now()+interval '14 days' THEN
    RAISE EXCEPTION 'Choose a delivery window within the next 14 days' USING ERRCODE='22023';
  END IF;
  BEGIN
    v_shipping_fee:=COALESCE((public.get_app_settings()->>'shipping_flat_cost')::numeric,0);
  EXCEPTION WHEN OTHERS THEN
    v_shipping_fee:=0;
  END;
  v_result:=public.place_order_from_cart(p_shipping_branch_id,p_affiliate_code)::jsonb;
  v_order_id:=NULLIF(v_result->>'order_id','')::uuid;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'Order placement returned an invalid result' USING ERRCODE='P0001'; END IF;
  UPDATE public.orders
     SET delivery_type=p_delivery_type,
         delivery_fee=v_shipping_fee,
         delivery_slot=p_delivery_slot::text,
         updated_at=now()
   WHERE id=v_order_id AND user_id=v_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unable to save delivery preferences for this order' USING ERRCODE='42501'; END IF;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.place_order_from_cart_with_delivery(uuid,text,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.place_order_from_cart_with_delivery(uuid,text,text,timestamptz) TO authenticated;
