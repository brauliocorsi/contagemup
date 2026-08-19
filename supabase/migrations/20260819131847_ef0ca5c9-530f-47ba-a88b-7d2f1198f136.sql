ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS last_supplier text;

CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique ON public.products (barcode) WHERE barcode IS NOT NULL;

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS supplier_name text;

CREATE TABLE IF NOT EXISTS public.product_barcodes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  barcode text NOT NULL UNIQUE,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_barcodes TO authenticated;
GRANT ALL ON public.product_barcodes TO service_role;

ALTER TABLE public.product_barcodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view product barcodes" ON public.product_barcodes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert product barcodes" ON public.product_barcodes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update product barcodes" ON public.product_barcodes
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can delete product barcodes" ON public.product_barcodes
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_product_barcodes_updated_at
  BEFORE UPDATE ON public.product_barcodes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS product_barcodes_product_id_idx ON public.product_barcodes (product_id);

CREATE OR REPLACE FUNCTION public.transfer_stock_location(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  it jsonb;
  src RECORD;
  v_qty integer;
  v_location text;
  v_pallet text;
  target_id uuid;
  moved integer := 0;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items must be a JSON array';
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO src FROM public.counts WHERE id = (it->>'count_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_qty := LEAST(COALESCE((it->>'quantity')::integer, 0), src.quantity);
    IF v_qty <= 0 THEN
      CONTINUE;
    END IF;

    v_location := NULLIF(trim(COALESCE(it->>'location', '')), '');
    v_pallet := NULLIF(trim(COALESCE(it->>'pallet_number', '')), '');

    IF COALESCE(src.location,'') = COALESCE(v_location,'')
       AND COALESCE(src.pallet_number,'') = COALESCE(v_pallet,'') THEN
      CONTINUE;
    END IF;

    SELECT id INTO target_id FROM public.counts
    WHERE product_id = src.product_id
      AND colis_number = src.colis_number
      AND id <> src.id
      AND COALESCE(location,'') = COALESCE(v_location,'')
      AND COALESCE(pallet_number,'') = COALESCE(v_pallet,'')
    ORDER BY (session_id IS NULL) DESC, quantity DESC
    LIMIT 1;

    IF v_qty = src.quantity AND target_id IS NULL THEN
      UPDATE public.counts
        SET location = v_location, pallet_number = v_pallet, updated_at = now()
        WHERE id = src.id;
    ELSE
      IF v_qty = src.quantity THEN
        DELETE FROM public.counts WHERE id = src.id;
      ELSE
        UPDATE public.counts
          SET quantity = quantity - v_qty, updated_at = now()
          WHERE id = src.id;
      END IF;

      IF target_id IS NOT NULL THEN
        UPDATE public.counts
          SET quantity = quantity + v_qty, updated_at = now()
          WHERE id = target_id;
      ELSE
        INSERT INTO public.counts (product_id, colis_number, quantity, session_id, location, pallet_number, counted_by)
        VALUES (src.product_id, src.colis_number, v_qty, NULL, v_location, v_pallet, uid);
      END IF;
    END IF;

    moved := moved + 1;
  END LOOP;

  RETURN jsonb_build_object('moved', moved);
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_pallet_location(p_pallet text, p_location text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_location text := NULLIF(trim(COALESCE(p_location,'')), '');
  v_rows integer := 0;
  v_loc_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF p_pallet IS NULL OR trim(p_pallet) = '' THEN
    RAISE EXCEPTION 'Palete obrigatório';
  END IF;

  UPDATE public.counts SET location = v_location, updated_at = now()
  WHERE pallet_number = p_pallet;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  UPDATE public.stock_order_numbers SET location = v_location, updated_at = now()
  WHERE pallet_number = p_pallet;

  SELECT id INTO v_loc_id FROM public.warehouse_locations
  WHERE lower(trim(code)) = lower(COALESCE(v_location,'')) LIMIT 1;

  IF v_loc_id IS NOT NULL THEN
    UPDATE public.warehouse_pallets SET current_location_id = v_loc_id, updated_at = now()
    WHERE code = p_pallet;
  END IF;

  RETURN jsonb_build_object('rows', v_rows);
END;
$$;

INSERT INTO public.warehouse_locations (code, position_in_aisle, notes)
SELECT 'CONF', 0, 'Zona de conferência: entradas sem localização definida'
WHERE NOT EXISTS (SELECT 1 FROM public.warehouse_locations WHERE upper(code) = 'CONF');