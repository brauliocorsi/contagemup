CREATE OR REPLACE FUNCTION public.sync_note_item_colis_from_aggregate()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE n integer; v_min_s integer; v_min_l integer;
BEGIN
  SELECT COUNT(*), MIN(staged_quantity), MIN(loaded_quantity)
    INTO n, v_min_s, v_min_l
    FROM public.delivery_note_item_colis WHERE note_item_id = NEW.id;

  IF COALESCE(n,0) = 0 THEN
    IF COALESCE(NEW.staged_quantity,0) = 0 AND COALESCE(NEW.loaded_quantity,0) = 0 THEN
      RETURN NEW;
    END IF;
    PERFORM public.ensure_note_item_colis(NEW.id);
  END IF;

  SELECT COUNT(*), MIN(staged_quantity), MIN(loaded_quantity)
    INTO n, v_min_s, v_min_l
    FROM public.delivery_note_item_colis WHERE note_item_id = NEW.id;
  IF COALESCE(n,0) = 0 THEN RETURN NEW; END IF;

  IF COALESCE(v_min_s,0) IS DISTINCT FROM NEW.staged_quantity
     OR COALESCE(v_min_l,0) IS DISTINCT FROM NEW.loaded_quantity THEN
    UPDATE public.delivery_note_item_colis
       SET staged_quantity = NEW.staged_quantity,
           loaded_quantity = NEW.loaded_quantity,
           requested_quantity = GREATEST(requested_quantity, NEW.quantity),
           evidence = CASE WHEN evidence = 'scan' THEN 'office_aggregate_override' ELSE 'office_aggregate' END,
           updated_at = now()
     WHERE note_item_id = NEW.id;
  END IF;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION public.sync_note_item_colis_from_aggregate() FROM PUBLIC, anon, authenticated;