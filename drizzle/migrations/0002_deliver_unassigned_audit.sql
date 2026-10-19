CREATE OR REPLACE FUNCTION public.deliver_location_audit(p_audit_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  a public.location_audits;
  v_pending integer;
BEGIN
  PERFORM set_config('app.wms_rpc', '1', true); PERFORM public.assert_app_role(ARRAY['master','admin','operator','warehouse_operator']);
  SELECT * INTO a FROM public.location_audits WHERE id = p_audit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conferência não encontrada.'; END IF;
  IF a.status = 'completed' THEN RAISE EXCEPTION 'Esta conferência já foi fechada.'; END IF;
  IF a.assigned_to IS NOT NULL
     AND a.assigned_to IS DISTINCT FROM uid
     AND a.created_by IS DISTINCT FROM uid
     AND NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'Sem permissão para entregar esta conferência.';
  END IF;
  SELECT count(*) INTO v_pending FROM public.location_audit_items WHERE audit_id = p_audit_id AND status <> 'counted';
  IF v_pending > 0 THEN RAISE EXCEPTION 'Faltam % artigo(s) por confirmar.', v_pending; END IF;
  IF a.delivered_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'ja_entregue', 'delivered_at', a.delivered_at);
  END IF;
  UPDATE public.location_audits SET delivered_at = now(), delivered_by = uid, updated_at = now() WHERE id = p_audit_id;
  RETURN jsonb_build_object('status', 'entregue');
END; $function$;