-- =====================================================================
-- PONTO 2 — Conferência por coli de ponta a ponta (picking e carregamento)
-- =====================================================================

-- 1. MODELO -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.picking_item_colis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.scanner_picking_task_items(id) ON DELETE CASCADE,
  colis_number integer NOT NULL CHECK (colis_number >= 1),
  requested_quantity integer NOT NULL DEFAULT 0 CHECK (requested_quantity >= 0),
  picked_quantity integer NOT NULL DEFAULT 0 CHECK (picked_quantity >= 0),
  from_location text,
  evidence text NOT NULL DEFAULT 'scan' CHECK (evidence IN ('scan','sweep','legacy_aggregate')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, colis_number)
);

GRANT SELECT ON public.picking_item_colis TO authenticated;
GRANT ALL ON public.picking_item_colis TO service_role;
ALTER TABLE public.picking_item_colis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Autenticados veem colis do picking" ON public.picking_item_colis;
CREATE POLICY "Autenticados veem colis do picking" ON public.picking_item_colis
  FOR SELECT TO authenticated USING (NOT public.is_driver_only(auth.uid()));

CREATE TABLE IF NOT EXISTS public.delivery_note_item_colis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_item_id uuid NOT NULL REFERENCES public.delivery_note_items(id) ON DELETE CASCADE,
  colis_number integer NOT NULL CHECK (colis_number >= 1),
  requested_quantity integer NOT NULL DEFAULT 0 CHECK (requested_quantity >= 0),
  staged_quantity integer NOT NULL DEFAULT 0 CHECK (staged_quantity >= 0),
  loaded_quantity integer NOT NULL DEFAULT 0 CHECK (loaded_quantity >= 0),
  location text,
  evidence text NOT NULL DEFAULT 'scan' CHECK (evidence IN ('scan','sweep','legacy_aggregate')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (note_item_id, colis_number)
);

