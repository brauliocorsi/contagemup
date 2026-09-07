-- 1) Papel novo
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('master','admin','financeiro','operator','entregador','warehouse_operator'));

CREATE OR REPLACE FUNCTION public.is_warehouse_operator(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE user_id = _uid AND role = 'warehouse_operator'
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_warehouse_operator(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_warehouse_operator(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_operational_actor()
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.is_warehouse_operator(auth.uid()) THEN
    RAISE EXCEPTION 'Operação reservada a responsáveis. O operador de armazém não tem esta permissão.';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.assert_operational_actor() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.assert_operational_actor() TO authenticated, service_role;

-- 2) set_user_role aceita o papel novo (continua Master-only)
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_target_role text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = uid AND role = 'master') THEN
    RAISE EXCEPTION 'Apenas o Master pode alterar funções de utilizadores';
  END IF;
  IF p_role NOT IN ('master','admin','financeiro','operator','entregador','warehouse_operator') THEN
    RAISE EXCEPTION 'Perfil inválido';
  END IF;
  SELECT role INTO v_target_role FROM public.profiles WHERE user_id = p_user_id;
  IF v_target_role IS NULL THEN RAISE EXCEPTION 'Utilizador não encontrado'; END IF;
  IF p_user_id = uid AND p_role <> 'master' THEN
    RAISE EXCEPTION 'Não pode retirar o seu próprio papel de Master';
  END IF;
  PERFORM set_config('app.allow_role_change', 'on', true);
  UPDATE public.profiles SET role = p_role, updated_at = now() WHERE user_id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 3) Políticas restritivas: escrita direta vedada ao operador de armazém
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products','categories','product_barcodes','warehouse_locations','warehouse_aisles',
    'warehouse_levels','delivery_regions','delivery_notes','delivery_note_items',
    'route_schedules','route_stops','reconciliations','reconciliation_items',
    'picking_sessions','picking_items','transport_guides','week_plans','counts','count_logs',
    'stock_movements','stock_movement_lines','product_damages','product_changes',
    'stock_order_numbers','orphan_colis_flags','counting_sessions','erp_products_cache',
    'erp_sales_cache','payment_methods','delivery_attempts','delivery_attempt_lines'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "wo_sem_insert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "wo_sem_update" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "wo_sem_delete" ON public.%I', t);
    EXECUTE format('CREATE POLICY "wo_sem_insert" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.is_warehouse_operator(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "wo_sem_update" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.is_warehouse_operator(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "wo_sem_delete" ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.is_warehouse_operator(auth.uid()))', t);
  END LOOP;
END $do$;

-- 3b) Dados comerciais fora do alcance do operador de armazém
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['erp_products_cache','erp_sales_cache','transport_guides','week_plans','payment_methods']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "wo_sem_select" ON public.%I', t);
    EXECUTE format('CREATE POLICY "wo_sem_select" ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (NOT public.is_warehouse_operator(auth.uid()))', t);
  END LOOP;
END $do$;

-- 3c) Tarefas de picking: o operador executa, não cria nem elimina
DROP POLICY IF EXISTS "wo_sem_insert" ON public.scanner_picking_tasks;
DROP POLICY IF EXISTS "wo_sem_delete" ON public.scanner_picking_tasks;
CREATE POLICY "wo_sem_insert" ON public.scanner_picking_tasks AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_warehouse_operator(auth.uid()));
CREATE POLICY "wo_sem_delete" ON public.scanner_picking_tasks AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT public.is_warehouse_operator(auth.uid()));

-- 3d) Conferências: só as atribuídas
DROP POLICY IF EXISTS "wo_auditoria_insert" ON public.location_audits;
DROP POLICY IF EXISTS "wo_auditoria_update" ON public.location_audits;
DROP POLICY IF EXISTS "wo_auditoria_delete" ON public.location_audits;
CREATE POLICY "wo_auditoria_insert" ON public.location_audits AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_warehouse_operator(auth.uid()));
CREATE POLICY "wo_auditoria_delete" ON public.location_audits AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT public.is_warehouse_operator(auth.uid()));
CREATE POLICY "wo_auditoria_update" ON public.location_audits AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT public.is_warehouse_operator(auth.uid()) OR assigned_to = auth.uid());

DROP POLICY IF EXISTS "wo_auditoria_item_insert" ON public.location_audit_items;
DROP POLICY IF EXISTS "wo_auditoria_item_update" ON public.location_audit_items;
DROP POLICY IF EXISTS "wo_auditoria_item_delete" ON public.location_audit_items;
CREATE POLICY "wo_auditoria_item_insert" ON public.location_audit_items AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_warehouse_operator(auth.uid()));
CREATE POLICY "wo_auditoria_item_delete" ON public.location_audit_items AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT public.is_warehouse_operator(auth.uid()));
CREATE POLICY "wo_auditoria_item_update" ON public.location_audit_items AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    NOT public.is_warehouse_operator(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.location_audits a
       WHERE a.id = audit_id
         AND a.assigned_to = auth.uid()
         AND a.status <> 'completed'
    )
  );

