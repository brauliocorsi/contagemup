-- 1. Tipos de localização
ALTER TABLE public.warehouse_locations
  ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'stock';

UPDATE public.warehouse_locations SET location_type = 'pre_exit' WHERE is_staging = true;

ALTER TABLE public.warehouse_locations
  ADD CONSTRAINT warehouse_locations_location_type_check
  CHECK (location_type IN ('stock','pre_exit','transport','quarantine'));

-- 2. Notas de entrega
CREATE TABLE public.delivery_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL,
  task_id uuid REFERENCES public.scanner_picking_tasks(id) ON DELETE SET NULL,
  client_name text,
  status text NOT NULL DEFAULT 'staged',
  dock_location text,
  vehicle_location text,
  notes text,
  created_by uuid,
  staged_at timestamptz,
  loaded_at timestamptz,
  delivered_at timestamptz,
  delivered_by uuid,
  returned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_notes_status_check CHECK (status IN ('picking','staged','loaded','delivered','returned'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_notes TO authenticated;
GRANT ALL ON public.delivery_notes TO service_role;
ALTER TABLE public.delivery_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados veem notas" ON public.delivery_notes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados criam notas" ON public.delivery_notes
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Autenticados atualizam notas" ON public.delivery_notes
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins eliminam notas" ON public.delivery_notes
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_delivery_notes_updated_at
  BEFORE UPDATE ON public.delivery_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_delivery_notes_status ON public.delivery_notes(status);
CREATE INDEX idx_delivery_notes_order ON public.delivery_notes(order_number);

-- 3. Artigos da nota
CREATE TABLE public.delivery_note_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES public.delivery_notes(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  product_code text NOT NULL DEFAULT '',
  product_name text NOT NULL,
  details text,
  quantity integer NOT NULL DEFAULT 0,
  staged_quantity integer NOT NULL DEFAULT 0,
  loaded_quantity integer NOT NULL DEFAULT 0,
  delivered_quantity integer NOT NULL DEFAULT 0,
  returned_quantity integer NOT NULL DEFAULT 0,
  location text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_note_items TO authenticated;
GRANT ALL ON public.delivery_note_items TO service_role;
ALTER TABLE public.delivery_note_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados veem artigos da nota" ON public.delivery_note_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados criam artigos da nota" ON public.delivery_note_items
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Autenticados atualizam artigos da nota" ON public.delivery_note_items
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins eliminam artigos da nota" ON public.delivery_note_items
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_delivery_note_items_updated_at
  BEFORE UPDATE ON public.delivery_note_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_delivery_note_items_note ON public.delivery_note_items(note_id);

-- 4. Helper: mover quantidade de um coli entre localizações
CREATE OR REPLACE FUNCTION public.move_stock_qty(
  p_product_id uuid, p_coli integer, p_qty integer, p_from text, p_to text
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  remaining integer := COALESCE(p_qty, 0);
  src RECORD; take integer; target uuid; uid uuid := auth.uid();
  v_to text := NULLIF(trim(COALESCE(p_to,'')), '');
BEGIN
  IF remaining <= 0 THEN RETURN 0; END IF;

  FOR src IN
    SELECT id, quantity, location FROM public.counts
    WHERE product_id = p_product_id AND colis_number = p_coli AND quantity > 0
      AND (p_from IS NULL OR lower(trim(COALESCE(location,''))) = lower(trim(p_from)))
      AND lower(trim(COALESCE(location,''))) IS DISTINCT FROM lower(trim(COALESCE(v_to,'')))
    ORDER BY quantity DESC
    FOR UPDATE
  LOOP
    EXIT WHEN remaining <= 0;
    take := LEAST(src.quantity, remaining);
    UPDATE public.counts SET quantity = quantity - take, updated_at = now() WHERE id = src.id;
    remaining := remaining - take;

    SELECT id INTO target FROM public.counts
    WHERE product_id = p_product_id AND colis_number = p_coli AND id <> src.id
      AND COALESCE(location,'') = COALESCE(v_to,'')
    ORDER BY (session_id IS NULL) DESC, quantity DESC LIMIT 1;

    IF target IS NOT NULL THEN
      UPDATE public.counts SET quantity = quantity + take, updated_at = now() WHERE id = target;
    ELSE
      INSERT INTO public.counts (product_id, colis_number, quantity, session_id, location, counted_by)
      VALUES (p_product_id, p_coli, take, NULL, v_to, uid);
    END IF;
  END LOOP;

  RETURN COALESCE(p_qty,0) - remaining;
END; $$;

CREATE OR REPLACE FUNCTION public.effective_total_colis(p_product_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT GREATEST(
    COALESCE(p.total_colis, 1),
    COALESCE((SELECT count(*)::integer FROM jsonb_object_keys(c.colis_names) k), 0),
    1)
  FROM public.products p LEFT JOIN public.categories c ON p.category = c.name
  WHERE p.id = p_product_id;
$$;

-- 5. Picking -> cais
CREATE OR REPLACE FUNCTION public.stage_picking_to_dock(
  p_task_id uuid, p_dock_location text, p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  ln jsonb; v_note uuid; v_order text; v_pid uuid; v_qty integer;
  v_total integer; coli integer; v_moved integer; v_min integer;
  uid uuid := auth.uid(); notes_out jsonb := '[]'::jsonb; v_dock text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_dock := NULLIF(trim(COALESCE(p_dock_location,'')), '');
  IF v_dock IS NULL THEN RAISE EXCEPTION 'Localização de pré-saída obrigatória'; END IF;

  FOR ln IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_order := NULLIF(trim(COALESCE(ln->>'order_number','')), '');
    IF v_order IS NULL THEN v_order := 'SEM-NOTA'; END IF;
    v_pid := NULLIF(ln->>'product_id','')::uuid;
    v_qty := COALESCE((ln->>'quantity')::integer, 0);
    IF v_qty <= 0 THEN CONTINUE; END IF;

    SELECT id INTO v_note FROM public.delivery_notes
      WHERE order_number = v_order AND status IN ('picking','staged','loaded') LIMIT 1;
    IF v_note IS NULL THEN
      INSERT INTO public.delivery_notes (order_number, task_id, client_name, status, dock_location, created_by, staged_at)
      VALUES (v_order, p_task_id, NULLIF(ln->>'client_name',''), 'staged', v_dock, uid, now())
      RETURNING id INTO v_note;
      notes_out := notes_out || jsonb_build_array(v_order);
    ELSE
      UPDATE public.delivery_notes SET dock_location = v_dock, staged_at = COALESCE(staged_at, now()),
        status = CASE WHEN status = 'picking' THEN 'staged' ELSE status END
      WHERE id = v_note;
    END IF;

    v_min := NULL;
    IF v_pid IS NOT NULL THEN
      v_total := public.effective_total_colis(v_pid);
      FOR coli IN 1..v_total LOOP
        v_moved := public.move_stock_qty(v_pid, coli, v_qty, NULL, v_dock);
        IF v_min IS NULL OR v_moved < v_min THEN v_min := v_moved; END IF;
      END LOOP;
    END IF;

    INSERT INTO public.delivery_note_items (
      note_id, product_id, product_code, product_name, details, quantity, staged_quantity, location)
    VALUES (v_note, v_pid, COALESCE(ln->>'product_code',''), COALESCE(ln->>'product_name','?'),
      NULLIF(ln->>'details',''), v_qty, COALESCE(v_min, 0), v_dock);
  END LOOP;

  RETURN jsonb_build_object('notes', notes_out, 'dock', v_dock);
END; $$;

-- 6. Cais -> carrinha
CREATE OR REPLACE FUNCTION public.load_notes_to_vehicle(
  p_note_ids uuid[], p_vehicle_location text, p_items jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  it RECORD; v_qty integer; v_total integer; coli integer; v_moved integer; v_min integer;
  uid uuid := auth.uid(); v_veh text; loaded integer := 0; n uuid;
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
    UPDATE public.delivery_notes
    SET status = 'loaded', vehicle_location = v_veh, loaded_at = COALESCE(loaded_at, now())
    WHERE id = n AND status IN ('picking','staged','loaded');
  END LOOP;

  RETURN jsonb_build_object('loaded', loaded, 'vehicle', v_veh);
END; $$;

-- 7. Entrega confirmada -> saída real
CREATE OR REPLACE FUNCTION public.deliver_note(p_note_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  nt RECORD; it RECORD; v_total integer; coli integer; remaining integer;
  cr RECORD; take integer; uid uuid := auth.uid(); v_mov uuid; total_out integer := 0;
  v_min integer; debited integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO nt FROM public.delivery_notes WHERE id = p_note_id FOR UPDATE;
  IF nt IS NULL THEN RAISE EXCEPTION 'Nota não encontrada'; END IF;
  IF nt.status = 'delivered' THEN RAISE EXCEPTION 'Nota já entregue'; END IF;

  FOR it IN SELECT * FROM public.delivery_note_items WHERE note_id = p_note_id LOOP
    IF it.product_id IS NULL THEN CONTINUE; END IF;
    v_total := public.effective_total_colis(it.product_id);
    v_min := NULL;
    v_mov := NULL;

    FOR coli IN 1..v_total LOOP
      remaining := GREATEST(COALESCE(NULLIF(it.loaded_quantity,0), it.staged_quantity) - it.delivered_quantity, 0);
      debited := 0;
      FOR cr IN
        SELECT id, quantity, location FROM public.counts
        WHERE product_id = it.product_id AND colis_number = coli AND quantity > 0
          AND COALESCE(location,'') = COALESCE(it.location,'')
        ORDER BY quantity DESC FOR UPDATE
      LOOP
        EXIT WHEN remaining <= 0;
        take := LEAST(cr.quantity, remaining);
        UPDATE public.counts SET quantity = quantity - take, updated_at = now() WHERE id = cr.id;
        remaining := remaining - take;
        debited := debited + take;

        IF v_mov IS NULL THEN
          INSERT INTO public.stock_movements (product_id, movement_type, quantity, reason, reference, notes, created_by)
          VALUES (it.product_id, 'saida', 0, 'Venda', nt.order_number, 'Entrega confirmada', uid)
          RETURNING id INTO v_mov;
        END IF;
        INSERT INTO public.stock_movement_lines (movement_id, product_id, colis_number, quantity, location)
        VALUES (v_mov, it.product_id, coli, take, cr.location);
        total_out := total_out + take;
      END LOOP;
      IF v_min IS NULL OR debited < v_min THEN v_min := debited; END IF;
    END LOOP;

    IF v_mov IS NOT NULL THEN
      UPDATE public.stock_movements SET quantity = (
        SELECT COALESCE(sum(quantity),0) FROM public.stock_movement_lines WHERE movement_id = v_mov)
      WHERE id = v_mov;
    END IF;

    UPDATE public.delivery_note_items
    SET delivered_quantity = delivered_quantity + COALESCE(v_min,0), updated_at = now()
    WHERE id = it.id;
  END LOOP;

  UPDATE public.delivery_notes
  SET status = 'delivered', delivered_at = now(), delivered_by = uid
  WHERE id = p_note_id;

  RETURN jsonb_build_object('units', total_out, 'order_number', nt.order_number);
END; $$;

-- 8. Devolução -> quarentena
CREATE OR REPLACE FUNCTION public.return_note_items(
  p_note_id uuid, p_quarantine_location text, p_items jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  it RECORD; v_qty integer; v_total integer; coli integer; v_moved integer; v_min integer;
  uid uuid := auth.uid(); v_q text; moved integer := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_q := NULLIF(trim(COALESCE(p_quarantine_location,'')), '');
  IF v_q IS NULL THEN RAISE EXCEPTION 'Localização de quarentena obrigatória'; END IF;

  FOR it IN SELECT * FROM public.delivery_note_items WHERE note_id = p_note_id LOOP
    IF jsonb_array_length(COALESCE(p_items,'[]'::jsonb)) > 0 THEN
      SELECT COALESCE(x.quantity,0) INTO v_qty
      FROM jsonb_to_recordset(p_items) AS x(item_id uuid, quantity integer)
      WHERE x.item_id = it.id;
      v_qty := COALESCE(v_qty, 0);
    ELSE
      v_qty := GREATEST(COALESCE(NULLIF(it.loaded_quantity,0), it.staged_quantity) - it.returned_quantity, 0);
    END IF;
    IF v_qty <= 0 OR it.product_id IS NULL THEN CONTINUE; END IF;

    v_total := public.effective_total_colis(it.product_id);
    v_min := NULL;
    FOR coli IN 1..v_total LOOP
      v_moved := public.move_stock_qty(it.product_id, coli, v_qty, it.location, v_q);
      IF v_min IS NULL OR v_moved < v_min THEN v_min := v_moved; END IF;
    END LOOP;

    UPDATE public.delivery_note_items
    SET returned_quantity = returned_quantity + COALESCE(v_min,0), location = v_q, updated_at = now()
    WHERE id = it.id;
    moved := moved + COALESCE(v_min,0);
  END LOOP;

  UPDATE public.delivery_notes SET status = 'returned', returned_at = now() WHERE id = p_note_id;
  RETURN jsonb_build_object('moved', moved);
END; $$;