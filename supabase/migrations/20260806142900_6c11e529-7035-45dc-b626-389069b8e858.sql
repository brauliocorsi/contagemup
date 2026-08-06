CREATE OR REPLACE FUNCTION public.merge_colis_counts(
  p_product_id uuid,
  p_session_id uuid,
  p_colis_number integer,
  p_location text,
  p_pallet text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_total
  FROM public.counts
  WHERE product_id = p_product_id
    AND colis_number = p_colis_number
    AND (session_id = p_session_id OR session_id IS NULL);

  DELETE FROM public.counts
  WHERE product_id = p_product_id
    AND colis_number = p_colis_number
    AND (session_id = p_session_id OR session_id IS NULL);

  IF v_total > 0 THEN
    INSERT INTO public.counts (session_id, product_id, colis_number, quantity, location, pallet_number, counted_by)
    VALUES (p_session_id, p_product_id, p_colis_number, v_total, NULLIF(p_location, ''), NULLIF(p_pallet, ''), auth.uid());
  END IF;

  RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.split_colis_counts(
  p_product_id uuid,
  p_session_id uuid,
  p_colis_number integer,
  p_distributions jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  DELETE FROM public.counts
  WHERE product_id = p_product_id
    AND colis_number = p_colis_number
    AND (session_id = p_session_id OR session_id IS NULL);

  INSERT INTO public.counts (session_id, product_id, colis_number, quantity, location, pallet_number, counted_by)
  SELECT p_session_id, p_product_id, p_colis_number,
         (d->>'quantity')::int,
         NULLIF(d->>'location', ''),
         NULLIF(d->>'pallet_number', ''),
         auth.uid()
  FROM jsonb_array_elements(p_distributions) d
  WHERE COALESCE((d->>'quantity')::int, 0) > 0;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_colis_counts(uuid, uuid, integer, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.split_colis_counts(uuid, uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_colis_counts(uuid, uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.split_colis_counts(uuid, uuid, integer, jsonb) TO authenticated;