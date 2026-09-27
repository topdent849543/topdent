-- Financial ledger safeguards, payout RPC restrictions, and affiliate click handling.
-- Split from the reviewed RBAC rollout to keep schema, policy, finance, and workflow changes auditable.

CREATE OR REPLACE FUNCTION public.audit_financial_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_before jsonb; v_after jsonb; v_action text; v_user uuid;
BEGIN
  v_user:=COALESCE(auth.uid(),NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid);
  v_action:=TG_TABLE_NAME||'.'||lower(TG_OP);
  IF TG_OP<>'INSERT' THEN v_before:=jsonb_build_object('id',OLD.id,'user_id',OLD.user_id,'status',to_jsonb(OLD)->>'status','amount',to_jsonb(OLD)->>'amount','type',to_jsonb(OLD)->>'type'); END IF;
  IF TG_OP<>'DELETE' THEN v_after:=jsonb_build_object('id',NEW.id,'user_id',NEW.user_id,'status',to_jsonb(NEW)->>'status','amount',to_jsonb(NEW)->>'amount','type',to_jsonb(NEW)->>'type','payment_method',to_jsonb(NEW)->>'payment_method','is_active',to_jsonb(NEW)->>'is_active'); END IF;
  INSERT INTO public.audit_logs(actor_user_id,action,resource_type,resource_id,before_data,after_data,reason)
    VALUES(v_user,v_action,TG_TABLE_NAME,COALESCE(to_jsonb(NEW)->>'id',to_jsonb(OLD)->>'id'),v_before,v_after,
      COALESCE(to_jsonb(NEW)->>'admin_note',to_jsonb(NEW)->>'admin_notes',to_jsonb(NEW)->>'rejection_reason'));
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS wallets_financial_audit ON public.wallets;
CREATE TRIGGER wallets_financial_audit AFTER UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION public.audit_financial_mutation();
DROP TRIGGER IF EXISTS wallet_transactions_financial_audit ON public.wallet_transactions;
CREATE TRIGGER wallet_transactions_financial_audit AFTER INSERT ON public.wallet_transactions FOR EACH ROW EXECUTE FUNCTION public.audit_financial_mutation();
DROP TRIGGER IF EXISTS withdrawals_financial_audit ON public.withdrawal_requests;
CREATE TRIGGER withdrawals_financial_audit AFTER INSERT OR UPDATE ON public.withdrawal_requests FOR EACH ROW EXECUTE FUNCTION public.audit_financial_mutation();
DROP TRIGGER IF EXISTS affiliate_links_financial_audit ON public.affiliate_links;
CREATE TRIGGER affiliate_links_financial_audit AFTER INSERT OR UPDATE OR DELETE ON public.affiliate_links FOR EACH ROW EXECUTE FUNCTION public.audit_financial_mutation();
DROP TRIGGER IF EXISTS wallet_topups_financial_audit ON public.wallet_topup_requests;
CREATE TRIGGER wallet_topups_financial_audit AFTER INSERT OR UPDATE ON public.wallet_topup_requests FOR EACH ROW EXECUTE FUNCTION public.audit_financial_mutation();
DROP TRIGGER IF EXISTS withdrawal_settings_financial_audit ON public.withdrawal_settings;
CREATE TRIGGER withdrawal_settings_financial_audit AFTER INSERT OR UPDATE ON public.withdrawal_settings FOR EACH ROW EXECUTE FUNCTION public.audit_financial_mutation();

-- Legacy payout helpers are safe only when they never move funds before the recorded hold period.
-- Publishers can request matured releases for the system; only service_role can call the raw batch.
REVOKE ALL ON FUNCTION public.release_pending_earnings() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_pending_earnings() TO service_role;
CREATE OR REPLACE FUNCTION public.release_due_earnings()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF auth.uid() IS NULL AND COALESCE(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.has_permission(auth.uid(),'affiliate.manage_self') AND
    NOT public.has_permission(auth.uid(),'finance.view') AND NOT EXISTS (
      SELECT 1 FROM public.user_memberships m JOIN public.roles r ON r.id=m.role_id
      WHERE m.user_id=auth.uid() AND m.status='active' AND r.key IN ('company_manager','company_admin')) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';
  END IF;
  PERFORM public.release_pending_earnings();
  INSERT INTO public.audit_logs(actor_user_id,action,resource_type,resource_id,after_data,reason)
    VALUES(auth.uid(),'finance.matured_earnings_release_checked','wallet_batch',NULL,jsonb_build_object('cutoff','hold_until <= now()'),'Only matured earnings are released');
END $$;
REVOKE ALL ON FUNCTION public.release_due_earnings() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.release_due_earnings() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.release_affiliate_instant(p_user_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS NOT NULL AND p_user_id<>auth.uid() AND COALESCE(auth.jwt()->>'role','')<>'service_role' THEN
    RAISE EXCEPTION 'Cannot release another user\'s earnings' USING ERRCODE='42501';
  END IF;
  IF auth.uid() IS NULL AND COALESCE(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  PERFORM public.release_due_earnings();
END $$;
REVOKE ALL ON FUNCTION public.release_affiliate_instant(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.release_affiliate_instant(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.track_affiliate_click(p_affiliate_code text,p_user_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_link public.affiliate_links%ROWTYPE;
BEGIN
  SELECT * INTO v_link FROM public.affiliate_links WHERE affiliate_code=p_affiliate_code AND is_active=true;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id=v_link.product_id AND p.status='active' AND p.approval_status='approved') THEN RETURN; END IF;
  UPDATE public.affiliate_links SET clicks_count=clicks_count+1 WHERE id=v_link.id;
  INSERT INTO public.affiliate_clicks(affiliate_link_id,product_id,user_id) VALUES(v_link.id,v_link.product_id,auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.track_affiliate_click(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_affiliate_click(text,uuid) TO anon,authenticated;