-- 4) Guardas dentro das funções sensíveis de stock
DO $do$
DECLARE fn record; v_def text; v_new text;
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'admin_reset_stock_data','recalculate_all_stock','merge_duplicate_products',
         'dedupe_counts_same_place','commit_exit_cart','reverse_stock_movement',
         'resolve_damage','regularize_damage','undo_regularize_damage',
         'merge_colis_counts','split_colis_counts'
       )
  LOOP
    v_def := fn.def;
    IF position('assert_operational_actor' in v_def) > 0 THEN CONTINUE; END IF;
    v_new := regexp_replace(v_def, '\mBEGIN\M', 'BEGIN' || chr(10) || '  PERFORM public.assert_operational_actor();', 'i');
    EXECUTE v_new;
  END LOOP;
END $do$;

-- 5) Carregamento: o operador de armazém tem de conferir artigo a artigo
CREATE OR REPLACE FUNCTION public.load_notes_to_vehicle(p_note_ids uuid[], p_vehicle_location text, p_items jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  it RECORD; v_qty integer; v_total integer; coli integer; v_moved integer; v_min integer;
  uid uuid := auth.uid(); v_veh text; loaded integer := 0; n uuid; v_pending integer;
  partial integer := 0; v_mov uuid; v_maxline integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_veh := NULLIF(trim(COALESCE(p_vehicle_location,'')), '');
  IF v_veh IS NULL THEN RAISE EXCEPTION 'Viatura obrigatória'; END IF;

  IF public.is_warehouse_operator(uid)
     AND jsonb_array_length(COALESCE(p_items,'[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'É necessário conferir os artigos antes de carregar.';
  END IF;

  FOR it IN
    SELECT i.*, dn.dock_location, dn.order_number FROM public.delivery_note_items i
    JOIN public.delivery_notes dn ON dn.id = i.note_id
    WHERE i.note_id = ANY(p_note_ids)
  LOOP
    IF jsonb_array_length(COALESCE(p_items,'[]'::jsonb)) > 0 THEN
      SELECT COALESCE(x.quantity, 0) INTO v_qty
      FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer)
      WHERE x.item_id = it.id;
      v_qty := COALESCE(v_qty, 0);
    ELSE
      v_qty := GREATEST(it.staged_quantity - it.loaded_quantity, 0);
    END IF;
    IF v_qty <= 0 THEN CONTINUE; END IF;

    v_min := v_qty;
    v_mov := NULL;
    IF it.product_id IS NOT NULL THEN
      v_total := public.effective_total_colis(it.product_id);
      v_min := NULL;
      FOR coli IN 1..v_total LOOP
        v_moved := public.move_stock_qty(it.product_id, coli, v_qty, it.dock_location, v_veh);
        IF v_min IS NULL OR v_moved < v_min THEN v_min := v_moved; END IF;
        IF v_moved > 0 THEN
          IF v_mov IS NULL THEN
            INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, reference, notes, created_by)
            VALUES (it.product_id, 'transferencia', v_qty, 'carga_para_viatura', it.order_number,
              'Carga: ' || COALESCE(it.dock_location,'cais') || ' -> ' || v_veh, uid)
            RETURNING id INTO v_mov;
          END IF;
          INSERT INTO public.stock_movement_lines (movement_id, product_id, colis_number, quantity, location, location_to)
          VALUES (v_mov, it.product_id, coli, v_moved, it.dock_location, v_veh);
        END IF;
      END LOOP;
      IF v_mov IS NOT NULL AND COALESCE(v_min,0) <> v_qty THEN
        SELECT MAX(quantity) INTO v_maxline FROM public.stock_movement_lines WHERE movement_id = v_mov;
        UPDATE public.stock_movements
           SET quantity = GREATEST(COALESCE(NULLIF(v_min,0), v_maxline), 1)
         WHERE id = v_mov;
      END IF;
    END IF;

    UPDATE public.delivery_note_items
    SET loaded_quantity = loaded_quantity + COALESCE(v_min,0), location = v_veh, updated_at = now()
    WHERE id = it.id;
    loaded := loaded + COALESCE(v_min,0);
  END LOOP;

  FOREACH n IN ARRAY p_note_ids LOOP
    SELECT COALESCE(SUM(GREATEST(i.staged_quantity - i.loaded_quantity, 0)), 0)
      INTO v_pending
    FROM public.delivery_note_items i WHERE i.note_id = n;

    IF v_pending > 0 THEN
      partial := partial + 1;
      UPDATE public.delivery_notes
         SET vehicle_location = v_veh, updated_at = now()
       WHERE id = n;
    ELSE
      UPDATE public.delivery_notes
         SET status = 'loaded', vehicle_location = v_veh, loaded_at = now(), updated_at = now()
       WHERE id = n;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('loaded', loaded, 'notes', array_length(p_note_ids, 1), 'partial', partial);
END;
$function$;