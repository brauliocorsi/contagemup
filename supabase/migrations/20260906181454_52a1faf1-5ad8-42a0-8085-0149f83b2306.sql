-- 1) Tipos de movimento realmente usados pelas funções do sistema
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type = ANY (ARRAY['entrada'::text, 'saida'::text, 'ajuste'::text, 'transferencia'::text]));

ALTER TABLE public.stock_movements_archive DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE public.stock_movements_archive DROP CONSTRAINT IF EXISTS stock_movements_archive_movement_type_check;
ALTER TABLE public.stock_movements_archive ADD CONSTRAINT stock_movements_archive_movement_type_check
  CHECK (movement_type = ANY (ARRAY['entrada'::text, 'saida'::text, 'ajuste'::text, 'transferencia'::text]));

-- 2) Histórico de contagem sem sessão + operação "set"
ALTER TABLE public.count_logs ALTER COLUMN session_id DROP NOT NULL;
ALTER TABLE public.count_logs DROP CONSTRAINT IF EXISTS count_logs_operation_check;
ALTER TABLE public.count_logs ADD CONSTRAINT count_logs_operation_check
  CHECK (operation = ANY (ARRAY['increment'::text, 'decrement'::text, 'set'::text]));

-- 3) Transferência de localização gera sempre movimento + linhas, na mesma transação
CREATE OR REPLACE FUNCTION public.transfer_stock_location(p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  it jsonb; src RECORD; v_qty integer; v_location text; target_id uuid;
  moved integer := 0; uid uuid := auth.uid(); mv_id uuid; v_from text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items must be a JSON array';
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO src FROM public.counts WHERE id = (it->>'count_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_qty := LEAST(COALESCE((it->>'quantity')::integer, 0), src.quantity);
    IF v_qty <= 0 THEN CONTINUE; END IF;

    v_location := public.assert_valid_location(it->>'location');
    IF COALESCE(src.location,'') = v_location THEN CONTINUE; END IF;
    v_from := COALESCE(NULLIF(btrim(COALESCE(src.location,'')),''), 'SEM-LOCALIZACAO');

    SELECT id INTO target_id FROM public.counts
    WHERE product_id = src.product_id AND colis_number = src.colis_number AND id <> src.id
      AND COALESCE(location,'') = v_location
    ORDER BY (session_id IS NULL) DESC, quantity DESC LIMIT 1;

    IF v_qty = src.quantity AND target_id IS NULL THEN
      UPDATE public.counts SET location = v_location, updated_at = now() WHERE id = src.id;
    ELSE
      IF v_qty = src.quantity THEN
        DELETE FROM public.counts WHERE id = src.id;
      ELSE
        UPDATE public.counts SET quantity = quantity - v_qty, updated_at = now() WHERE id = src.id;
      END IF;

      IF target_id IS NOT NULL THEN
        UPDATE public.counts SET quantity = quantity + v_qty, updated_at = now() WHERE id = target_id;
      ELSE
        INSERT INTO public.counts (product_id, colis_number, quantity, session_id, location, counted_by)
        VALUES (src.product_id, src.colis_number, v_qty, NULL, v_location, uid);
      END IF;
    END IF;

    INSERT INTO public.stock_movements (
      product_id, movement_type, quantity, reason, reference, notes, created_by
    ) VALUES (
      src.product_id, 'transferencia', v_qty, 'transferencia_localizacao',
      NULLIF(btrim(COALESCE(it->>'reference','')), ''),
      format('coli %s · %s -> %s · %s un.', src.colis_number, v_from, v_location, v_qty),
      uid
    ) RETURNING id INTO mv_id;

    INSERT INTO public.stock_movement_lines (
      movement_id, product_id, colis_number, quantity, location, location_to
    ) VALUES (mv_id, src.product_id, src.colis_number, v_qty, v_from, v_location);

    moved := moved + 1;
  END LOOP;

  RETURN jsonb_build_object('moved', moved);
END; $function$;