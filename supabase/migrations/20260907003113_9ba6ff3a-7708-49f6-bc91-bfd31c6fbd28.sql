-- 1. Verificação por lista explícita de funções
CREATE OR REPLACE FUNCTION public.assert_app_role(_allowed text[])
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária para esta operação.';
  END IF;
  SELECT role INTO v FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v IS NULL THEN
    RAISE EXCEPTION 'Perfil sem função atribuída. Contacte o responsável.';
  END IF;
  IF NOT (v = ANY(_allowed)) THEN
    RAISE EXCEPTION 'Sem permissão para esta operação (função: %).', v;
  END IF;
END;
$$;

-- 2. Injeção da verificação nas funções mutáveis expostas
DO $do$
DECLARE
  r record;
  def text;
  guard text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.apply_count_delta(uuid,integer,text)',              'master,admin,operator'),
    ('public.set_count_quantity(uuid,integer,integer,text)',      'master,admin,operator'),
    ('public.assign_count_location(uuid,text)',                   'master,admin,operator'),
    ('public.merge_colis_counts(uuid,uuid,integer,text)',         'master,admin,operator'),
    ('public.split_colis_counts(uuid,uuid,integer,jsonb)',        'master,admin,operator'),
    ('public.putaway_counts(uuid[],text)',                        'master,admin,operator'),
    ('public.complete_location_audit(uuid,boolean)',              'master,admin,operator'),
    ('public.register_entry(uuid,jsonb,text,text,text,text)',     'master,admin,operator,warehouse_operator'),
    ('public.transfer_stock_location(jsonb)',                     'master,admin,operator,warehouse_operator'),
    ('public.stage_picking_to_dock(uuid,text,jsonb)',             'master,admin,operator,warehouse_operator'),
    ('public.load_notes_to_vehicle(uuid[],text,jsonb)',           'master,admin,operator,warehouse_operator'),
    ('public.deliver_location_audit(uuid)',                       'master,admin,operator,warehouse_operator')
  ) AS t(sig, roles)
  LOOP
    def := pg_get_functiondef(r.sig::regprocedure);
    IF def LIKE '%assert_app_role%' THEN CONTINUE; END IF;
    guard := E'\nBEGIN\n  PERFORM public.assert_app_role(ARRAY[' ||
      (SELECT string_agg(quote_literal(btrim(x)), ',') FROM unnest(string_to_array(r.roles, ',')) x) ||
      E']);\n';
    def := regexp_replace(def, E'\nBEGIN\n', guard);
    IF def NOT LIKE '%assert_app_role%' THEN
      RAISE EXCEPTION 'Não foi possível injetar a verificação em %', r.sig;
    END IF;
    EXECUTE def;
  END LOOP;
END;
$do$;

