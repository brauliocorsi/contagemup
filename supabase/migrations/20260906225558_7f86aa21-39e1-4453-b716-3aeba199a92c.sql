CREATE OR REPLACE FUNCTION public.attempt_amount_due(p_attempt_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  a record; r record;
  v_rev integer; v_latest integer;
  v_expected bigint := 0; v_already bigint := 0; v_unknown integer := 0;
  v_paid_before bigint := 0; v_override bigint; v_sale text;
  v_state text; v_reliable boolean := true; v_note text := NULL;
  v_first_payment timestamptz; v_fetched timestamptz; v_due bigint := 0;
BEGIN
  SELECT * INTO a FROM public.delivery_attempts WHERE id = p_attempt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tentativa não encontrada'; END IF;

  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão necessária para consultar valores'; END IF;
  IF NOT (public.is_delivery_manager(v_uid) OR public.is_finance(v_uid)
          OR public.driver_sees_attempt(v_uid, a.route_id, a.driver_id)) THEN
    RAISE EXCEPTION 'Sem autorização para consultar o valor desta entrega';
  END IF;

  SELECT * INTO r FROM public.route_schedules WHERE id = a.route_id;

  SELECT max(p.revision) INTO v_latest
    FROM public.delivery_note_payables p
   WHERE p.note_id = a.note_id AND p.active;

  SELECT max(p.revision) INTO v_rev
    FROM public.delivery_note_payables p
    JOIN public.route_previsto_imports i ON i.id = p.import_id
   WHERE p.note_id = a.note_id AND p.active AND p.approved_at IS NOT NULL
     AND i.invalidated_at IS NULL
     AND i.status IN ('completed','partial')
     AND (r.id IS NULL OR (i.route_id = r.id AND i.composition_version = r.composition_version));

  IF v_rev IS NOT NULL THEN
    SELECT
      COALESCE(sum(amount_cents) FILTER (WHERE classification='collect_on_delivery'),0),
      COALESCE(sum(amount_cents) FILTER (WHERE classification='already_paid'),0),
      count(*) FILTER (WHERE classification='unknown'),
      max(gc_sale_id), max(fetched_at)
    INTO v_expected, v_already, v_unknown, v_sale, v_fetched
    FROM public.delivery_note_payables
    WHERE note_id = a.note_id AND active AND revision = v_rev;
  ELSE
    SELECT max(gc_sale_id) INTO v_sale FROM public.delivery_note_payables
     WHERE note_id = a.note_id AND active AND revision = v_latest;
  END IF;

  SELECT COALESCE(sum(p.amount_cents),0), min(p.declared_at)
    INTO v_paid_before, v_first_payment
    FROM public.delivery_payments p
   WHERE p.superseded_at IS NULL
     AND p.attempt_id <> p_attempt_id
     AND (p.note_id = a.note_id
          OR (v_sale IS NOT NULL AND p.note_id IN (
                SELECT DISTINCT note_id FROM public.delivery_note_payables
                 WHERE gc_sale_id = v_sale AND active)));

  SELECT amount_cents INTO v_override
    FROM public.delivery_payable_adjustments
   WHERE attempt_id = p_attempt_id AND active
   ORDER BY created_at DESC LIMIT 1;

  IF v_latest IS NULL THEN
    v_state := 'por_importar'; v_reliable := false;
    v_note := 'O previsto desta encomenda ainda não foi importado.';
  ELSIF v_rev IS NULL THEN
    v_state := 'desatualizado'; v_reliable := false;
    v_note := 'A importação do previsto está desactualizada ou por aprovar.';
  ELSIF v_latest > v_rev THEN
    v_state := 'revisao_pendente'; v_reliable := false;
    v_note := 'Existe uma revisão do previsto à espera de aprovação.';
  ELSIF v_unknown > 0 THEN
    v_state := 'por_rever'; v_reliable := false;
    v_note := 'Há parcelas por rever no escritório.';
  -- previsto importado depois (ou ao mesmo tempo) de já existirem recebimentos:
  -- o GestãoClick pode já reflectir esses recebimentos, logo não se pode voltar a abater
  ELSIF v_paid_before > 0 AND v_fetched IS NOT NULL AND v_first_payment IS NOT NULL
        AND v_fetched >= v_first_payment THEN
    v_state := 'contraditorio'; v_reliable := false;
    v_note := 'O previsto foi importado depois de já haver recebimentos: confirmar no escritório antes de cobrar.';
  ELSIF v_expected = 0 AND v_already > 0 THEN
    v_state := 'ja_pago_no_gc';
  ELSIF v_expected > 0 AND v_paid_before >= v_expected THEN
    v_state := 'recebido_antes';
  ELSE
    v_state := 'a_cobrar';
  END IF;

  IF v_override IS NOT NULL THEN
    v_due := v_override; v_reliable := true; v_state := 'ajustado';
  ELSIF v_reliable THEN
    v_due := GREATEST(v_expected - v_paid_before, 0);
  ELSE
    v_due := 0;
  END IF;

  RETURN jsonb_build_object(
    'has_previsto', v_rev IS NOT NULL,
    'revision', v_rev,
    'latest_revision', v_latest,
    'state', v_state,
    'reliable', v_reliable,
    'requires_review', NOT v_reliable,
    'state_note', v_note,
    'expected_cents', COALESCE(v_expected,0),
    'already_paid_cents', COALESCE(v_already,0),
    'paid_previous_attempts_cents', COALESCE(v_paid_before,0),
    'override_cents', v_override,
    'unknown_parcels', COALESCE(v_unknown,0),
    'gc_sale_id', v_sale,
    'due_cents', v_due
  );
END; $function$;