ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS unidades_fisicas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS colis_orfaos integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.sync_product_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  affected_product_id uuid; base_stock integer; product_total_colis integer;
  category_colis_count integer; eff_colis integer; coli_qty integer; min_qty integer; i integer;
  ids uuid[]; pid uuid; phys integer; orphans integer;
BEGIN
  IF TG_OP = 'DELETE' THEN affected_product_id := OLD.product_id; ELSE affected_product_id := NEW.product_id; END IF;
  ids := ARRAY[affected_product_id];
  IF TG_OP = 'UPDATE' AND OLD.product_id IS DISTINCT FROM NEW.product_id THEN
    ids := ids || OLD.product_id;
  END IF;

  FOREACH pid IN ARRAY ids LOOP
    SELECT p.total_colis, COALESCE((SELECT count(*)::integer FROM jsonb_object_keys(c.colis_names) as k), 0)
      INTO product_total_colis, category_colis_count
      FROM products p LEFT JOIN categories c ON p.category = c.name WHERE p.id = pid;
    eff_colis := GREATEST(COALESCE(product_total_colis, 1), COALESCE(category_colis_count, 0));

    SELECT COALESCE(SUM(quantity), 0) INTO phys FROM counts
     WHERE product_id = pid AND NOT public.is_quarantine_location(location);

    IF eff_colis <= 1 THEN
      base_stock := phys;
      orphans := 0;
    ELSE
      min_qty := NULL;
      FOR i IN 1..eff_colis LOOP
        SELECT COALESCE(SUM(quantity), 0) INTO coli_qty FROM counts
         WHERE product_id = pid AND colis_number = i AND NOT public.is_quarantine_location(location);
        IF min_qty IS NULL OR coli_qty < min_qty THEN min_qty := coli_qty; END IF;
      END LOOP;
      base_stock := COALESCE(min_qty, 0);
      orphans := GREATEST(phys - (GREATEST(base_stock, 0) * eff_colis), 0);
    END IF;

    UPDATE products
       SET current_stock = base_stock,
           unidades_fisicas = phys,
           colis_orfaos = orphans,
           updated_at = now()
     WHERE id = pid;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END; $function$;

-- Backfill dos novos campos derivados (sem tocar em current_stock nem em counts)
WITH eff AS (
  SELECT p.id,
         GREATEST(COALESCE(p.total_colis, 1),
                  COALESCE((SELECT count(*)::integer FROM jsonb_object_keys(c.colis_names) k), 0), 1) AS eff_colis
  FROM public.products p
  LEFT JOIN public.categories c ON p.category = c.name
), phys AS (
  SELECT p.id, COALESCE(SUM(ct.quantity), 0) AS units
  FROM public.products p
  LEFT JOIN public.counts ct ON ct.product_id = p.id AND NOT public.is_quarantine_location(ct.location)
  GROUP BY p.id
)
UPDATE public.products p
SET unidades_fisicas = phys.units,
    colis_orfaos = CASE WHEN eff.eff_colis <= 1 THEN 0
                        ELSE GREATEST(phys.units - GREATEST(p.current_stock, 0) * eff.eff_colis, 0) END
FROM eff, phys
WHERE eff.id = p.id AND phys.id = p.id;

-- Sinalizações de colis órfãos
CREATE TABLE IF NOT EXISTS public.orphan_colis_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  missing_coli integer,
  status text NOT NULL DEFAULT 'encomendado',
  note text,
  created_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orphan_colis_flags TO authenticated;
GRANT ALL ON public.orphan_colis_flags TO service_role;

ALTER TABLE public.orphan_colis_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orphan_flags_select" ON public.orphan_colis_flags
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "orphan_flags_insert" ON public.orphan_colis_flags
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "orphan_flags_update" ON public.orphan_colis_flags
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "orphan_flags_delete" ON public.orphan_colis_flags
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_orphan_colis_flags_product ON public.orphan_colis_flags(product_id);

CREATE TRIGGER update_orphan_colis_flags_updated_at
  BEFORE UPDATE ON public.orphan_colis_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Código de acesso das conferências
ALTER TABLE public.location_audits
  ADD COLUMN IF NOT EXISTS access_code text;

CREATE OR REPLACE FUNCTION public.generate_audit_access_code()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path TO 'public'
AS $function$
  SELECT lpad((floor(random() * 1000000))::int::text, 6, '0');
$function$;

CREATE OR REPLACE FUNCTION public.set_audit_access_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.access_code IS NULL OR NEW.access_code = '' THEN
    NEW.access_code := public.generate_audit_access_code();
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_location_audits_access_code ON public.location_audits;
CREATE TRIGGER trg_location_audits_access_code
  BEFORE INSERT ON public.location_audits
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_access_code();

UPDATE public.location_audits
SET access_code = public.generate_audit_access_code()
WHERE access_code IS NULL;