CREATE OR REPLACE FUNCTION public.receive_factory_batch(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public'
AS $function$
DECLARE
 v_batch text; v_result jsonb; v_claim text; it jsonb; v_product uuid;
 v_matches uuid[]; v_code text; v_barcode text; v_qty integer;
 v_colis integer; v_coli integer; v_count uuid; v_movement uuid;
 v_index integer := 0; v_location text; v_field text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'Operação exclusiva da receção da fábrica.' USING ERRCODE='42501';
 END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
 OR jsonb_typeof(p_payload->'batch_id') IS DISTINCT FROM 'string'
 OR length(btrim(p_payload->>'batch_id')) NOT BETWEEN 1 AND 255 THEN
  RAISE EXCEPTION 'batch_id obrigatório.' USING ERRCODE='22023';
 END IF;
 v_batch := btrim(p_payload->>'batch_id');
 INSERT INTO public.factory_intake_batches(batch_id,payload) VALUES(v_batch,p_payload)
 ON CONFLICT(batch_id) DO NOTHING RETURNING batch_id INTO v_claim;
 IF v_claim IS NULL THEN
  SELECT result INTO v_result FROM public.factory_intake_batches WHERE batch_id=v_batch;
  RETURN v_result || jsonb_build_object('already_processed',true);
 END IF;
 IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'items deve ser uma lista.' USING ERRCODE='22023';
 END IF;
 IF jsonb_array_length(p_payload->'items')=0 THEN
  RAISE EXCEPTION 'O lote não pode estar vazio.' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(71488021);
 SELECT code INTO v_location FROM public.warehouse_locations WHERE code='CONF' AND location_type='conferencia';
 IF v_location IS NULL THEN
  RAISE EXCEPTION 'Zona CONF não configurada para conferência.' USING ERRCODE='22023';
 END IF;
 FOR it IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
  v_index:=v_index+1;
  IF jsonb_typeof(it) IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'Artigo % inválido.',v_index USING ERRCODE='22023';
  END IF;
  FOREACH v_field IN ARRAY ARRAY['order_number','product_code','barcode','product_description','measure','fabric_type','fabric_ref','color','dispatched_at'] LOOP
   IF jsonb_typeof(it->v_field) IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'Artigo %: campo % obrigatório.',v_index,v_field USING ERRCODE='22023';
   END IF;
  END LOOP;
  IF btrim(it->>'order_number')='' OR btrim(it->>'product_code')='' OR btrim(it->>'product_description')='' THEN
   RAISE EXCEPTION 'Artigo %: encomenda, código e descrição obrigatórios.',v_index USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(it->'quantity') IS DISTINCT FROM 'number' OR (it->>'quantity') !~ '^[0-9]+$' THEN
   RAISE EXCEPTION 'Artigo %: quantidade deve ser um inteiro positivo.',v_index USING ERRCODE='22023';
  END IF;
  BEGIN
   v_qty:=(it->>'quantity')::integer;
   PERFORM (it->>'dispatched_at')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
   RAISE EXCEPTION 'Artigo %: quantidade ou data inválida.',v_index USING ERRCODE='22023';
  END;
  IF v_qty<=0 THEN RAISE EXCEPTION 'Quantidade deve ser positiva.' USING ERRCODE='22023'; END IF;
  IF it ? 'total_colis' AND it->'total_colis' <> 'null'::jsonb AND (jsonb_typeof(it->'total_colis') IS DISTINCT FROM 'number' OR (it->>'total_colis') !~ '^[1-9][0-9]{0,3}$') THEN
   RAISE EXCEPTION 'Artigo %: total_colis deve ser um inteiro >= 1.',v_index USING ERRCODE='22023';
  END IF;
  v_code:=btrim(it->>'product_code'); v_barcode:=btrim(it->>'barcode');
  SELECT id INTO v_product FROM public.products WHERE code=v_code FOR UPDATE;
  IF v_product IS NULL THEN
   -- Produto desconhecido: criar a ficha automaticamente com o nome e volumes enviados pela fábrica.
   INSERT INTO public.products(code,name,total_colis,description)
   VALUES(v_code,btrim(it->>'product_description'),
    GREATEST(COALESCE((it->>'total_colis')::integer,1),1),
    'Criado automaticamente via receção UP Fábrica')
   RETURNING id INTO v_product;
  END IF;
  IF v_barcode<>'' THEN
   SELECT array_agg(DISTINCT id) INTO v_matches FROM (
    SELECT id FROM public.products WHERE barcode=v_barcode OR code=v_barcode
    UNION SELECT product_id FROM public.product_barcodes WHERE barcode=v_barcode
   ) matches;
   IF EXISTS(SELECT 1 FROM unnest(v_matches) id WHERE id<>v_product) THEN
    RAISE EXCEPTION 'Artigo %: código de barras associado a outro produto.',v_index USING ERRCODE='22023';
   END IF;
  END IF;
  v_colis:=public.effective_total_colis(v_product);
  INSERT INTO public.stock_movements(product_id,movement_type,quantity,reason,reference,notes,supplier_name)
  VALUES(v_product,'entrada',v_qty*v_colis,'fabrica',btrim(it->>'order_number'),
   'UP Fábrica · lote '||v_batch||' · '||v_qty||' produto(s) completo(s) · destino CONF · envio '||(it->>'dispatched_at'),'UP Fábrica')
  RETURNING id INTO v_movement;
  FOR v_coli IN 1..v_colis LOOP
   v_count:=NULL;
   SELECT id INTO v_count FROM public.counts
   WHERE product_id=v_product AND colis_number=v_coli AND location=v_location
   ORDER BY (session_id IS NULL) DESC,quantity DESC,id LIMIT 1 FOR UPDATE;
   IF v_count IS NULL THEN
    INSERT INTO public.counts(product_id,colis_number,quantity,session_id,location,counted_by)
    VALUES(v_product,v_coli,v_qty,NULL,v_location,NULL);
   ELSE
    UPDATE public.counts SET quantity=quantity+v_qty,updated_at=now() WHERE id=v_count;
   END IF;
   INSERT INTO public.stock_movement_lines(movement_id,product_id,colis_number,quantity,location)
   VALUES(v_movement,v_product,v_coli,v_qty,v_location);
  END LOOP;
  INSERT INTO public.factory_intake_items(batch_id,item_index,product_id,movement_id,order_number,product_code,barcode,product_description,measure,fabric_type,fabric_ref,color,quantity,dispatched_at,location)
  VALUES(v_batch,v_index,v_product,v_movement,btrim(it->>'order_number'),v_code,v_barcode,it->>'product_description',it->>'measure',it->>'fabric_type',it->>'fabric_ref',it->>'color',v_qty,(it->>'dispatched_at')::timestamptz,v_location);
 END LOOP;
 v_result:=jsonb_build_object('success',true,'batch_id',v_batch,'processed_items',v_index);
 UPDATE public.factory_intake_batches SET result=v_result,processed_at=now() WHERE batch_id=v_batch;
 RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.receive_factory_batch(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.receive_factory_batch(jsonb) TO service_role;