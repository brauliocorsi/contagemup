-- 1. Colunas de rastreio no fecho de conferências
ALTER TABLE public.location_audits
  ADD COLUMN IF NOT EXISTS delivered_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS delivered_by uuid;

ALTER TABLE public.location_audit_items
  ADD COLUMN IF NOT EXISTS applied_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS movement_id uuid,
  ADD COLUMN IF NOT EXISTS quantity_before integer,
  ADD COLUMN IF NOT EXISTS quantity_after integer;

-- 2. Idempotência das operações de contagem
CREATE TABLE IF NOT EXISTS public.count_operations (
  op_key text PRIMARY KEY,
  user_id uuid,
  count_id uuid,
  delta integer,
  quantity_after integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.count_operations TO authenticated;
GRANT ALL ON public.count_operations TO service_role;

ALTER TABLE public.count_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "count_operations_select" ON public.count_operations;
CREATE POLICY "count_operations_select" ON public.count_operations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "count_operations_insert" ON public.count_operations;
CREATE POLICY "count_operations_insert" ON public.count_operations
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_count_operations_count ON public.count_operations(count_id);

-- 3. Soma atómica de contagem, idempotente por chave de operação
CREATE OR REPLACE FUNCTION public.apply_count_delta(
  p_count_id uuid,
  p_delta integer,
  p_op_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_key text := NULLIF(btrim(COALESCE(p_op_key, '')), '');
  v_prev integer;
  v_after integer;
  v_row public.counts;
  v_existing public.count_operations;
BEGIN
  IF p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'Indique uma variação diferente de zero.';
  END IF;

  IF v_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.count_operations WHERE op_key = v_key;
    IF FOUND THEN
      RETURN jsonb_build_object('status', 'repetido', 'quantity_after', v_existing.quantity_after);
    END IF;
  END IF;

  SELECT * INTO v_row FROM public.counts WHERE id = p_count_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linha de contagem não encontrada.';
  END IF;

  v_prev := v_row.quantity;
  v_after := GREATEST(v_prev + p_delta, 0);

  UPDATE public.counts
     SET quantity = v_after, counted_by = COALESCE(uid, counted_by), updated_at = now()
   WHERE id = p_count_id;

  INSERT INTO public.count_logs (
    product_id, session_id, colis_number, operation,
    quantity_before, quantity_after, counted_by
  ) VALUES (
    v_row.product_id, v_row.session_id, v_row.colis_number,
    CASE WHEN p_delta > 0 THEN 'increment' ELSE 'decrement' END,
    v_prev, v_after, uid
  );

  IF v_key IS NOT NULL THEN
    INSERT INTO public.count_operations (op_key, user_id, count_id, delta, quantity_after)
    VALUES (v_key, uid, p_count_id, p_delta, v_after);
  END IF;

  RETURN jsonb_build_object('status', 'aplicado', 'quantity_before', v_prev, 'quantity_after', v_after);
END; $function$;

GRANT EXECUTE ON FUNCTION public.apply_count_delta(uuid, integer, text) TO authenticated, service_role;

-- 4. Definição de quantidade absoluta com validação da versão observada
CREATE OR REPLACE FUNCTION public.set_count_quantity(
  p_count_id uuid,
  p_quantity integer,
  p_observed_quantity integer,
  p_op_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_key text := NULLIF(btrim(COALESCE(p_op_key, '')), '');
  v_row public.counts;
  v_existing public.count_operations;
BEGIN
  IF p_quantity IS NULL OR p_quantity < 0 THEN
    RAISE EXCEPTION 'Quantidade inválida.';
  END IF;

  IF v_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.count_operations WHERE op_key = v_key;
    IF FOUND THEN
      RETURN jsonb_build_object('status', 'repetido', 'quantity_after', v_existing.quantity_after);
    END IF;
  END IF;

  SELECT * INTO v_row FROM public.counts WHERE id = p_count_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linha de contagem não encontrada.';
  END IF;

  IF p_observed_quantity IS NOT NULL AND v_row.quantity <> p_observed_quantity THEN
    RAISE EXCEPTION 'A quantidade mudou entretanto (estava %, está %). Recarregue antes de gravar.',
      p_observed_quantity, v_row.quantity;
  END IF;

  UPDATE public.counts
     SET quantity = p_quantity, counted_by = COALESCE(uid, counted_by), updated_at = now()
   WHERE id = p_count_id;

  INSERT INTO public.count_logs (
    product_id, session_id, colis_number, operation,
    quantity_before, quantity_after, counted_by
  ) VALUES (
    v_row.product_id, v_row.session_id, v_row.colis_number, 'set',
    v_row.quantity, p_quantity, uid
  );

  IF v_key IS NOT NULL THEN
    INSERT INTO public.count_operations (op_key, user_id, count_id, delta, quantity_after)
    VALUES (v_key, uid, p_count_id, p_quantity - v_row.quantity, p_quantity);
  END IF;

  RETURN jsonb_build_object('status', 'aplicado', 'quantity_before', v_row.quantity, 'quantity_after', p_quantity);
END; $function$;

GRANT EXECUTE ON FUNCTION public.set_count_quantity(uuid, integer, integer, text) TO authenticated, service_role;

-- 5. Entrega da contagem pelo operador
CREATE OR REPLACE FUNCTION public.deliver_location_audit(p_audit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  a public.location_audits;
  v_pending integer;
BEGIN
  SELECT * INTO a FROM public.location_audits WHERE id = p_audit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conferência não encontrada.'; END IF;
  IF a.status = 'completed' THEN
    RAISE EXCEPTION 'Esta conferência já foi fechada.';
  END IF;
  IF a.assigned_to IS DISTINCT FROM uid
     AND a.created_by IS DISTINCT FROM uid
     AND NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'Sem permissão para entregar esta conferência.';
  END IF;

  SELECT count(*) INTO v_pending FROM public.location_audit_items
   WHERE audit_id = p_audit_id AND status <> 'counted';
  IF v_pending > 0 THEN
    RAISE EXCEPTION 'Faltam % artigo(s) por confirmar.', v_pending;
  END IF;

  IF a.delivered_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'ja_entregue', 'delivered_at', a.delivered_at);
  END IF;

  UPDATE public.location_audits
     SET delivered_at = now(), delivered_by = uid, updated_at = now()
   WHERE id = p_audit_id;

  RETURN jsonb_build_object('status', 'entregue');
END; $function$;

GRANT EXECUTE ON FUNCTION public.deliver_location_audit(uuid) TO authenticated, service_role;

-- 6. Fecho transacional da conferência
CREATE OR REPLACE FUNCTION public.complete_location_audit(
  p_audit_id uuid,
  p_accept_drift boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  a public.location_audits;
  it RECORD;
  v_pending integer;
  v_missing integer;
  v_current integer;
  v_delta integer;
  v_rem integer;
  v_take integer;
  v_target uuid;
  r RECORD;
  mv_id uuid;
  v_applied integer := 0;
  v_drift jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO a FROM public.location_audits WHERE id = p_audit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conferência não encontrada.'; END IF;

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
     AND COALESCE(btrim(notes), '') = '';
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Indique o motivo em % linha(s) com divergência antes de fechar.', v_missing;
  END IF;

  -- Deteção de stock movimentado desde a referência da contagem
  IF NOT p_accept_drift THEN
    FOR it IN
      SELECT * FROM public.location_audit_items
       WHERE audit_id = p_audit_id AND applied_at IS NULL AND product_id IS NOT NULL
    LOOP
      SELECT COALESCE(SUM(quantity), 0) INTO v_current FROM public.counts c
       WHERE c.product_id = it.product_id
         AND lower(btrim(COALESCE(c.location, ''))) = lower(btrim(COALESCE(it.location, '')))
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

  FOR it IN
    SELECT * FROM public.location_audit_items
     WHERE audit_id = p_audit_id
       AND applied_at IS NULL
       AND product_id IS NOT NULL
       AND COALESCE(difference, 0) <> 0
     ORDER BY location, product_code, colis_number
  LOOP
    SELECT COALESCE(SUM(quantity), 0) INTO v_current FROM public.counts c
     WHERE c.product_id = it.product_id
       AND lower(btrim(COALESCE(c.location, ''))) = lower(btrim(COALESCE(it.location, '')))
       AND (it.colis_number IS NULL OR c.colis_number = it.colis_number);

    v_delta := COALESCE(it.counted_quantity, 0) - v_current;

    IF v_delta < 0 THEN
      -- Retira das linhas existentes, incluindo administrativas, começando pelas maiores
      v_rem := -v_delta;
      FOR r IN
        SELECT id, quantity FROM public.counts c
         WHERE c.product_id = it.product_id
           AND lower(btrim(COALESCE(c.location, ''))) = lower(btrim(COALESCE(it.location, '')))
           AND (it.colis_number IS NULL OR c.colis_number = it.colis_number)
           AND c.quantity > 0
         ORDER BY c.quantity DESC, c.id
         FOR UPDATE
      LOOP
        EXIT WHEN v_rem <= 0;
        v_take := LEAST(r.quantity, v_rem);
        UPDATE public.counts SET quantity = quantity - v_take, updated_at = now() WHERE id = r.id;
        v_rem := v_rem - v_take;
      END LOOP;
      IF v_rem > 0 THEN
        RAISE EXCEPTION 'Não foi possível reduzir % unidade(s) de % em %: stock insuficiente.',
          v_rem, it.product_code, it.location;
      END IF;

    ELSIF v_delta > 0 THEN
      SELECT id INTO v_target FROM public.counts c
       WHERE c.product_id = it.product_id
         AND lower(btrim(COALESCE(c.location, ''))) = lower(btrim(COALESCE(it.location, '')))
         AND (it.colis_number IS NULL OR c.colis_number = it.colis_number)
       ORDER BY (c.session_id IS NULL) DESC, c.quantity DESC, c.id
       LIMIT 1
       FOR UPDATE;

      IF v_target IS NOT NULL THEN
        UPDATE public.counts SET quantity = quantity + v_delta, updated_at = now() WHERE id = v_target;
      ELSE
        INSERT INTO public.counts (product_id, colis_number, quantity, session_id, location, counted_by)
        VALUES (it.product_id, COALESCE(it.colis_number, 1), v_delta, NULL,
                public.assert_valid_location(it.location), uid);
      END IF;
    END IF;

    INSERT INTO public.stock_movements (
      product_id, movement_type, quantity, reason, reference, notes, created_by
    ) VALUES (
      it.product_id,
      'ajuste',
      abs(v_delta),
      it.notes,
      'CONF-' || left(p_audit_id::text, 8),
      format('%s · coli %s · %s · referência %s · contado %s · saldo antes %s · saldo depois %s',
             it.location,
             COALESCE(it.colis_number::text, '—'),
             CASE WHEN v_delta > 0 THEN 'ajuste positivo' WHEN v_delta < 0 THEN 'ajuste negativo' ELSE 'sem alteração' END,
             it.expected_quantity,
             COALESCE(it.counted_quantity, 0),
             v_current,
             v_current + v_delta),
      uid
    ) RETURNING id INTO mv_id;

    INSERT INTO public.stock_movement_lines (
      movement_id, product_id, colis_number, quantity, location, location_to
    ) VALUES (
      mv_id, it.product_id, COALESCE(it.colis_number, 1), abs(v_delta),
      it.location, it.location
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

  RETURN jsonb_build_object('status', 'fechada', 'adjustments', v_applied);
END; $function$;

GRANT EXECUTE ON FUNCTION public.complete_location_audit(uuid, boolean) TO authenticated, service_role;

-- 7. Avarias: destino válido e quantidade suficiente
CREATE OR REPLACE FUNCTION public.resolve_damage(
  p_damage_id uuid,
  p_resolution_type text,
  p_resolution_notes text,
  p_destination_location text,
  p_supplier_reference text,
  p_allow_partial boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  dmg public.product_damages; uid uuid := auth.uid();
  v_q text; v_colis integer[]; c integer; v_moved integer; v_total integer;
  v_dest text; mv_id uuid; rem integer; src RECORD; take integer;
  v_type text := lower(trim(COALESCE(p_resolution_type,'')));
  v_notes text := p_resolution_notes;
  v_min_done integer := NULL;
BEGIN
  SELECT * INTO dmg FROM public.product_damages WHERE id = p_damage_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Avaria % não encontrada', p_damage_id; END IF;
  IF dmg.status = 'resolved' THEN
    RETURN jsonb_build_object('status','already_resolved','damage_id',p_damage_id,'resolved_at',dmg.resolved_at);
  END IF;
  IF v_type NOT IN ('recuperado','abatido','devolvido_fornecedor','vendido_saldo') THEN
    RAISE EXCEPTION 'Tipo de resolução inválido: %', p_resolution_type;
  END IF;

  v_q := COALESCE(NULLIF(trim(COALESCE(dmg.location,'')),''), 'QUARENTENA');

  IF dmg.colis_number IS NULL THEN
    v_total := public.effective_total_colis(dmg.product_id);
    SELECT array_agg(i) INTO v_colis FROM generate_series(1, GREATEST(v_total,1)) i;
  ELSE
    v_colis := ARRAY[dmg.colis_number];
  END IF;

  IF v_type IN ('recuperado','vendido_saldo') THEN
    IF v_type = 'recuperado' THEN
      v_dest := COALESCE(
        NULLIF(trim(COALESCE(p_destination_location,'')), ''),
        NULLIF(trim(COALESCE(dmg.source_location,'')), ''));
      IF v_dest IS NULL THEN
        RAISE EXCEPTION 'Indique a localização de destino: a avaria não guarda a origem.';
      END IF;
    ELSE
      v_dest := NULLIF(trim(COALESCE(p_destination_location,'')), '');
      IF v_dest IS NULL THEN RAISE EXCEPTION 'Localização de destino obrigatória para venda em saldo'; END IF;
      v_notes := COALESCE(v_notes || ' | ', '') || 'Segunda escolha';
    END IF;

    v_dest := public.assert_valid_location(v_dest);

    INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, notes, created_by)
    VALUES (dmg.product_id, 'transferencia', dmg.quantity,
            CASE WHEN v_type = 'recuperado' THEN 'avaria_recuperada' ELSE 'avaria_vendido_saldo' END,
            v_notes, uid)
    RETURNING id INTO mv_id;

    FOREACH c IN ARRAY v_colis LOOP
      v_moved := public.move_stock_qty(dmg.product_id, c, dmg.quantity, v_q, v_dest);
      IF v_moved < dmg.quantity AND NOT p_allow_partial THEN
        RAISE EXCEPTION 'Quantidade insuficiente em % para o coli % (pedidas %, disponíveis %). Nada foi alterado.',
          v_q, c, dmg.quantity, v_moved;
      END IF;
      v_min_done := LEAST(COALESCE(v_min_done, v_moved), v_moved);
      INSERT INTO public.stock_movement_lines (movement_id, product_id, colis_number, quantity, location, location_to)
      VALUES (mv_id, dmg.product_id, c, v_moved, v_q, v_dest);
    END LOOP;
  ELSE
    INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, reference, notes, created_by)
    VALUES (dmg.product_id, 'saida', dmg.quantity,
            CASE WHEN v_type = 'abatido' THEN 'abate' ELSE 'devolucao_fornecedor' END,
            NULLIF(trim(COALESCE(p_supplier_reference,'')), ''), v_notes, uid)
    RETURNING id INTO mv_id;

    FOREACH c IN ARRAY v_colis LOOP
      rem := dmg.quantity;
      FOR src IN
        SELECT id, quantity FROM public.counts
         WHERE product_id = dmg.product_id AND colis_number = c AND quantity > 0
           AND lower(trim(COALESCE(location,''))) = lower(v_q)
         ORDER BY quantity DESC FOR UPDATE
      LOOP
        EXIT WHEN rem <= 0;
        take := LEAST(src.quantity, rem);
        UPDATE public.counts SET quantity = quantity - take, updated_at = now() WHERE id = src.id;
        rem := rem - take;
      END LOOP;

      IF rem > 0 AND NOT p_allow_partial THEN
        RAISE EXCEPTION 'Quantidade insuficiente em % para o coli % (faltam %). Nada foi alterado.',
          v_q, c, rem;
      END IF;

      v_min_done := LEAST(COALESCE(v_min_done, dmg.quantity - rem), dmg.quantity - rem);
      INSERT INTO public.stock_movement_lines (movement_id, product_id, colis_number, quantity, location)
      VALUES (mv_id, dmg.product_id, c, dmg.quantity - rem, v_q);
    END LOOP;
  END IF;

  v_min_done := COALESCE(v_min_done, 0);

  IF v_min_done >= dmg.quantity THEN
    UPDATE public.product_damages
       SET status = 'resolved', resolved_at = now(), resolution_type = v_type,
           resolution_notes = v_notes, updated_at = now()
     WHERE id = p_damage_id;
    RETURN jsonb_build_object('status','resolved','damage_id',p_damage_id,'resolution_type',v_type,'quantity',v_min_done);
  END IF;

  -- Resolução parcial explícita: mantém a avaria pendente com o restante
  UPDATE public.product_damages
     SET quantity = dmg.quantity - v_min_done,
         resolution_notes = COALESCE(v_notes || ' | ', '') ||
           format('Resolução parcial de %s un. em %s', v_min_done, to_char(now(), 'YYYY-MM-DD HH24:MI')),
         updated_at = now()
   WHERE id = p_damage_id;

  RETURN jsonb_build_object('status','partial','damage_id',p_damage_id,'resolution_type',v_type,
                            'quantity', v_min_done, 'remaining', dmg.quantity - v_min_done);
END; $function$;

GRANT EXECUTE ON FUNCTION public.resolve_damage(uuid, text, text, text, text, boolean) TO authenticated, service_role;