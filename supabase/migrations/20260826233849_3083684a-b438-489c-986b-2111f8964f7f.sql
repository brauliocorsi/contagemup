CREATE OR REPLACE FUNCTION public.load_notes_to_vehicle(
  p_note_ids uuid[], p_vehicle_location text, p_items jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  it RECORD; v_qty integer; v_total integer; coli integer; v_moved integer; v_min integer;
  uid uuid := auth.uid(); v_veh text; loaded integer := 0; n uuid; v_pending integer;
  partial integer := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_veh := NULLIF(trim(COALESCE(p_vehicle_location,'')), '');
  IF v_veh IS NULL THEN RAISE EXCEPTION 'Viatura obrigatória'; END IF;

  FOR it IN
    SELECT i.*, dn.dock_location FROM public.delivery_note_items i
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
    IF it.product_id IS NOT NULL THEN
      v_total := public.effective_total_colis(it.product_id);
      v_min := NULL;
      FOR coli IN 1..v_total LOOP
        v_moved := public.move_stock_qty(it.product_id, coli, v_qty, it.dock_location, v_veh);
        IF v_min IS NULL OR v_moved < v_min THEN v_min := v_moved; END IF;
      END LOOP;
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
      SET vehicle_location = v_veh
      WHERE id = n AND status IN ('picking','staged');
    ELSE
      UPDATE public.delivery_notes
      SET status = 'loaded', vehicle_location = v_veh, loaded_at = COALESCE(loaded_at, now())
      WHERE id = n AND status IN ('picking','staged','loaded');
    END IF;
  END LOOP;

  RETURN jsonb_build_object('loaded', loaded, 'vehicle', v_veh, 'partial_notes', partial);
END; $$;