GRANT SELECT ON public.delivery_note_item_colis TO authenticated;
GRANT ALL ON public.delivery_note_item_colis TO service_role;
ALTER TABLE public.delivery_note_item_colis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Autenticados veem colis da nota" ON public.delivery_note_item_colis;
CREATE POLICY "Autenticados veem colis da nota" ON public.delivery_note_item_colis
  FOR SELECT TO authenticated USING (NOT public.is_driver_only(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_pic_item ON public.picking_item_colis(item_id);
CREATE INDEX IF NOT EXISTS idx_dnic_item ON public.delivery_note_item_colis(note_item_id);

DROP TRIGGER IF EXISTS trg_pic_updated ON public.picking_item_colis;
CREATE TRIGGER trg_pic_updated BEFORE UPDATE ON public.picking_item_colis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_dnic_updated ON public.delivery_note_item_colis;
CREATE TRIGGER trg_dnic_updated BEFORE UPDATE ON public.delivery_note_item_colis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. AUXILIARES -------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_picking_item_colis(p_item_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE it RECORD; v_total integer; c integer;
BEGIN
  SELECT * INTO it FROM public.scanner_picking_task_items WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Artigo de picking não encontrado'; END IF;
  v_total := CASE WHEN it.product_id IS NULL THEN 1 ELSE public.effective_total_colis(it.product_id) END;
  IF v_total < 1 THEN v_total := 1; END IF;
  FOR c IN 1..v_total LOOP
    INSERT INTO public.picking_item_colis (item_id, colis_number, requested_quantity)
    VALUES (p_item_id, c, it.requested_quantity)
    ON CONFLICT (item_id, colis_number)
      DO UPDATE SET requested_quantity = EXCLUDED.requested_quantity, updated_at = now();
  END LOOP;
  RETURN v_total;
END $$;

CREATE OR REPLACE FUNCTION public.ensure_note_item_colis(p_item_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE it RECORD; v_total integer; c integer;
BEGIN
  SELECT * INTO it FROM public.delivery_note_items WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Artigo da nota não encontrado'; END IF;
  v_total := CASE WHEN it.product_id IS NULL THEN 1 ELSE public.effective_total_colis(it.product_id) END;
  IF v_total < 1 THEN v_total := 1; END IF;
  FOR c IN 1..v_total LOOP
    INSERT INTO public.delivery_note_item_colis (note_item_id, colis_number, requested_quantity)
    VALUES (p_item_id, c, it.quantity)
    ON CONFLICT (note_item_id, colis_number)
      DO UPDATE SET requested_quantity = GREATEST(public.delivery_note_item_colis.requested_quantity, EXCLUDED.requested_quantity),
                    updated_at = now();
  END LOOP;
  RETURN v_total;
END $$;

CREATE OR REPLACE FUNCTION public.claim_operation(p_op_key text, p_kind text, p_resource text, p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); op RECORD;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF COALESCE(trim(p_op_key),'') = '' THEN RAISE EXCEPTION 'Chave de operação em falta'; END IF;
  SELECT * INTO op FROM public.delivery_operations WHERE op_key = p_op_key;
  IF FOUND THEN
    IF op.kind IS DISTINCT FROM p_kind
       OR op.resource IS DISTINCT FROM p_resource
       OR op.actor IS DISTINCT FROM uid THEN
      RAISE EXCEPTION 'Esta chave de operação já foi usada noutro contexto';
    END IF;
    IF op.payload_hash IS DISTINCT FROM p_hash THEN
      RAISE EXCEPTION 'Alteração diferente com a mesma chave de operação: recarregue o ecrã e volte a confirmar';
    END IF;
    RETURN COALESCE(op.result, '{}'::jsonb);
  END IF;
  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.ensure_picking_item_colis(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_note_item_colis(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_operation(text, text, text, text) FROM PUBLIC, anon, authenticated;

-- 3. PICKING POR COLI -------------------------------------------------

CREATE OR REPLACE FUNCTION public.stage_picking_colis(
  p_task_id uuid, p_dock_location text, p_lines jsonb, p_op_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  uid uuid := auth.uid(); v_dock text; v_hash text; prev jsonb;
  ln jsonb; cj jsonb; it RECORD; tk RECORD; nt_id uuid; v_item uuid;
  v_pid uuid; v_order text; v_total integer; v_coli integer; v_qty integer;
  v_from text; v_pend integer; v_avail integer; v_moved integer; v_mov uuid;
  v_note_item uuid; v_sets integer; v_req integer; v_vol integer;
  res_lines jsonb := '[]'::jsonb; colis_out jsonb; notes_out jsonb := '[]'::jsonb;
  v_moved_total integer := 0; v_reason text; v_notes text; res jsonb;
BEGIN
  PERFORM set_config('app.wms_rpc', '1', true);
  PERFORM public.assert_app_role(ARRAY['master','admin','operator','warehouse_operator']);
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  v_dock := NULLIF(trim(COALESCE(p_dock_location,'')), '');
  IF v_dock IS NULL THEN RAISE EXCEPTION 'Localização de cais obrigatória'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouse_locations w
                  WHERE upper(trim(w.code)) = upper(v_dock) AND w.location_type = 'pre_exit') THEN
    RAISE EXCEPTION 'Localização % não é um cais de pré-saída', v_dock;
  END IF;

  v_hash := md5('stage_picking_colis|' || COALESCE(p_task_id::text,'-') || '|' || uid::text || '|'
                || v_dock || '|' || COALESCE(p_lines,'[]'::jsonb)::text);
  prev := public.claim_operation(p_op_key, 'picking_stage_colis',
            'task:' || COALESCE(p_task_id::text,'adhoc'), v_hash);
  IF prev IS NOT NULL THEN RETURN prev; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('picking_task:' || COALESCE(p_task_id::text,'adhoc'), 0));

  IF p_task_id IS NOT NULL THEN
    SELECT * INTO tk FROM public.scanner_picking_tasks WHERE id = p_task_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa de separação não encontrada'; END IF;
    IF tk.status NOT IN ('pending','in_progress') THEN
      RAISE EXCEPTION 'A tarefa já está %; não aceita mais conferências', tk.status;
    END IF;
  END IF;

  FOR ln IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines,'[]'::jsonb)) LOOP
    v_item := NULLIF(ln->>'item_id','')::uuid;
    v_order := NULLIF(trim(COALESCE(ln->>'order_number','')), '');
    IF v_order IS NULL THEN
      RAISE EXCEPTION 'Encomenda obrigatória em cada linha conferida (produto %)', COALESCE(ln->>'product_code','?');
    END IF;

    IF v_item IS NOT NULL THEN
      SELECT * INTO it FROM public.scanner_picking_task_items WHERE id = v_item FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Artigo de separação inexistente'; END IF;
      IF p_task_id IS NULL OR it.task_id <> p_task_id THEN
        RAISE EXCEPTION 'O artigo não pertence a esta tarefa de separação';
      END IF;
      IF it.excluded THEN RAISE EXCEPTION 'Artigo excluído da tarefa: %', it.product_name; END IF;
      v_pid := it.product_id;
      v_req := it.requested_quantity;
      IF NULLIF(ln->>'product_id','')::uuid IS NOT NULL AND NULLIF(ln->>'product_id','')::uuid <> COALESCE(v_pid, NULLIF(ln->>'product_id','')::uuid) THEN
        RAISE EXCEPTION 'Produto lido não corresponde ao artigo da tarefa';
      END IF;
      PERFORM public.ensure_picking_item_colis(v_item);
    ELSE
      v_pid := NULLIF(ln->>'product_id','')::uuid;
      v_req := COALESCE((ln->>'quantity')::integer, 0);
    END IF;

    IF v_pid IS NULL THEN RAISE EXCEPTION 'Produto desconhecido em %', COALESCE(ln->>'product_code','?'); END IF;
    v_total := GREATEST(public.effective_total_colis(v_pid), 1);

    SELECT id INTO nt_id FROM public.delivery_notes
     WHERE order_number = v_order AND status IN ('picking','staged','loaded') LIMIT 1;
    IF nt_id IS NULL THEN
      INSERT INTO public.delivery_notes (order_number, task_id, client_name, status, dock_location, created_by, staged_at, route_id)
      VALUES (v_order, p_task_id, NULLIF(ln->>'client_name',''), 'staged', v_dock, uid, now(),
              (SELECT route_id FROM public.scanner_picking_tasks WHERE id = p_task_id))
      RETURNING id INTO nt_id;
      notes_out := notes_out || jsonb_build_array(v_order);
    ELSE
      UPDATE public.delivery_notes
         SET dock_location = v_dock, staged_at = COALESCE(staged_at, now()),
             status = CASE WHEN status = 'picking' THEN 'staged' ELSE status END,
             updated_at = now()
       WHERE id = nt_id AND status <> 'cancelled';
    END IF;

    SELECT id INTO v_note_item FROM public.delivery_note_items
     WHERE note_id = nt_id AND product_id IS NOT DISTINCT FROM v_pid
       AND COALESCE(details,'') = COALESCE(NULLIF(ln->>'details',''),'')
     LIMIT 1;
    IF v_note_item IS NULL THEN
      INSERT INTO public.delivery_note_items (note_id, product_id, product_code, product_name, details, quantity, staged_quantity, location)
      VALUES (nt_id, v_pid, COALESCE(ln->>'product_code',''), COALESCE(ln->>'product_name','?'),
              NULLIF(ln->>'details',''), v_req, 0, v_dock)
      RETURNING id INTO v_note_item;
    END IF;
    PERFORM public.ensure_note_item_colis(v_note_item);

    colis_out := '[]'::jsonb;

    FOR cj IN SELECT * FROM jsonb_array_elements(COALESCE(ln->'colis','[]'::jsonb)) LOOP
      v_coli := (cj->>'colis_number')::integer;
      v_qty := (cj->>'quantity')::integer;
      v_from := NULLIF(trim(COALESCE(cj->>'from_location','')), '');

      IF v_coli IS NULL OR v_coli < 1 OR v_coli > v_total THEN
        RAISE EXCEPTION 'Coli % não existe neste produto (tem % colis)', v_coli, v_total;
      END IF;
      IF v_qty IS NULL OR v_qty <= 0 THEN
        RAISE EXCEPTION 'Quantidade inválida no coli %', v_coli;
      END IF;
      IF v_from IS NULL THEN RAISE EXCEPTION 'Origem obrigatória no coli %', v_coli; END IF;
      IF public.is_quarantine_location(v_from) THEN
        RAISE EXCEPTION 'Origem % está em quarentena e não pode ser separada', v_from;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.warehouse_locations w WHERE upper(trim(w.code)) = upper(v_from)) THEN
        RAISE EXCEPTION 'Origem % não existe no armazém', v_from;
      END IF;

      IF v_item IS NOT NULL THEN
        SELECT GREATEST(requested_quantity - picked_quantity, 0) INTO v_pend
          FROM public.picking_item_colis WHERE item_id = v_item AND colis_number = v_coli FOR UPDATE;
        IF v_pend IS NULL THEN RAISE EXCEPTION 'Coli % não previsto neste artigo', v_coli; END IF;
        IF v_qty > v_pend THEN
          RAISE EXCEPTION 'Coli %: pedido de % excede o pendente (%).', v_coli, v_qty, v_pend;
        END IF;
      END IF;

      SELECT COALESCE(SUM(quantity),0) INTO v_avail FROM public.counts
       WHERE product_id = v_pid AND colis_number = v_coli
         AND lower(trim(COALESCE(location,''))) = lower(v_from);
      IF v_avail < v_qty THEN
        RAISE EXCEPTION 'Coli % em %: existem % unidades, foram confirmadas %.', v_coli, v_from, v_avail, v_qty;
      END IF;

      v_moved := public.move_stock_qty(v_pid, v_coli, v_qty, v_from, v_dock);
      IF v_moved <> v_qty THEN
        RAISE EXCEPTION 'O saldo do coli % em % mudou noutro dispositivo (movidas % de %).', v_coli, v_from, v_moved, v_qty;
      END IF;

      IF v_mov IS NULL THEN
        INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, reference, notes, created_by)
        VALUES (v_pid, 'transferencia', v_qty, 'picking_para_doca', v_order,
                'Picking conferido por coli: ' || v_from || ' -> ' || v_dock, uid)
        RETURNING id INTO v_mov;
      END IF;
      INSERT INTO public.stock_movement_lines (movement_id, product_id, colis_number, quantity, location, location_to)
      VALUES (v_mov, v_pid, v_coli, v_qty, v_from, v_dock);

      IF v_item IS NOT NULL THEN
        UPDATE public.picking_item_colis
           SET picked_quantity = picked_quantity + v_qty, from_location = v_from,
               evidence = 'scan', updated_at = now()
         WHERE item_id = v_item AND colis_number = v_coli;
      END IF;

      UPDATE public.delivery_note_item_colis
         SET staged_quantity = staged_quantity + v_qty, location = v_dock,
             evidence = 'scan', updated_at = now()
       WHERE note_item_id = v_note_item AND colis_number = v_coli;

      v_moved_total := v_moved_total + v_qty;
      colis_out := colis_out || jsonb_build_array(jsonb_build_object(
        'colis_number', v_coli, 'moved', v_qty, 'from_location', v_from));
    END LOOP;

    IF v_mov IS NOT NULL THEN
      SELECT COALESCE(SUM(quantity),0) INTO v_vol FROM public.stock_movement_lines WHERE movement_id = v_mov;
      UPDATE public.stock_movements SET quantity = v_vol WHERE id = v_mov;
      v_mov := NULL;
    END IF;

    IF v_item IS NOT NULL THEN
      SELECT MIN(picked_quantity) INTO v_sets FROM public.picking_item_colis WHERE item_id = v_item;
      v_reason := NULLIF(trim(COALESCE(ln->>'shortage_reason','')), '');
      v_notes := NULLIF(trim(COALESCE(ln->>'shortage_notes','')), '');
      UPDATE public.scanner_picking_task_items
         SET picked_quantity = COALESCE(v_sets,0),
             shortage_quantity = GREATEST(requested_quantity - COALESCE(v_sets,0), 0),
             shortage_reason = CASE WHEN requested_quantity - COALESCE(v_sets,0) > 0 THEN v_reason END,
             shortage_notes = CASE WHEN requested_quantity - COALESCE(v_sets,0) > 0 THEN v_notes END,
             picked_by = uid, picked_at = now(), updated_at = now()
       WHERE id = v_item;
    END IF;

    SELECT MIN(staged_quantity) INTO v_sets FROM public.delivery_note_item_colis WHERE note_item_id = v_note_item;
    UPDATE public.delivery_note_items
       SET staged_quantity = COALESCE(v_sets,0), location = v_dock, updated_at = now()
     WHERE id = v_note_item;

    res_lines := res_lines || jsonb_build_array(jsonb_build_object(
      'item_id', v_item, 'note_item_id', v_note_item, 'order_number', v_order,
      'product_id', v_pid, 'product_code', COALESCE(ln->>'product_code',''),
      'requested_sets', v_req, 'complete_sets', COALESCE(v_sets,0),
      'colis', colis_out,
      'pending', COALESCE((SELECT jsonb_agg(jsonb_build_object('colis_number', colis_number,
                             'pending', GREATEST(requested_quantity - picked_quantity,0)) ORDER BY colis_number)
                     FROM public.picking_item_colis WHERE item_id = v_item), '[]'::jsonb)
    ));
  END LOOP;

  IF p_task_id IS NOT NULL THEN
    UPDATE public.scanner_picking_tasks
       SET status = CASE WHEN status = 'pending' THEN 'in_progress' ELSE status END,
           started_at = COALESCE(started_at, now()), updated_at = now()
     WHERE id = p_task_id;
  END IF;

  res := jsonb_build_object('dock', v_dock, 'volumes_moved', v_moved_total,
                            'lines', res_lines, 'notes_created', notes_out);
  INSERT INTO public.delivery_operations (op_key, kind, actor, result, payload_hash, resource)
  VALUES (p_op_key, 'picking_stage_colis', uid, res, v_hash,
          'task:' || COALESCE(p_task_id::text,'adhoc'));
  RETURN res;
END $$;

-- 4. CARREGAMENTO POR COLI --------------------------------------------

CREATE OR REPLACE FUNCTION public.load_notes_colis(
  p_vehicle_location text, p_lines jsonb, p_op_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  uid uuid := auth.uid(); v_veh text; v_hash text; prev jsonb;
  ln jsonb; cj jsonb; it RECORD; nt RECORD; v_coli integer; v_qty integer;
  v_pend integer; v_avail integer; v_moved integer; v_mov uuid; v_sets integer;
  v_note_item uuid; colis_out jsonb; res_lines jsonb := '[]'::jsonb;
  v_total integer := 0; v_notes uuid[] := '{}'; n uuid; v_left integer; res jsonb; v_vol integer;
BEGIN
  PERFORM set_config('app.wms_rpc', '1', true);
  PERFORM public.assert_app_role(ARRAY['master','admin','operator','warehouse_operator']);
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  v_veh := NULLIF(trim(COALESCE(p_vehicle_location,'')), '');
  IF v_veh IS NULL THEN RAISE EXCEPTION 'Viatura obrigatória'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouse_locations w
                  WHERE upper(trim(w.code)) = upper(v_veh) AND w.location_type = 'transport') THEN
    RAISE EXCEPTION 'Localização % não é uma viatura', v_veh;
  END IF;
  IF jsonb_array_length(COALESCE(p_lines,'[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'É necessário conferir os artigos antes de carregar.';
  END IF;

  v_hash := md5('load_notes_colis|' || uid::text || '|' || v_veh || '|' || p_lines::text);
  prev := public.claim_operation(p_op_key, 'vehicle_load_colis', 'vehicle:' || v_veh, v_hash);
  IF prev IS NOT NULL THEN RETURN prev; END IF;

  FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_note_item := NULLIF(ln->>'note_item_id','')::uuid;
    IF v_note_item IS NULL THEN RAISE EXCEPTION 'Artigo da nota em falta na conferência'; END IF;

    SELECT * INTO it FROM public.delivery_note_items WHERE id = v_note_item FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Artigo da nota inexistente'; END IF;
    SELECT * INTO nt FROM public.delivery_notes WHERE id = it.note_id FOR UPDATE;
    IF nt.status = 'cancelled' THEN
      RAISE EXCEPTION 'A encomenda % está cancelada', nt.order_number;
    END IF;
    IF nt.status NOT IN ('staged','loaded') THEN
      RAISE EXCEPTION 'A encomenda % ainda não está no cais (estado %)', nt.order_number, nt.status;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('note_load:' || nt.id::text, 0));
    PERFORM public.ensure_note_item_colis(v_note_item);
    IF NOT (nt.id = ANY(v_notes)) THEN v_notes := v_notes || nt.id; END IF;

    colis_out := '[]'::jsonb;
    v_mov := NULL;

    FOR cj IN SELECT * FROM jsonb_array_elements(COALESCE(ln->'colis','[]'::jsonb)) LOOP
      v_coli := (cj->>'colis_number')::integer;
      v_qty := (cj->>'quantity')::integer;
      IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'Quantidade inválida no coli %', v_coli; END IF;

      SELECT GREATEST(staged_quantity - loaded_quantity, 0) INTO v_pend
        FROM public.delivery_note_item_colis
       WHERE note_item_id = v_note_item AND colis_number = v_coli FOR UPDATE;
      IF v_pend IS NULL THEN
        RAISE EXCEPTION 'Coli % não pertence a este artigo da encomenda %', v_coli, nt.order_number;
      END IF;
      IF v_qty > v_pend THEN
        RAISE EXCEPTION 'Coli % da encomenda %: só há % por carregar (conferidas %).',
          v_coli, nt.order_number, v_pend, v_qty;
      END IF;

      SELECT COALESCE(SUM(quantity),0) INTO v_avail FROM public.counts
       WHERE product_id = it.product_id AND colis_number = v_coli
         AND lower(trim(COALESCE(location,''))) = lower(trim(COALESCE(nt.dock_location,'')));
      IF v_avail < v_qty THEN
        RAISE EXCEPTION 'Coli % não está no cais % (existem %, confirmadas %).',
          v_coli, COALESCE(nt.dock_location,'?'), v_avail, v_qty;
      END IF;

      v_moved := public.move_stock_qty(it.product_id, v_coli, v_qty, nt.dock_location, v_veh);
      IF v_moved <> v_qty THEN
        RAISE EXCEPTION 'O saldo do coli % no cais mudou noutro dispositivo (movidas % de %).', v_coli, v_moved, v_qty;
      END IF;

      IF v_mov IS NULL THEN
        INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, reference, notes, created_by)
        VALUES (it.product_id, 'transferencia', v_qty, 'carga_para_viatura', nt.order_number,
                'Carga conferida por coli: ' || COALESCE(nt.dock_location,'cais') || ' -> ' || v_veh, uid)
        RETURNING id INTO v_mov;
      END IF;
      INSERT INTO public.stock_movement_lines (movement_id, product_id, colis_number, quantity, location, location_to)
      VALUES (v_mov, it.product_id, v_coli, v_qty, nt.dock_location, v_veh);

      UPDATE public.delivery_note_item_colis
         SET loaded_quantity = loaded_quantity + v_qty, location = v_veh,
             evidence = 'scan', updated_at = now()
       WHERE note_item_id = v_note_item AND colis_number = v_coli;

      v_total := v_total + v_qty;
      colis_out := colis_out || jsonb_build_array(jsonb_build_object('colis_number', v_coli, 'loaded', v_qty));
    END LOOP;

    IF v_mov IS NOT NULL THEN
      SELECT COALESCE(SUM(quantity),0) INTO v_vol FROM public.stock_movement_lines WHERE movement_id = v_mov;
      UPDATE public.stock_movements SET quantity = v_vol WHERE id = v_mov;
    END IF;

    SELECT MIN(loaded_quantity) INTO v_sets FROM public.delivery_note_item_colis WHERE note_item_id = v_note_item;
    UPDATE public.delivery_note_items
       SET loaded_quantity = COALESCE(v_sets,0), location = v_veh, updated_at = now()
     WHERE id = v_note_item;

    res_lines := res_lines || jsonb_build_array(jsonb_build_object(
      'note_item_id', v_note_item, 'order_number', nt.order_number,
      'complete_sets', COALESCE(v_sets,0), 'colis', colis_out,
      'pending', (SELECT jsonb_agg(jsonb_build_object('colis_number', colis_number,
                    'pending', GREATEST(staged_quantity - loaded_quantity,0)) ORDER BY colis_number)
                  FROM public.delivery_note_item_colis WHERE note_item_id = v_note_item)));
  END LOOP;

  FOREACH n IN ARRAY v_notes LOOP
    SELECT COALESCE(SUM(GREATEST(c.staged_quantity - c.loaded_quantity,0)),0) INTO v_left
      FROM public.delivery_note_item_colis c
      JOIN public.delivery_note_items i ON i.id = c.note_item_id
     WHERE i.note_id = n;
    IF v_left > 0 THEN
      UPDATE public.delivery_notes SET vehicle_location = v_veh, updated_at = now() WHERE id = n;
    ELSE
      UPDATE public.delivery_notes
         SET status = 'loaded', vehicle_location = v_veh, loaded_at = now(), updated_at = now()
       WHERE id = n;
    END IF;
  END LOOP;

  res := jsonb_build_object('vehicle', v_veh, 'volumes_loaded', v_total, 'lines', res_lines,
                            'notes', array_length(v_notes,1));
  INSERT INTO public.delivery_operations (op_key, kind, actor, result, payload_hash, resource)
  VALUES (p_op_key, 'vehicle_load_colis', uid, res, v_hash, 'vehicle:' || v_veh);
  RETURN res;
END $$;

-- 5. TENTATIVA DO ENTREGADOR USA OS VOLUMES REALMENTE CARREGADOS -------

CREATE OR REPLACE FUNCTION public.assign_delivery_attempts(
  p_note_ids uuid[], p_driver uuid, p_scheduled_date date DEFAULT NULL::date, p_op_key text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); nt RECORD; it RECORD; v_att uuid; v_num integer;
        v_total integer; coli integer; created integer := 0; res jsonb; v_partial boolean;
        v_reason text; out_ids jsonb := '[]'::jsonb; v_loaded integer; v_delivered integer;
        v_has_colis boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.is_delivery_manager(uid) THEN RAISE EXCEPTION 'Sem permissão para atribuir entregas'; END IF;
  IF p_op_key IS NOT NULL THEN
    SELECT result INTO res FROM public.delivery_operations WHERE op_key = p_op_key;
    IF res IS NOT NULL THEN RETURN res; END IF;
  END IF;

  FOR nt IN SELECT * FROM public.delivery_notes WHERE id = ANY(p_note_ids) FOR UPDATE LOOP
    IF nt.status = 'cancelled' THEN
      RAISE EXCEPTION 'Encomenda % está cancelada e não pode ser agendada', nt.order_number;
    END IF;
    IF EXISTS (SELECT 1 FROM public.delivery_attempts a
               WHERE a.note_id = nt.id AND a.status IN ('assigned','in_transit')) THEN
      RAISE EXCEPTION 'A encomenda % já tem uma tentativa em curso', nt.order_number;
    END IF;

    SELECT COALESCE(MAX(attempt_number),0) + 1 INTO v_num FROM public.delivery_attempts WHERE note_id = nt.id;
    SELECT EXISTS (SELECT 1 FROM public.delivery_note_items i
                   WHERE i.note_id = nt.id AND i.loaded_quantity < i.quantity) INTO v_partial;
    SELECT string_agg(DISTINCT ti.shortage_reason, ', ') INTO v_reason
      FROM public.scanner_picking_task_items ti
     WHERE ti.task_id = nt.task_id AND ti.shortage_quantity > 0 AND ti.shortage_reason IS NOT NULL;

    INSERT INTO public.delivery_attempts (
      note_id, route_id, attempt_number, driver_id, scheduled_date, vehicle_location,
      order_number, client_name, address, delivery_instructions,
      partial_load, partial_load_reason, assigned_by)
    VALUES (nt.id, nt.route_id, v_num, p_driver, p_scheduled_date, nt.vehicle_location,
      nt.order_number, nt.client_name, nt.address, nt.delivery_instructions,
      COALESCE(v_partial,false), v_reason, uid)
    RETURNING id INTO v_att;

    FOR it IN SELECT * FROM public.delivery_note_items WHERE note_id = nt.id LOOP
      v_total := CASE WHEN it.product_id IS NULL THEN 1 ELSE public.effective_total_colis(it.product_id) END;
      IF v_total < 1 THEN v_total := 1; END IF;
      SELECT EXISTS (SELECT 1 FROM public.delivery_note_item_colis WHERE note_item_id = it.id)
        INTO v_has_colis;

      FOR coli IN 1..v_total LOOP
        IF v_has_colis THEN
          SELECT COALESCE(c.loaded_quantity,0) INTO v_loaded
            FROM public.delivery_note_item_colis c
           WHERE c.note_item_id = it.id AND c.colis_number = coli;
          v_loaded := COALESCE(v_loaded, 0);
          SELECT COALESCE(SUM(l.delivered_quantity),0) INTO v_delivered
            FROM public.delivery_attempt_lines l
            JOIN public.delivery_attempts a ON a.id = l.attempt_id
           WHERE l.note_item_id = it.id AND l.colis_number = coli AND a.status = 'completed';
          v_loaded := GREATEST(v_loaded - COALESCE(v_delivered,0), 0);
        ELSE
          v_loaded := GREATEST(it.loaded_quantity - it.delivered_quantity, 0);
        END IF;

        INSERT INTO public.delivery_attempt_lines (
          attempt_id, note_item_id, product_id, product_code, product_name, details,
          colis_number, ordered_quantity, loaded_quantity, exception_note)
        VALUES (v_att, it.id, it.product_id, it.product_code, it.product_name, it.details,
          coli, GREATEST(it.quantity - it.delivered_quantity, 0), v_loaded,
          CASE WHEN v_has_colis THEN NULL ELSE 'origem: quantidade agregada (sem conferência por coli)' END)
        ON CONFLICT (attempt_id, note_item_id, colis_number) DO NOTHING;
      END LOOP;
    END LOOP;

    INSERT INTO public.delivery_events (note_id, attempt_id, event_type, payload, actor)
    VALUES (nt.id, v_att, 'tentativa_atribuida',
      jsonb_build_object('driver', p_driver, 'date', p_scheduled_date, 'attempt', v_num), uid);

    created := created + 1;
    out_ids := out_ids || jsonb_build_array(v_att);
  END LOOP;

  res := jsonb_build_object('created', created, 'attempts', out_ids);
  IF p_op_key IS NOT NULL THEN
    INSERT INTO public.delivery_operations (op_key, kind, actor, result)
    VALUES (p_op_key, 'assign', uid, res) ON CONFLICT (op_key) DO NOTHING;
  END IF;
  RETURN res;
END $$;

-- 6. COMPATIBILIDADE ---------------------------------------------------

CREATE OR REPLACE FUNCTION public.backfill_note_item_colis_legacy()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE it RECORD; v_total integer; c integer; n integer := 0;
BEGIN
  FOR it IN
    SELECT i.* FROM public.delivery_note_items i
      JOIN public.delivery_notes dn ON dn.id = i.note_id
     WHERE dn.status IN ('picking','staged','loaded','partial','not_delivered')
       AND NOT EXISTS (SELECT 1 FROM public.delivery_note_item_colis c WHERE c.note_item_id = i.id)
  LOOP
    v_total := CASE WHEN it.product_id IS NULL THEN 1 ELSE public.effective_total_colis(it.product_id) END;
    IF v_total < 1 THEN v_total := 1; END IF;
    FOR c IN 1..v_total LOOP
      INSERT INTO public.delivery_note_item_colis (
        note_item_id, colis_number, requested_quantity, staged_quantity, loaded_quantity, location, evidence)
      VALUES (it.id, c, it.quantity, it.staged_quantity, it.loaded_quantity, it.location, 'legacy_aggregate')
      ON CONFLICT (note_item_id, colis_number) DO NOTHING;
    END LOOP;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.backfill_note_item_colis_legacy() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.stage_picking_colis(uuid, text, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.load_notes_colis(text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage_picking_colis(uuid, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.load_notes_colis(text, jsonb, text) TO authenticated;