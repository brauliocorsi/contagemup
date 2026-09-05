CREATE OR REPLACE FUNCTION public.regularize_damage(
  p_damage_id uuid,
  p_action text,
  p_found_location text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_damage public.product_damages%ROWTYPE;
  v_coli integer;
  v_count_id uuid;
  v_movement_id uuid;
  v_prev_location text;
  v_prev_source_location text;
BEGIN
  SELECT * INTO v_damage FROM public.product_damages WHERE id = p_damage_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Avaria não encontrada';
  END IF;
  IF v_damage.status <> 'active' THEN
    RAISE EXCEPTION 'Esta avaria já não está ativa';
  END IF;

  v_prev_location := v_damage.location;
  v_prev_source_location := v_damage.source_location;

  IF p_action = 'found' THEN
    IF p_found_location IS NULL OR btrim(p_found_location) = '' THEN
      RAISE EXCEPTION 'Indique a localização física onde a peça foi encontrada';
    END IF;

    v_coli := COALESCE(v_damage.colis_number, 1);

    SELECT id INTO v_count_id
    FROM public.counts
    WHERE product_id = v_damage.product_id
      AND colis_number = v_coli
      AND session_id IS NULL
      AND COALESCE(location, '') = 'QUARENTENA'
    LIMIT 1;

    IF v_count_id IS NULL THEN
      INSERT INTO public.counts (product_id, colis_number, quantity, location, session_id, counted_by)
      VALUES (v_damage.product_id, v_coli, v_damage.quantity, 'QUARENTENA', NULL, auth.uid())
      RETURNING id INTO v_count_id;
    ELSE
      UPDATE public.counts
      SET quantity = quantity + v_damage.quantity, updated_at = now()
      WHERE id = v_count_id;
    END IF;

    INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, reference, notes, created_by)
    VALUES (
      v_damage.product_id, 'entrada', v_damage.quantity, 'regularizacao_avaria',
      'REGULARIZACAO-AVARIA',
      'Regularização histórica de avaria. Peça encontrada em: ' || p_found_location || '. Colocada em QUARENTENA.',
      auth.uid()
    ) RETURNING id INTO v_movement_id;

    INSERT INTO public.stock_movement_lines (movement_id, product_id, colis_number, quantity, location)
    VALUES (v_movement_id, v_damage.product_id, v_coli, v_damage.quantity, 'QUARENTENA');

    UPDATE public.product_damages
    SET source_location = p_found_location,
        location = 'QUARENTENA',
        updated_at = now()
    WHERE id = p_damage_id;

    RETURN jsonb_build_object(
      'action', 'found',
      'damage_id', p_damage_id,
      'movement_id', v_movement_id,
      'count_id', v_count_id,
      'quantity', v_damage.quantity,
      'prev_location', v_prev_location,
      'prev_source_location', v_prev_source_location
    );

  ELSIF p_action IN ('not_found', 'already_resolved') THEN
    UPDATE public.product_damages
    SET status = 'resolved',
        resolved_at = now(),
        resolution_type = CASE WHEN p_action = 'not_found' THEN 'historico_sem_stock' ELSE 'ja_resolvido_fora_do_sistema' END,
        resolution_notes = CASE
          WHEN p_action = 'not_found'
            THEN 'Regularização histórica: peça não encontrada no armazém. Registo fechado sem movimento de stock.'
          ELSE 'Regularização histórica: avaria já tratada fora do sistema. Registo fechado sem movimento de stock.'
        END,
        updated_at = now()
    WHERE id = p_damage_id;

    RETURN jsonb_build_object('action', p_action, 'damage_id', p_damage_id);
  ELSE
    RAISE EXCEPTION 'Ação inválida: %', p_action;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_regularize_damage(
  p_damage_id uuid,
  p_action text,
  p_movement_id uuid DEFAULT NULL,
  p_prev_location text DEFAULT NULL,
  p_prev_source_location text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_damage public.product_damages%ROWTYPE;
  v_coli integer;
  v_qty integer;
BEGIN
  SELECT * INTO v_damage FROM public.product_damages WHERE id = p_damage_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Avaria não encontrada';
  END IF;

  IF p_action = 'found' THEN
    IF p_movement_id IS NULL THEN
      RAISE EXCEPTION 'Movimento em falta para desfazer';
    END IF;

    SELECT quantity INTO v_qty FROM public.stock_movements
    WHERE id = p_movement_id AND reason = 'regularizacao_avaria';
    IF v_qty IS NULL THEN
      RAISE EXCEPTION 'Movimento de regularização não encontrado';
    END IF;

    v_coli := COALESCE(v_damage.colis_number, 1);

    UPDATE public.counts
    SET quantity = GREATEST(quantity - v_qty, 0), updated_at = now()
    WHERE product_id = v_damage.product_id
      AND colis_number = v_coli
      AND session_id IS NULL
      AND COALESCE(location, '') = 'QUARENTENA';

    DELETE FROM public.stock_movement_lines WHERE movement_id = p_movement_id;
    DELETE FROM public.stock_movements WHERE id = p_movement_id;

    UPDATE public.product_damages
    SET location = p_prev_location,
        source_location = p_prev_source_location,
        updated_at = now()
    WHERE id = p_damage_id;

  ELSIF p_action IN ('not_found', 'already_resolved') THEN
    UPDATE public.product_damages
    SET status = 'active',
        resolved_at = NULL,
        resolution_type = NULL,
        resolution_notes = NULL,
        updated_at = now()
    WHERE id = p_damage_id;
  ELSE
    RAISE EXCEPTION 'Ação inválida: %', p_action;
  END IF;

  RETURN jsonb_build_object('undone', p_action, 'damage_id', p_damage_id);
END;
$$;

REVOKE ALL ON FUNCTION public.regularize_damage(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.undo_regularize_damage(uuid, text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regularize_damage(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.undo_regularize_damage(uuid, text, uuid, text, text) TO authenticated, service_role;