-- 3. Nenhuma função acessível a visitantes; auxiliares internos fora do alcance do cliente
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE EXECUTE ON FUNCTION public.move_stock_qty(uuid,integer,integer,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.debit_counts_at(uuid,integer,integer,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.assert_valid_location(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_quarantine_location(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.dedupe_counts_same_place() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.assert_operational_actor() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.assert_app_role(text[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_audit_access_code() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_route_barcode() FROM authenticated;

-- 4. Conferências: o operador de armazém só regista o contado
CREATE OR REPLACE FUNCTION public.wo_guard_location_audits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(current_setting('app.wms_rpc', true), '') = '1' THEN RETURN NEW; END IF;
  IF NOT public.is_warehouse_operator(auth.uid()) THEN RETURN NEW; END IF;

  IF OLD.assigned_to IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Conferência não atribuída a si.';
  END IF;
  IF OLD.status = 'completed' OR OLD.delivered_at IS NOT NULL THEN
    RAISE EXCEPTION 'Conferência já entregue ou fechada.';
  END IF;

  -- Só é permitido iniciar a recolha
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.status = 'pending' AND NEW.status = 'in_progress') THEN
    RAISE EXCEPTION 'O operador não pode alterar o estado da conferência.';
  END IF;

  NEW.id := OLD.id;
  NEW.name := OLD.name;
  NEW.locations := OLD.locations;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  NEW.completed_at := OLD.completed_at;
  NEW.delivered_at := OLD.delivered_at;
  NEW.delivered_by := OLD.delivered_by;
  NEW.assigned_to := OLD.assigned_to;
  NEW.blind_mode := OLD.blind_mode;
  NEW.access_code := OLD.access_code;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wo_guard_location_audits ON public.location_audits;
CREATE TRIGGER wo_guard_location_audits
BEFORE UPDATE ON public.location_audits
FOR EACH ROW EXECUTE FUNCTION public.wo_guard_location_audits();

CREATE OR REPLACE FUNCTION public.wo_guard_location_audit_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE a public.location_audits;
BEGIN
  IF COALESCE(current_setting('app.wms_rpc', true), '') = '1' THEN RETURN NEW; END IF;
  IF NOT public.is_warehouse_operator(auth.uid()) THEN RETURN NEW; END IF;

  SELECT * INTO a FROM public.location_audits WHERE id = OLD.audit_id;
  IF a.assigned_to IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Conferência não atribuída a si.';
  END IF;
  IF a.status = 'completed' OR a.delivered_at IS NOT NULL THEN
    RAISE EXCEPTION 'Conferência já entregue ou fechada.';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('pending','counted') THEN
    RAISE EXCEPTION 'Estado de linha não permitido.';
  END IF;

  -- Campos congelados: só o contado, o motivo e a autoria própria mudam
  NEW.id := OLD.id;
  NEW.audit_id := OLD.audit_id;
  NEW.product_id := OLD.product_id;
  NEW.product_code := OLD.product_code;
  NEW.product_name := OLD.product_name;
  NEW.location := OLD.location;
  NEW.colis_number := OLD.colis_number;
  NEW.expected_quantity := OLD.expected_quantity;
  NEW.applied_at := OLD.applied_at;
  NEW.movement_id := OLD.movement_id;
  NEW.quantity_before := OLD.quantity_before;
  NEW.quantity_after := OLD.quantity_after;
  NEW.created_at := OLD.created_at;
  NEW.counted_by := auth.uid();
  NEW.difference := COALESCE(NEW.counted_quantity, 0) - OLD.expected_quantity;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wo_guard_location_audit_items ON public.location_audit_items;
CREATE TRIGGER wo_guard_location_audit_items
BEFORE UPDATE ON public.location_audit_items
FOR EACH ROW EXECUTE FUNCTION public.wo_guard_location_audit_items();

-- 5. Tarefas de separação: o operador não altera rota, origem, titularidade nem fecho
CREATE OR REPLACE FUNCTION public.wo_guard_picking_tasks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(current_setting('app.wms_rpc', true), '') = '1' THEN RETURN NEW; END IF;
  IF NOT public.is_warehouse_operator(auth.uid()) THEN RETURN NEW; END IF;

  IF OLD.status IN ('completed','cancelled') THEN
    RAISE EXCEPTION 'Tarefa fechada.';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.status = 'pending' AND NEW.status = 'in_progress') THEN
    RAISE EXCEPTION 'O operador não pode fechar nem cancelar tarefas de separação.';
  END IF;

  NEW.id := OLD.id;
  NEW.name := OLD.name;
  NEW.reference := OLD.reference;
  NEW.source := OLD.source;
  NEW.route_id := OLD.route_id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  NEW.completed_at := OLD.completed_at;
  NEW.cancelled_at := OLD.cancelled_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wo_guard_picking_tasks ON public.scanner_picking_tasks;
CREATE TRIGGER wo_guard_picking_tasks
BEFORE UPDATE ON public.scanner_picking_tasks
FOR EACH ROW EXECUTE FUNCTION public.wo_guard_picking_tasks();