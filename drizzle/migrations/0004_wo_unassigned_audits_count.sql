DROP POLICY IF EXISTS wo_auditoria_update ON public.location_audits;
CREATE POLICY wo_auditoria_update ON public.location_audits AS RESTRICTIVE FOR UPDATE
USING ((NOT public.is_warehouse_operator(auth.uid())) OR assigned_to = auth.uid() OR assigned_to IS NULL);

DROP POLICY IF EXISTS wo_auditoria_item_update ON public.location_audit_items;
CREATE POLICY wo_auditoria_item_update ON public.location_audit_items AS RESTRICTIVE FOR UPDATE
USING ((NOT public.is_warehouse_operator(auth.uid())) OR EXISTS (
  SELECT 1 FROM public.location_audits a
  WHERE a.id = location_audit_items.audit_id
    AND (a.assigned_to = auth.uid() OR a.assigned_to IS NULL)
    AND a.status <> 'completed'));

CREATE OR REPLACE FUNCTION public.wo_guard_location_audit_items()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE a public.location_audits;
BEGIN
  IF COALESCE(current_setting('app.wms_rpc', true), '') = '1' THEN RETURN NEW; END IF;
  IF NOT public.is_warehouse_operator(auth.uid()) THEN RETURN NEW; END IF;
  SELECT * INTO a FROM public.location_audits WHERE id = OLD.audit_id;
  IF a.assigned_to IS NOT NULL AND a.assigned_to IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Conferência não atribuída a si.';
  END IF;
  IF a.status = 'completed' OR a.delivered_at IS NOT NULL THEN
    RAISE EXCEPTION 'Conferência já entregue ou fechada.';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('pending','counted') THEN
    RAISE EXCEPTION 'Estado de linha não permitido.';
  END IF;
  NEW.id := OLD.id; NEW.audit_id := OLD.audit_id; NEW.product_id := OLD.product_id;
  NEW.product_code := OLD.product_code; NEW.product_name := OLD.product_name;
  NEW.location := OLD.location; NEW.colis_number := OLD.colis_number;
  NEW.expected_quantity := OLD.expected_quantity; NEW.applied_at := OLD.applied_at;
  NEW.movement_id := OLD.movement_id; NEW.quantity_before := OLD.quantity_before;
  NEW.quantity_after := OLD.quantity_after; NEW.created_at := OLD.created_at;
  NEW.counted_by := auth.uid();
  NEW.difference := COALESCE(NEW.counted_quantity, 0) - OLD.expected_quantity;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.wo_guard_location_audits()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(current_setting('app.wms_rpc', true), '') = '1' THEN RETURN NEW; END IF;
  IF NOT public.is_warehouse_operator(auth.uid()) THEN RETURN NEW; END IF;
  IF OLD.assigned_to IS NOT NULL AND OLD.assigned_to IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Conferência não atribuída a si.';
  END IF;
  IF OLD.status = 'completed' OR OLD.delivered_at IS NOT NULL THEN
    RAISE EXCEPTION 'Conferência já entregue ou fechada.';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.status = 'pending' AND NEW.status = 'in_progress') THEN
    RAISE EXCEPTION 'O operador não pode alterar o estado da conferência.';
  END IF;
  NEW.id := OLD.id; NEW.name := OLD.name; NEW.locations := OLD.locations;
  NEW.created_by := OLD.created_by; NEW.created_at := OLD.created_at;
  NEW.completed_at := OLD.completed_at; NEW.delivered_at := OLD.delivered_at;
  NEW.delivered_by := OLD.delivered_by; NEW.assigned_to := OLD.assigned_to;
  NEW.blind_mode := OLD.blind_mode; NEW.access_code := OLD.access_code;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.wo_guard_location_audits() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.wo_guard_location_audit_items() FROM PUBLIC, anon, authenticated;