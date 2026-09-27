-- Audited order lifecycle, driver assignment/delivery RPCs, bootstrap, and append-only audit guard.
-- Split from the reviewed RBAC rollout to keep schema, policy, finance, and workflow changes auditable.

-- Order status transitions are serialized and audited. Customer cancellation is restricted to
-- their own pre-fulfilment order; staff/driver transitions require an explicit scoped permission.
CREATE OR REPLACE FUNCTION public.transition_order_status(
  p_order_id uuid,p_next_status text,p_company_id uuid DEFAULT NULL,p_reason text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_order public.orders%ROWTYPE; v_actor uuid:=auth.uid(); v_permission text; v_allowed boolean:=false; v_company uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
  v_company:=COALESCE(p_company_id,v_order.company_id);
  IF p_company_id IS NOT NULL AND v_order.company_id IS NOT NULL AND p_company_id<>v_order.company_id THEN
    RAISE EXCEPTION 'Company scope denied' USING ERRCODE='42501';
  END IF;
  IF p_company_id IS NOT NULL AND v_order.company_id IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.order_items oi WHERE oi.order_id=p_order_id AND oi.company_id=p_company_id
  ) THEN RAISE EXCEPTION 'Order is outside the requested company scope' USING ERRCODE='42501'; END IF;
  IF (SELECT count(DISTINCT oi.company_id) FROM public.order_items oi WHERE oi.order_id=p_order_id AND oi.company_id IS NOT NULL)>1
     AND NOT public.has_permission(v_actor,'orders.change_status')
     AND NOT (v_order.user_id=v_actor AND p_next_status='cancelled' AND v_order.status IN ('new','under_review','pending')) THEN
    RAISE EXCEPTION 'Multi-company order must be fulfilled through company-scoped fulfillment records' USING ERRCODE='42501';
  END IF;
  IF p_next_status IN ('cancelled','delivery_failed','rejected') AND NULLIF(btrim(p_reason),'') IS NULL THEN
    RAISE EXCEPTION 'A reason is required for this transition' USING ERRCODE='22023';
  END IF;
  v_allowed:=CASE v_order.status
    WHEN 'new' THEN p_next_status IN ('under_review','cancelled')
    WHEN 'under_review' THEN p_next_status IN ('approved','cancelled','rejected')
    WHEN 'approved' THEN p_next_status IN ('preparing','cancelled')
    WHEN 'preparing' THEN p_next_status IN ('ready_for_delivery','cancelled')
    WHEN 'ready_for_delivery' THEN p_next_status='waiting_for_driver'
    WHEN 'waiting_for_driver' THEN p_next_status='out_for_delivery'
    WHEN 'out_for_delivery' THEN p_next_status IN ('arrived','delivered','delivery_failed')
    WHEN 'arrived' THEN p_next_status IN ('delivered','delivery_failed')
    WHEN 'delivered' THEN p_next_status='final_review'
    WHEN 'final_review' THEN p_next_status IN ('completed','delivery_failed')
    WHEN 'completed' THEN p_next_status='archived'
    WHEN 'pending' THEN p_next_status IN ('under_review','cancelled')
    WHEN 'confirmed' THEN p_next_status IN ('preparing','cancelled')
    WHEN 'processing' THEN p_next_status IN ('ready_for_delivery','cancelled')
    WHEN 'shipped' THEN p_next_status IN ('out_for_delivery','delivered')
    ELSE false END;
  IF NOT v_allowed THEN RAISE EXCEPTION 'Invalid order status transition' USING ERRCODE='22023'; END IF;
  IF v_order.user_id=v_actor AND p_next_status='cancelled' AND v_order.status IN ('new','under_review','pending') THEN
    v_permission:='orders.cancel';
  ELSE
    v_permission:=CASE p_next_status
      WHEN 'under_review' THEN 'orders.review' WHEN 'approved' THEN 'orders.approve' WHEN 'rejected' THEN 'orders.reject'
      WHEN 'preparing' THEN 'orders.prepare' WHEN 'ready_for_delivery' THEN 'orders.mark_ready'
      WHEN 'waiting_for_driver' THEN 'orders.assign_driver' WHEN 'out_for_delivery' THEN 'drivers.accept_orders'
      WHEN 'arrived' THEN 'drivers.confirm_delivery' WHEN 'delivered' THEN 'orders.confirm_delivery'
      WHEN 'final_review' THEN 'orders.review' WHEN 'completed' THEN 'orders.approve'
      WHEN 'archived' THEN 'orders.archive' WHEN 'cancelled' THEN 'orders.cancel'
      WHEN 'delivery_failed' THEN 'drivers.report_problem' ELSE 'orders.change_status' END;
    IF NOT public.has_permission(v_actor,v_permission,v_company) AND NOT public.has_permission(v_actor,v_permission) THEN
      RAISE EXCEPTION 'Permission denied for order transition' USING ERRCODE='42501';
    END IF;
  END IF;
  IF p_next_status IN ('out_for_delivery','arrived','delivered','delivery_failed') AND EXISTS (
    SELECT 1 FROM public.drivers d WHERE d.user_id=v_actor
  ) AND NOT EXISTS (
    SELECT 1 FROM public.order_driver_assignments a JOIN public.drivers d ON d.id=a.driver_id
    WHERE a.order_id=p_order_id AND d.user_id=v_actor
  ) THEN RAISE EXCEPTION 'Order is not assigned to this driver' USING ERRCODE='42501'; END IF;
  UPDATE public.orders SET status=p_next_status,cancel_reason=CASE WHEN p_next_status IN ('cancelled','delivery_failed','rejected') THEN p_reason ELSE cancel_reason END,updated_at=now() WHERE id=p_order_id;
  INSERT INTO public.order_status_history(order_id,changed_by,from_status,to_status,note)
  VALUES(p_order_id,v_actor,v_order.status,p_next_status,p_reason);
  IF v_order.user_id=v_actor AND p_next_status='cancelled' THEN
    FOR v_company IN SELECT DISTINCT f.company_id FROM public.company_order_fulfillments f WHERE f.order_id=p_order_id LOOP
      INSERT INTO public.company_order_status_history(order_id,company_id,from_status,to_status,actor_user_id,note)
      SELECT p_order_id,v_company,f.status,'cancelled',v_actor,p_reason
      FROM public.company_order_fulfillments f WHERE f.order_id=p_order_id AND f.company_id=v_company;
      UPDATE public.company_order_fulfillments SET status='cancelled',cancel_reason=p_reason,updated_by=v_actor,updated_at=now()
      WHERE order_id=p_order_id AND company_id=v_company AND status IN ('new','under_review','approved');
    END LOOP;
    IF (SELECT count(DISTINCT oi.company_id) FROM public.order_items oi WHERE oi.order_id=p_order_id AND oi.company_id IS NOT NULL)>1 THEN
      v_company:=NULL;
    END IF;
  ELSIF v_company IS NOT NULL THEN
    INSERT INTO public.company_order_status_history(order_id,company_id,from_status,to_status,actor_user_id,note)
    VALUES(p_order_id,v_company,v_order.status,p_next_status,v_actor,p_reason);
  END IF;
  INSERT INTO public.audit_logs(actor_user_id,company_id,action,resource_type,resource_id,before_data,after_data,reason)
  VALUES(v_actor,v_company,'order.status_transition','order',p_order_id::text,jsonb_build_object('status',v_order.status),jsonb_build_object('status',p_next_status),p_reason);
  RETURN p_next_status;
