-- 1. Fix undo_regularize_damage
DROP FUNCTION IF EXISTS public.undo_regularize_damage(uuid, text, uuid, text, text);
CREATE FUNCTION public.undo_regularize_damage(p_damage_id uuid, p_action text, p_movement_id uuid DEFAULT NULL, p_prev_location text DEFAULT NULL, p_prev_source_location text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_damage public.product_damages%ROWTYPE;
  v_coli integer;
  v_qty integer;
  v_mov_product uuid;
BEGIN
  SELECT * INTO v_damage FROM public.product_damages WHERE id = p_damage_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Avaria não encontrada';
  END IF;

  IF p_action = 'found' THEN
    IF p_movement_id IS NULL THEN
      RAISE EXCEPTION 'Movimento em falta para desfazer';
    END IF;

    SELECT quantity, product_id INTO v_qty, v_mov_product FROM public.stock_movements
    WHERE id = p_movement_id AND reason = 'regularizacao_avaria';
    IF v_qty IS NULL THEN
      RAISE EXCEPTION 'Movimento de regularização não encontrado';
    END IF;
    IF v_mov_product IS DISTINCT FROM v_damage.product_id THEN
      RAISE EXCEPTION 'O movimento indicado não pertence a esta avaria';
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
    IF COALESCE(v_damage.resolution_type, '') NOT IN ('historico_sem_stock', 'ja_resolvido_fora_do_sistema') THEN
      RAISE EXCEPTION 'Esta avaria foi resolvida pelo fluxo normal e não pode ser reaberta pela regularização';
    END IF;

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

REVOKE ALL ON FUNCTION public.undo_regularize_damage(uuid, text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_regularize_damage(uuid, text, uuid, text, text) TO authenticated;

-- 2. Drop unused decrement_counts_for_picking
DROP FUNCTION IF EXISTS public.decrement_counts_for_picking(uuid, integer, boolean, integer, jsonb, jsonb);

-- 3. Missing locations
INSERT INTO public.warehouse_locations (code, aisle_id, level_id, position_in_aisle, notes, is_staging, location_type)
VALUES
  ('A25', (SELECT id FROM public.warehouse_aisles WHERE name = 'A'), NULL, 25, 'Criada na regularização do cadastro', false, 'stock'),
  ('A26', (SELECT id FROM public.warehouse_aisles WHERE name = 'A'), NULL, 26, 'Criada na regularização do cadastro', false, 'stock'),
  ('A27', (SELECT id FROM public.warehouse_aisles WHERE name = 'A'), NULL, 27, 'Criada na regularização do cadastro', false, 'stock'),
  ('BC', NULL, NULL, 1, 'Criada na regularização do cadastro - código fora do padrão, precisa de revisão manual', false, 'stock')
ON CONFLICT DO NOTHING;

-- 4. Remove duplicate CONFERÊNCIA location (no references)
DELETE FROM public.warehouse_locations WHERE code = 'CONFERÊNCIA';