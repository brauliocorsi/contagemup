ALTER TABLE public.location_audits
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'location',
  ADD COLUMN IF NOT EXISTS scope_filter jsonb;
ALTER TABLE public.location_audits DROP CONSTRAINT IF EXISTS location_audits_scope_check;
ALTER TABLE public.location_audits ADD CONSTRAINT location_audits_scope_check CHECK (scope IN ('location','global'));

ALTER TABLE public.location_audit_items
  ADD COLUMN IF NOT EXISTS resolution text,
  ADD COLUMN IF NOT EXISTS resolved_by uuid,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE public.location_audit_items DROP CONSTRAINT IF EXISTS location_audit_items_resolution_check;
ALTER TABLE public.location_audit_items ADD CONSTRAINT location_audit_items_resolution_check CHECK (resolution IS NULL OR resolution IN ('ajustar','sem_ajuste'));

CREATE OR REPLACE FUNCTION public.resolve_audit_item(p_item_id uuid, p_resolution text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE it public.location_audit_items; a public.location_audits;
BEGIN
  PERFORM set_config('app.wms_rpc', '1', true);
  PERFORM public.assert_app_role(ARRAY['master','admin','operator']);
  IF p_resolution IS NOT NULL AND p_resolution NOT IN ('ajustar','sem_ajuste') THEN RAISE EXCEPTION 'Decisão inválida.'; END IF;
  SELECT * INTO it FROM public.location_audit_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Linha não encontrada.'; END IF;
  SELECT * INTO a FROM public.location_audits WHERE id = it.audit_id;
  IF a.status = 'completed' OR it.applied_at IS NOT NULL THEN RAISE EXCEPTION 'Conferência já fechada.'; END IF;
  IF p_resolution IS NOT NULL AND COALESCE(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'Indique a causa.'; END IF;
  UPDATE public.location_audit_items
     SET resolution = p_resolution,
         notes = CASE WHEN p_resolution IS NULL THEN notes ELSE btrim(p_reason) END,
         resolved_by = CASE WHEN p_resolution IS NULL THEN NULL ELSE auth.uid() END,
         resolved_at = CASE WHEN p_resolution IS NULL THEN NULL ELSE now() END
   WHERE id = p_item_id;
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE EXECUTE ON FUNCTION public.resolve_audit_item(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_audit_item(uuid,text,text) TO authenticated, service_role;

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
  NEW.resolution := OLD.resolution; NEW.resolved_by := OLD.resolved_by; NEW.resolved_at := OLD.resolved_at;
  NEW.counted_by := auth.uid();
  NEW.difference := COALESCE(NEW.counted_quantity, 0) - OLD.expected_quantity;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_location_audit(p_audit_id uuid, p_accept_drift boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  a public.location_audits;
  it RECORD;
  v_global boolean;
  v_pending integer;
  v_missing integer;
  v_current integer;
  v_delta integer;
  v_rem integer;
  v_take integer;
  v_target uuid;
  v_loc text;
  v_line_loc text;
  r RECORD;
  mv_id uuid;
  v_applied integer := 0;
  v_skipped integer := 0;
  v_drift jsonb := '[]'::jsonb;
BEGIN
  PERFORM set_config('app.wms_rpc', '1', true); PERFORM public.assert_app_role(ARRAY['master','admin','operator']);
  SELECT * INTO a FROM public.location_audits WHERE id = p_audit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conferência não encontrada.'; END IF;
  v_global := a.scope = 'global';

  IF a.status = 'completed' THEN
    RETURN jsonb_build_object('status', 'ja_fechada', 'completed_at', a.completed_at, 'adjustments', 0);
  END IF;

  IF a.created_by IS DISTINCT FROM uid AND NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'Só o responsável pode fechar a conferência.';
  END IF;

  SELECT count(*) INTO v_pending FROM public.location_audit_items
   WHERE audit_id = p_audit_id AND status <> 'counted';
  IF v_pending > 0 THEN
    RAISE EXCEPTION 'Faltam % artigo(s) por confirmar.', v_pending;
  END IF;

  SELECT count(*) INTO v_missing FROM public.location_audit_items
   WHERE audit_id = p_audit_id
     AND COALESCE(difference, 0) <> 0
     AND applied_at IS NULL
     AND resolution IS NULL
     AND (v_global OR COALESCE(btrim(notes), '') = '');
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Trate % divergência(s) (causa e decisão) antes de fechar.', v_missing;
  END IF;

  IF NOT p_accept_drift THEN
    FOR it IN
      SELECT * FROM public.location_audit_items
       WHERE audit_id = p_audit_id AND applied_at IS NULL AND product_id IS NOT NULL
         AND COALESCE(resolution, 'ajustar') = 'ajustar'
    LOOP
      SELECT COALESCE(SUM(quantity), 0) INTO v_current FROM public.counts c
       WHERE c.product_id = it.product_id
         AND (v_global OR lower(btrim(COALESCE(c.location, ''))) = lower(btrim(COALESCE(it.location, ''))))
         AND (it.colis_number IS NULL OR c.colis_number = it.colis_number);
      IF v_current <> it.expected_quantity THEN
        v_drift := v_drift || jsonb_build_object(
          'item_id', it.id, 'product_code', it.product_code, 'location', it.location,
          'colis_number', it.colis_number, 'reference', it.expected_quantity, 'current', v_current);
      END IF;
    END LOOP;
    IF jsonb_array_length(v_drift) > 0 THEN
      RETURN jsonb_build_object('status', 'movimentado', 'drift', v_drift, 'adjustments', 0);
    END IF;
  END IF;

  SELECT count(*) INTO v_skipped FROM public.location_audit_items
   WHERE audit_id = p_audit_id AND COALESCE(difference,0) <> 0 AND resolution = 'sem_ajuste';

  FOR it IN
    SELECT * FROM public.location_audit_items
     WHERE audit_id = p_audit_id
       AND applied_at IS NULL
       AND product_id IS NOT NULL
       AND COALESCE(difference, 0) <> 0
       AND COALESCE(resolution, 'ajustar') = 'ajustar'
     ORDER BY location, product_code, colis_number
  LOOP
    SELECT COALESCE(SUM(quantity), 0) INTO v_current FROM public.counts c
     WHERE c.product_id = it.product_id
       AND (v_global OR lower(btrim(COALESCE(c.location, ''))) = lower(btrim(COALESCE(it.location, ''))))
       AND (it.colis_number IS NULL OR c.colis_number = it.colis_number);

    v_delta := COALESCE(it.counted_quantity, 0) - v_current;
    v_line_loc := it.location;

    IF v_delta < 0 THEN
      v_rem := -v_delta;
      v_loc := NULL;
      FOR r IN
        SELECT id, quantity, location FROM public.counts c
         WHERE c.product_id = it.product_id
           AND (v_global OR lower(btrim(COALESCE(c.location, ''))) = lower(btrim(COALESCE(it.location, ''))))
           AND (it.colis_number IS NULL OR c.colis_number = it.colis_number)
           AND c.quantity > 0
         -- Na conferência global retira primeiro o stock sem localização.
         ORDER BY (c.location IS NULL) DESC, c.quantity DESC, c.id
         FOR UPDATE
      LOOP
        EXIT WHEN v_rem <= 0;
        v_take := LEAST(r.quantity, v_rem);
        UPDATE public.counts SET quantity = quantity - v_take, updated_at = now() WHERE id = r.id;
        v_rem := v_rem - v_take;
        v_loc := concat_ws(', ', v_loc, COALESCE(r.location, 'sem localização') || ' -' || v_take);
      END LOOP;
      IF v_rem > 0 THEN
        RAISE EXCEPTION 'Não foi possível reduzir % unidade(s) de %: stock insuficiente.', v_rem, it.product_code;
      END IF;
      IF v_global THEN v_line_loc := left(COALESCE(v_loc, 'TODAS'), 200); END IF;

    ELSIF v_delta > 0 THEN
      v_loc := CASE WHEN v_global THEN 'CONF' ELSE it.location END;
      SELECT id INTO v_target FROM public.counts c
       WHERE c.product_id = it.product_id
         AND lower(btrim(COALESCE(c.location, ''))) = lower(btrim(v_loc))
         AND (it.colis_number IS NULL OR c.colis_number = it.colis_number)
       ORDER BY (c.session_id IS NULL) DESC, c.quantity DESC, c.id
       LIMIT 1
       FOR UPDATE;
      IF v_target IS NOT NULL THEN
        UPDATE public.counts SET quantity = quantity + v_delta, updated_at = now() WHERE id = v_target;
      ELSE
        INSERT INTO public.counts (product_id, colis_number, quantity, session_id, location, counted_by)
        VALUES (it.product_id, COALESCE(it.colis_number, 1), v_delta, NULL,
                public.assert_valid_location(v_loc), uid);
      END IF;
      v_line_loc := v_loc;
    END IF;

    INSERT INTO public.stock_movements (
      product_id, movement_type, quantity, reason, reference, notes, created_by
    ) VALUES (
      it.product_id, 'ajuste', abs(v_delta), it.notes,
      'CONF-' || left(p_audit_id::text, 8),
      format('%s · coli %s · %s · referência %s · contado %s · saldo antes %s · saldo depois %s',
             v_line_loc,
             COALESCE(it.colis_number::text, '—'),
             CASE WHEN v_delta > 0 THEN 'ajuste positivo' WHEN v_delta < 0 THEN 'ajuste negativo' ELSE 'sem alteração' END,
             it.expected_quantity, COALESCE(it.counted_quantity, 0), v_current, v_current + v_delta),
      uid
    ) RETURNING id INTO mv_id;

    INSERT INTO public.stock_movement_lines (
      movement_id, product_id, colis_number, quantity, location, location_to
    ) VALUES (
      mv_id, it.product_id, COALESCE(it.colis_number, 1), abs(v_delta), v_line_loc, v_line_loc
    );

    UPDATE public.location_audit_items
       SET applied_at = now(), movement_id = mv_id,
           quantity_before = v_current, quantity_after = v_current + v_delta
     WHERE id = it.id;
    v_applied := v_applied + 1;
  END LOOP;

  UPDATE public.location_audits
     SET status = 'completed', completed_at = now(), updated_at = now()
   WHERE id = p_audit_id;

  RETURN jsonb_build_object('status', 'fechada', 'adjustments', v_applied, 'skipped', v_skipped);
END; $function$;