END $$;
REVOKE ALL ON FUNCTION public.transition_order_status(uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transition_order_status(uuid,text,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_driver_collection(p_assignment_id uuid,p_status text,p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_assignment public.order_driver_assignments%ROWTYPE; v_driver_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_status NOT IN ('collected','not_collected') OR (p_status='not_collected' AND NULLIF(btrim(p_note),'') IS NULL) THEN
    RAISE EXCEPTION 'Invalid collection update' USING ERRCODE='22023';
  END IF;
  SELECT a,d.user_id INTO v_assignment,v_driver_id FROM public.order_driver_assignments a JOIN public.drivers d ON d.id=a.driver_id WHERE a.id=p_assignment_id FOR UPDATE OF a;
  IF NOT FOUND OR v_driver_id<>auth.uid() THEN RAISE EXCEPTION 'Assignment not found' USING ERRCODE='42501'; END IF;
  IF NOT public.has_permission(auth.uid(),'drivers.confirm_collection',v_assignment.company_id) AND NOT public.has_permission(auth.uid(),'drivers.confirm_collection') THEN
    RAISE EXCEPTION 'Collection permission denied' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.order_driver_assignments a WHERE a.id=p_assignment_id AND a.arrived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Collection can only be recorded after arrival' USING ERRCODE='22023';
  END IF;
  IF v_assignment.collection_status<>'pending' THEN RAISE EXCEPTION 'Collection already recorded' USING ERRCODE='23505'; END IF;
  UPDATE public.order_driver_assignments SET collection_status=p_status,collection_note=p_note,updated_at=now() WHERE id=p_assignment_id;
  UPDATE public.company_order_fulfillments SET collection_status=p_status,collection_note=p_note,updated_at=now()
    WHERE order_id=v_assignment.order_id AND company_id=v_assignment.company_id;
  UPDATE public.orders o SET collection_status=(
    SELECT CASE WHEN bool_and(f.collection_status='collected') THEN 'collected'
      WHEN bool_or(f.collection_status='not_collected') THEN 'not_collected' ELSE 'pending' END
    FROM public.company_order_fulfillments f WHERE f.order_id=v_assignment.order_id
  ),updated_at=now() WHERE o.id=v_assignment.order_id;
  INSERT INTO public.audit_logs(actor_user_id,company_id,action,resource_type,resource_id,before_data,after_data,reason)
  SELECT auth.uid(),COALESCE(v_assignment.company_id,o.company_id),'driver.collection_recorded','order_driver_assignment',p_assignment_id::text,
    jsonb_build_object('collection_status','pending'),jsonb_build_object('collection_status',p_status),p_note
  FROM public.orders o WHERE o.id=v_assignment.order_id;
END $$;
REVOKE ALL ON FUNCTION public.record_driver_collection(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_driver_collection(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_company_order_driver(p_order_id uuid,p_company_id uuid,p_driver_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor uuid:=auth.uid(); v_driver public.drivers%ROWTYPE; v_assignment uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.has_permission(v_actor,'drivers.assign_orders',p_company_id) THEN
    RAISE EXCEPTION 'Driver assignment permission denied' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_driver FROM public.drivers WHERE id=p_driver_id AND status='active' FOR UPDATE;
  IF NOT FOUND OR (v_driver.driver_type='company' AND v_driver.company_id<>p_company_id) THEN
    RAISE EXCEPTION 'Driver is unavailable for this company' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.company_order_fulfillments WHERE order_id=p_order_id AND company_id=p_company_id AND status='waiting_for_driver' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Company order is not waiting for a driver' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.order_driver_assignments WHERE order_id=p_order_id AND company_id=p_company_id) THEN
    RAISE EXCEPTION 'A driver is already assigned' USING ERRCODE='23505';
  END IF;
  INSERT INTO public.order_driver_assignments(order_id,company_id,driver_id,assigned_by)
    VALUES(p_order_id,p_company_id,p_driver_id,v_actor) RETURNING id INTO v_assignment;
  UPDATE public.company_order_fulfillments SET assigned_driver_id=p_driver_id,updated_at=now()
    WHERE order_id=p_order_id AND company_id=p_company_id;
  UPDATE public.orders SET assigned_driver_id=p_driver_id,updated_at=now()
    WHERE id=p_order_id AND company_id=p_company_id;
  INSERT INTO public.audit_logs(actor_user_id,company_id,action,resource_type,resource_id,after_data)
    VALUES(v_actor,p_company_id,'driver.assigned','order_driver_assignment',v_assignment::text,jsonb_build_object('order_id',p_order_id,'driver_id',p_driver_id));
  RETURN v_assignment;
END $$;
REVOKE ALL ON FUNCTION public.assign_company_order_driver(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assign_company_order_driver(uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_company_fulfillment_order(p_order_id uuid,p_company_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor uuid:=auth.uid(); v_driver public.drivers%ROWTYPE; v_assigned uuid; v_assignment uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  SELECT * INTO v_driver FROM public.drivers WHERE user_id=v_actor AND status='active' FOR UPDATE;
  IF NOT FOUND OR NOT public.has_permission(v_actor,'drivers.accept_orders',p_company_id) AND NOT public.has_permission(v_actor,'drivers.accept_orders') THEN
    RAISE EXCEPTION 'Active driver permission required' USING ERRCODE='42501';
  END IF;
  IF v_driver.driver_type='company' AND v_driver.company_id<>p_company_id THEN RAISE EXCEPTION 'Company scope denied' USING ERRCODE='42501'; END IF;
  SELECT assigned_driver_id INTO v_assigned FROM public.company_order_fulfillments
    WHERE order_id=p_order_id AND company_id=p_company_id AND status='waiting_for_driver' FOR UPDATE;
  IF NOT FOUND OR (v_assigned IS NOT NULL AND v_assigned<>v_driver.id) THEN RAISE EXCEPTION 'Order is unavailable' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.order_driver_assignments WHERE order_id=p_order_id AND company_id=p_company_id) THEN RAISE EXCEPTION 'Order already assigned' USING ERRCODE='23505'; END IF;
  INSERT INTO public.order_driver_assignments(order_id,company_id,driver_id,assigned_by,accepted_at)
    VALUES(p_order_id,p_company_id,v_driver.id,NULL,now()) RETURNING id INTO v_assignment;
  UPDATE public.company_order_fulfillments SET assigned_driver_id=v_driver.id,updated_at=now()
    WHERE order_id=p_order_id AND company_id=p_company_id;
  INSERT INTO public.audit_logs(actor_user_id,company_id,action,resource_type,resource_id,after_data)
    VALUES(v_actor,p_company_id,'driver.accepted_order','order_driver_assignment',v_assignment::text,jsonb_build_object('order_id',p_order_id,'driver_id',v_driver.id));
  RETURN v_assignment;
END $$;
REVOKE ALL ON FUNCTION public.accept_company_fulfillment_order(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_company_fulfillment_order(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_company_fulfillment(
  p_order_id uuid,p_company_id uuid,p_next_status text,p_reason text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor uuid:=auth.uid(); v_current text; v_permission text; v_allowed boolean:=false; v_driver public.drivers%ROWTYPE; v_assignment public.order_driver_assignments%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  SELECT status INTO v_current FROM public.company_order_fulfillments
    WHERE order_id=p_order_id AND company_id=p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Company fulfillment not found' USING ERRCODE='P0002'; END IF;
  IF p_next_status IN ('cancelled','rejected','delivery_failed') AND NULLIF(btrim(p_reason),'') IS NULL THEN
    RAISE EXCEPTION 'A reason is required for this transition' USING ERRCODE='22023';
  END IF;
  v_allowed:=CASE v_current
    WHEN 'new' THEN p_next_status='under_review'
    WHEN 'under_review' THEN p_next_status IN ('approved','rejected','cancelled')
    WHEN 'approved' THEN p_next_status IN ('preparing','cancelled')
    WHEN 'preparing' THEN p_next_status IN ('ready_for_delivery','cancelled')
    WHEN 'ready_for_delivery' THEN p_next_status='waiting_for_driver'
    WHEN 'waiting_for_driver' THEN p_next_status='out_for_delivery'
    WHEN 'out_for_delivery' THEN p_next_status IN ('arrived','delivery_failed')
    WHEN 'arrived' THEN p_next_status IN ('delivered','delivery_failed')
    WHEN 'delivered' THEN p_next_status='final_review'
    WHEN 'final_review' THEN p_next_status IN ('completed','delivery_failed')
    WHEN 'completed' THEN p_next_status='archived'
    ELSE false END;
  IF NOT v_allowed THEN RAISE EXCEPTION 'Invalid company fulfillment transition' USING ERRCODE='22023'; END IF;
  IF p_next_status IN ('out_for_delivery','arrived','delivered','delivery_failed') THEN
    SELECT * INTO v_driver FROM public.drivers WHERE user_id=v_actor AND status='active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Only an active assigned driver may update delivery status' USING ERRCODE='42501'; END IF;
    SELECT * INTO v_assignment FROM public.order_driver_assignments
      WHERE order_id=p_order_id AND company_id=p_company_id AND driver_id=v_driver.id FOR UPDATE;
    IF NOT FOUND OR (v_driver.driver_type='company' AND v_driver.company_id<>p_company_id) THEN
      RAISE EXCEPTION 'Order is not assigned to this driver' USING ERRCODE='42501';
    END IF;
    IF p_next_status='out_for_delivery' AND v_assignment.accepted_at IS NULL THEN RAISE EXCEPTION 'Accept the order before starting delivery' USING ERRCODE='22023'; END IF;
    IF p_next_status='arrived' AND v_assignment.started_at IS NULL THEN RAISE EXCEPTION 'Delivery has not started' USING ERRCODE='22023'; END IF;
    IF p_next_status='delivered' AND v_assignment.arrived_at IS NULL THEN RAISE EXCEPTION 'Arrival must be recorded before delivery' USING ERRCODE='22023'; END IF;
  END IF;
  v_permission:=CASE p_next_status
    WHEN 'under_review' THEN 'orders.review' WHEN 'approved' THEN 'orders.approve' WHEN 'rejected' THEN 'orders.reject'
    WHEN 'preparing' THEN 'orders.prepare' WHEN 'ready_for_delivery' THEN 'orders.mark_ready'
    WHEN 'waiting_for_driver' THEN 'orders.assign_driver' WHEN 'out_for_delivery' THEN 'drivers.accept_orders'
    WHEN 'arrived' THEN 'drivers.confirm_delivery' WHEN 'delivered' THEN 'drivers.confirm_delivery'
    WHEN 'final_review' THEN 'orders.review' WHEN 'completed' THEN 'orders.approve'
    WHEN 'archived' THEN 'orders.archive' WHEN 'cancelled' THEN 'orders.cancel'
    WHEN 'delivery_failed' THEN 'drivers.report_problem' ELSE 'orders.change_status' END;
  IF NOT public.has_permission(v_actor,v_permission,p_company_id) AND NOT public.has_permission(v_actor,v_permission) THEN
    RAISE EXCEPTION 'Permission denied for company fulfillment' USING ERRCODE='42501';
  END IF;
  UPDATE public.company_order_fulfillments SET status=p_next_status,updated_by=v_actor,updated_at=now(),
    rejection_reason=CASE WHEN p_next_status='rejected' THEN p_reason ELSE rejection_reason END,
    cancel_reason=CASE WHEN p_next_status IN ('cancelled','delivery_failed') THEN p_reason ELSE cancel_reason END
    WHERE order_id=p_order_id AND company_id=p_company_id;
  INSERT INTO public.company_order_status_history(order_id,company_id,from_status,to_status,actor_user_id,note)
    VALUES(p_order_id,p_company_id,v_current,p_next_status,v_actor,p_reason);
  INSERT INTO public.order_status_history(order_id,changed_by,from_status,to_status,note)
    VALUES(p_order_id,v_actor,v_current,p_next_status,p_reason);
  IF p_next_status IN ('out_for_delivery','arrived','delivered','delivery_failed') THEN
    UPDATE public.order_driver_assignments SET
      started_at=CASE WHEN p_next_status='out_for_delivery' THEN COALESCE(started_at,now()) ELSE started_at END,
      arrived_at=CASE WHEN p_next_status='arrived' THEN COALESCE(arrived_at,now()) ELSE arrived_at END,
      delivered_at=CASE WHEN p_next_status='delivered' THEN COALESCE(delivered_at,now()) ELSE delivered_at END,
      problem_note=CASE WHEN p_next_status='delivery_failed' THEN p_reason ELSE problem_note END,
      updated_at=now()
    WHERE order_id=p_order_id AND company_id=p_company_id AND driver_id=v_driver.id;
  END IF;
  INSERT INTO public.audit_logs(actor_user_id,company_id,action,resource_type,resource_id,before_data,after_data,reason)
    VALUES(v_actor,p_company_id,'company_fulfillment.status_transition','company_order_fulfillment',p_order_id::text,
      jsonb_build_object('status',v_current),jsonb_build_object('status',p_next_status),p_reason);
  UPDATE public.orders o SET status=(
    SELECT CASE
      WHEN bool_and(f.status IN ('archived')) THEN 'archived'
      WHEN bool_and(f.status IN ('completed','archived')) THEN 'completed'
      WHEN bool_and(f.status IN ('final_review','completed','archived')) THEN 'final_review'
      WHEN bool_and(f.status IN ('delivered','final_review','completed','archived')) THEN 'delivered'
      WHEN bool_or(f.status='delivery_failed') THEN 'delivery_failed'
      WHEN bool_or(f.status IN ('out_for_delivery','arrived')) THEN 'out_for_delivery'
      WHEN bool_or(f.status IN ('ready_for_delivery','waiting_for_driver')) THEN 'ready_for_delivery'
      WHEN bool_or(f.status='preparing') THEN 'preparing'
      WHEN bool_or(f.status='approved') THEN 'approved'
      WHEN bool_or(f.status='under_review') THEN 'under_review'
      WHEN bool_or(f.status='cancelled') THEN 'cancelled'
      ELSE 'new' END
    FROM public.company_order_fulfillments f WHERE f.order_id=p_order_id
  ),updated_at=now() WHERE o.id=p_order_id;
  RETURN p_next_status;
END $$;
REVOKE ALL ON FUNCTION public.transition_company_fulfillment(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transition_company_fulfillment(uuid,uuid,text,text) TO authenticated;

-- Backwards-compatible RPC entry point used by the existing merchant Edge Function.
DROP FUNCTION IF EXISTS public.update_order_status(uuid,text,text);
CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id uuid,p_new_status text,p_note text DEFAULT NULL,p_caller_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor uuid:=auth.uid(); v_order public.orders%ROWTYPE; v_permission text; v_company uuid; v_allowed boolean:=false;
BEGIN
  IF COALESCE(auth.jwt()->>'role','')='service_role' THEN v_actor:=p_caller_id; END IF;
  IF v_actor IS NULL OR (p_caller_id IS NOT NULL AND p_caller_id<>v_actor) THEN RAISE EXCEPTION 'Unauthorized actor' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
  IF p_new_status NOT IN ('pending','confirmed','processing','shipped','out_for_delivery','delivered','completed','cancelled','returned','refunded','new','under_review','approved','preparing','ready_for_delivery','waiting_for_driver','arrived','final_review','delivery_failed','archived','rejected') THEN
    RAISE EXCEPTION 'Invalid order status' USING ERRCODE='22023';
  END IF;
  IF p_new_status IN ('cancelled','rejected','delivery_failed','returned','refunded') AND NULLIF(btrim(p_note),'') IS NULL THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE='22023';
  END IF;
  v_company:=v_order.company_id;
  IF v_company IS NULL THEN
    SELECT oi.company_id INTO v_company FROM public.order_items oi
    WHERE oi.order_id=p_order_id AND oi.company_id IS NOT NULL
      AND (oi.merchant_id=v_actor OR public.has_permission(v_actor,'orders.view',oi.company_id))
    ORDER BY oi.company_id LIMIT 1;
  END IF;
  v_allowed:=CASE v_order.status
    WHEN 'new' THEN p_new_status='under_review'
    WHEN 'under_review' THEN p_new_status IN ('approved','cancelled','rejected')
    WHEN 'approved' THEN p_new_status IN ('preparing','cancelled')
    WHEN 'preparing' THEN p_new_status IN ('ready_for_delivery','cancelled')
    WHEN 'ready_for_delivery' THEN p_new_status='waiting_for_driver'
    WHEN 'waiting_for_driver' THEN p_new_status='out_for_delivery'
    WHEN 'out_for_delivery' THEN p_new_status IN ('arrived','delivered','delivery_failed')
    WHEN 'arrived' THEN p_new_status IN ('delivered','delivery_failed')
    WHEN 'delivered' THEN p_new_status='final_review'
    WHEN 'final_review' THEN p_new_status IN ('completed','delivery_failed')
    WHEN 'completed' THEN p_new_status='archived'
    WHEN 'pending' THEN p_new_status IN ('confirmed','under_review','cancelled')
    WHEN 'confirmed' THEN p_new_status IN ('processing','preparing','cancelled')
    WHEN 'processing' THEN p_new_status IN ('shipped','ready_for_delivery','cancelled')
    WHEN 'shipped' THEN p_new_status IN ('out_for_delivery','delivered')
    ELSE false END;
  IF NOT v_allowed THEN RAISE EXCEPTION 'Invalid order status transition' USING ERRCODE='22023'; END IF;
  IF (SELECT count(DISTINCT oi.company_id) FROM public.order_items oi WHERE oi.order_id=p_order_id AND oi.company_id IS NOT NULL)>1
     AND NOT public.has_permission(v_actor,'orders.change_status') THEN
    RAISE EXCEPTION 'Multi-company order must be fulfilled through company-scoped fulfillment records' USING ERRCODE='42501';
  END IF;
  IF v_order.user_id=v_actor AND p_new_status='cancelled' AND v_order.status IN ('pending','new','under_review') THEN
    v_permission:='orders.cancel';
  ELSE
    v_permission:=CASE p_new_status WHEN 'confirmed' THEN 'orders.approve' WHEN 'approved' THEN 'orders.approve' WHEN 'processing' THEN 'orders.prepare' WHEN 'preparing' THEN 'orders.prepare' WHEN 'shipped' THEN 'orders.mark_ready' WHEN 'out_for_delivery' THEN 'drivers.accept_orders' WHEN 'arrived' THEN 'drivers.confirm_delivery' WHEN 'delivered' THEN 'orders.confirm_delivery' WHEN 'completed' THEN 'orders.approve' WHEN 'archived' THEN 'orders.archive' WHEN 'cancelled' THEN 'orders.cancel' WHEN 'rejected' THEN 'orders.reject' WHEN 'delivery_failed' THEN 'drivers.report_problem' ELSE 'orders.change_status' END;
    IF NOT public.has_permission(v_actor,v_permission,v_company) AND NOT public.has_permission(v_actor,v_permission) THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
  END IF;
  UPDATE public.orders SET status=p_new_status,cancel_reason=CASE WHEN p_new_status IN ('cancelled','rejected','delivery_failed') THEN p_note ELSE cancel_reason END,updated_at=now() WHERE id=p_order_id;
  INSERT INTO public.audit_logs(actor_user_id,company_id,action,resource_type,resource_id,before_data,after_data,reason)
  VALUES(v_actor,v_company,'order.status_transition','order',p_order_id::text,jsonb_build_object('status',v_order.status),jsonb_build_object('status',p_new_status),p_note);
  INSERT INTO public.order_status_history(order_id,changed_by,from_status,to_status,note)
  VALUES(p_order_id,v_actor,v_order.status,p_new_status,p_note);
  RETURN p_new_status;
END $$;
REVOKE ALL ON FUNCTION public.update_order_status(uuid,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_order_status(uuid,text,text,uuid) TO authenticated,service_role;

-- One-time bootstrap is intentionally unavailable to ordinary authenticated clients. The caller
-- must invoke it through a trusted server/service-role context after verifying the account owner.
CREATE OR REPLACE FUNCTION public.bootstrap_platform_owner(p_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_role_id uuid; v_membership_id uuid;
BEGIN
  IF COALESCE(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'Bootstrap requires service role' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_user_id) THEN RAISE EXCEPTION 'User not found' USING ERRCODE='P0002'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_memberships m JOIN public.roles r ON r.id=m.role_id WHERE r.key='platform_owner' AND m.status='active') THEN
    RAISE EXCEPTION 'Platform owner already bootstrapped' USING ERRCODE='23505';
  END IF;
  SELECT id INTO v_role_id FROM public.roles WHERE key='platform_owner';
  INSERT INTO public.user_memberships(user_id,role_id,company_id,status) VALUES(p_user_id,v_role_id,NULL,'active') RETURNING id INTO v_membership_id;
  INSERT INTO public.audit_logs(actor_user_id,action,resource_type,resource_id,after_data,reason)
    VALUES(p_user_id,'platform_owner.bootstrap','user_membership',v_membership_id::text,jsonb_build_object('role','platform_owner'),'One-time bootstrap');
  RETURN v_membership_id;
END $$;
REVOKE ALL ON FUNCTION public.bootstrap_platform_owner(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_platform_owner(uuid) TO service_role;

-- Audit history is append-only, including for platform owners.
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Audit logs are append-only' USING ERRCODE='42501'; END $$;
DROP TRIGGER IF EXISTS audit_logs_no_update ON public.audit_logs;
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();

COMMENT ON TABLE public.user_memberships IS 'Authorization memberships; profiles.role is compatibility-only.';
COMMENT ON TABLE public.audit_logs IS 'Append-only security and business audit trail. Mutations must use trusted server-side code.';
COMMENT ON FUNCTION public.transition_order_status(uuid,text,uuid,text) IS 'Validates actor, permission, company scope, transition graph, driver assignment and audit trail.';
