-- ============ 1. ESQUEMA ============
ALTER TABLE public.delivery_operations
  ADD COLUMN IF NOT EXISTS payload_hash text,
  ADD COLUMN IF NOT EXISTS resource text;

ALTER TABLE public.delivery_payments
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by uuid;

CREATE INDEX IF NOT EXISTS idx_payments_active
  ON public.delivery_payments (attempt_id) WHERE superseded_at IS NULL;

ALTER TABLE public.delivery_note_payables
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

UPDATE public.delivery_note_payables SET approved_at = created_at
 WHERE approved_at IS NULL;

ALTER TABLE public.route_cash_closures
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_by uuid,
  ADD COLUMN IF NOT EXISTS reopen_reason text,
  ADD COLUMN IF NOT EXISTS settlement_note text;

ALTER TABLE public.delivery_payments
  DROP CONSTRAINT IF EXISTS delivery_payments_amount_positive;
ALTER TABLE public.delivery_payments
  ADD CONSTRAINT delivery_payments_amount_positive
  CHECK (amount_cents > 0 AND change_cents >= 0
         AND (gross_cents IS NULL OR gross_cents >= amount_cents));

-- ============ 2. VALOR A COBRAR COM ESTADOS EXPLÍCITOS ============
CREATE OR REPLACE FUNCTION public.attempt_amount_due(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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

  -- revisão utilizável: aprovada, de uma importação válida e da composição actual
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

  -- recebimentos já feitos na mesma venda (outras notas / outras tentativas)
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

  -- classificação do estado
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
  ELSIF v_paid_before > 0 AND v_fetched IS NOT NULL AND v_first_payment IS NOT NULL
        AND v_fetched > v_first_payment THEN
    v_state := 'contraditorio'; v_reliable := false;
    v_note := 'O previsto foi importado depois de já haver recebimentos: confirmar antes de cobrar.';
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

REVOKE ALL ON FUNCTION public.attempt_amount_due(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.attempt_amount_due(uuid) TO authenticated, service_role;

-- ============ 3. APROVAÇÃO DE REVISÕES DO PREVISTO ============
CREATE OR REPLACE FUNCTION public.approve_note_payable_revision(
  p_note_id uuid, p_revision integer, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_n integer;
BEGIN
  IF NOT (public.is_delivery_manager(v_uid) OR public.is_finance(v_uid)) THEN
    RAISE EXCEPTION 'Sem permissão para aprovar revisões do previsto';
  END IF;
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Indique o motivo da aprovação';
  END IF;
  UPDATE public.delivery_note_payables
     SET approved_at = now(), approved_by = v_uid,
         exception_note = COALESCE(exception_note, '') 
   WHERE note_id = p_note_id AND revision = p_revision AND active AND approved_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'Não há revisão por aprovar com esse número'; END IF;
  INSERT INTO public.delivery_events (note_id, event_type, payload, actor)
  VALUES (p_note_id, 'previsto_revisao_aprovada',
          jsonb_build_object('revision', p_revision, 'reason', p_reason, 'rows', v_n), v_uid);
  RETURN jsonb_build_object('ok', true, 'rows', v_n);
END; $function$;

REVOKE ALL ON FUNCTION public.approve_note_payable_revision(uuid,integer,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.approve_note_payable_revision(uuid,integer,text) TO authenticated, service_role;

-- ============ 4. DECLARAÇÃO DE RECEBIMENTOS ============
CREATE OR REPLACE FUNCTION public.declare_delivery_payments(
  p_attempt_id uuid, p_lines jsonb, p_difference_reason text, p_op_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); a record; l jsonb; v_total bigint := 0;
  v_due jsonb; v_method record; v_op record; v_res jsonb;
  v_hash text; v_rev integer; v_amount bigint; v_gross bigint; v_change bigint;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão necessária'; END IF;
  IF coalesce(trim(p_op_key),'') = '' THEN RAISE EXCEPTION 'Chave de operação em falta'; END IF;

  v_hash := md5('declare_payments|' || p_attempt_id::text || '|' || v_uid::text || '|'
                || coalesce(p_lines,'[]'::jsonb)::text || '|' || coalesce(trim(p_difference_reason),''));

  SELECT * INTO v_op FROM public.delivery_operations WHERE op_key = p_op_key;
  IF FOUND THEN
    IF v_op.kind <> 'declare_payments'
       OR v_op.attempt_id IS DISTINCT FROM p_attempt_id
       OR v_op.actor IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'Esta chave de operação já foi usada noutro contexto';
    END IF;
    IF v_op.payload_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'Alteração diferente com a mesma chave de operação: recarregue o ecrã e volte a guardar';
    END IF;
    RETURN v_op.result;
  END IF;

  SELECT * INTO a FROM public.delivery_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tentativa não encontrada'; END IF;

  IF a.route_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('route_finance:' || a.route_id::text, 0));
  END IF;

  IF NOT public.is_delivery_manager(v_uid)
     AND NOT public.driver_sees_attempt(v_uid, a.route_id, a.driver_id) THEN
    RAISE EXCEPTION 'Sem autorização para declarar recebimentos desta entrega';
  END IF;

  IF EXISTS (SELECT 1 FROM public.route_cash_closures c
              WHERE c.route_id = a.route_id AND c.driver_id = v_uid
                AND c.reopened_at IS NULL) THEN
    RAISE EXCEPTION 'A prestação de contas desta rota já foi fechada; peça reabertura ao responsável';
  END IF;

  IF EXISTS (SELECT 1 FROM public.delivery_payments
              WHERE attempt_id = p_attempt_id AND locked AND superseded_at IS NULL) THEN
    RAISE EXCEPTION 'Os recebimentos desta entrega já estão bloqueados';
  END IF;

  v_due := public.attempt_amount_due(p_attempt_id);

  -- previsto não fiável: só o responsável pode registar, e só com motivo escrito
  IF (v_due->>'reliable')::boolean = false
     AND jsonb_array_length(coalesce(p_lines,'[]'::jsonb)) > 0 THEN
    IF coalesce(trim(p_difference_reason),'') = '' THEN
      RAISE EXCEPTION 'O valor previsto está por confirmar (%): explique porque está a registar este recebimento',
        v_due->>'state';
    END IF;
  END IF;

  SELECT COALESCE(max(revision),0) + 1 INTO v_rev
    FROM public.delivery_payments WHERE attempt_id = p_attempt_id;

  UPDATE public.delivery_payments
     SET superseded_at = now(), superseded_by = v_uid
   WHERE attempt_id = p_attempt_id AND NOT locked AND superseded_at IS NULL;

  FOR l IN SELECT * FROM jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) LOOP
    SELECT * INTO v_method FROM public.payment_methods WHERE id = l->>'method_id' AND active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Forma de pagamento não configurada: %', l->>'method_id'; END IF;

    v_amount := COALESCE(NULLIF(l->>'amount_cents','')::bigint, 0);
    IF v_amount <= 0 THEN CONTINUE; END IF;
    IF v_amount > 100000000 THEN RAISE EXCEPTION 'Valor acima do limite permitido'; END IF;

    v_gross := NULLIF(l->>'gross_cents','')::bigint;
    v_change := COALESCE(NULLIF(l->>'change_cents','')::bigint, 0);

    IF v_gross IS NOT NULL THEN
      IF v_method.kind <> 'cash' THEN
        RAISE EXCEPTION 'Só o numerário tem valor bruto e troco';
      END IF;
      IF v_gross < v_amount THEN
        RAISE EXCEPTION 'O valor recebido (bruto) não pode ser inferior ao valor da entrega';
      END IF;
      IF v_change <> v_gross - v_amount THEN
        RAISE EXCEPTION 'O troco indicado não corresponde ao bruto menos o líquido';
      END IF;
    ELSIF v_change <> 0 THEN
      RAISE EXCEPTION 'Indicou troco sem indicar o valor bruto recebido';
    END IF;

    IF v_method.requires_reference AND coalesce(trim(l->>'reference'),'') = '' THEN
      RAISE EXCEPTION 'Indique a referência para %', v_method.label;
    END IF;

    INSERT INTO public.delivery_payments
      (attempt_id, note_id, route_id, method_id, amount_cents, gross_cents, change_cents,
       reference, notes, difference_reason, declared_by, op_key, revision)
    VALUES (p_attempt_id, a.note_id, a.route_id, v_method.id, v_amount, v_gross, v_change,
            NULLIF(l->>'reference',''), NULLIF(l->>'notes',''),
            NULLIF(p_difference_reason,''), v_uid, p_op_key, v_rev);
    v_total := v_total + v_amount;
  END LOOP;

  IF v_total <> (v_due->>'due_cents')::bigint
     AND coalesce(trim(p_difference_reason),'') = '' THEN
    RAISE EXCEPTION 'Indique o motivo da diferença face ao previsto';
  END IF;

  v_res := jsonb_build_object(
    'total_cents', v_total,
    'due_cents', (v_due->>'due_cents')::bigint,
    'difference_cents', v_total - (v_due->>'due_cents')::bigint,
    'payment_revision', v_rev,
    'previsto_state', v_due->>'state');

  INSERT INTO public.delivery_events (note_id, attempt_id, event_type, payload, actor)
  VALUES (a.note_id, p_attempt_id, 'recebimento_declarado',
          jsonb_build_object('result', v_res, 'due', v_due,
                             'difference_reason', p_difference_reason), v_uid);

  INSERT INTO public.delivery_operations (op_key, kind, attempt_id, actor, result, payload_hash, resource)
  VALUES (p_op_key, 'declare_payments', p_attempt_id, v_uid, v_res, v_hash,
          'attempt:' || p_attempt_id::text);
  RETURN v_res;
END; $function$;

-- ============ 5. PRESTAÇÃO DE CONTAS ============
CREATE OR REPLACE FUNCTION public.submit_route_accounting(
  p_route_id uuid, p_cash_cents bigint, p_no_cash boolean, p_notes text, p_op_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_closure uuid; v_env text; v_totals jsonb;
  v_declared bigint; v_expected bigint; v_cash bigint; v_exc jsonb; v_prev record; v_m record;
  v_route record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão necessária'; END IF;
  IF coalesce(trim(p_op_key),'') = '' THEN RAISE EXCEPTION 'Chave de operação em falta'; END IF;
  IF p_cash_cents IS NULL OR p_cash_cents < 0 THEN RAISE EXCEPTION 'Valor do envelope inválido'; END IF;

  SELECT * INTO v_prev FROM public.route_cash_closures WHERE op_key = p_op_key;
  IF FOUND THEN
    IF v_prev.submitted_by IS DISTINCT FROM v_uid OR v_prev.route_id IS DISTINCT FROM p_route_id THEN
      RAISE EXCEPTION 'Esta chave de operação já foi usada noutro contexto';
    END IF;
    RETURN jsonb_build_object('closure_id', v_prev.id, 'envelope_code', v_prev.envelope_code,
                              'idempotent', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('route_finance:' || p_route_id::text, 0));

  SELECT * INTO v_route FROM public.route_schedules WHERE id = p_route_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rota não encontrada'; END IF;

  IF EXISTS (SELECT 1 FROM public.route_cash_closures
              WHERE route_id = p_route_id AND driver_id = v_uid AND reopened_at IS NULL) THEN
    RAISE EXCEPTION 'Já fechou a prestação de contas desta rota';
  END IF;

  IF NOT public.is_delivery_manager(v_uid) AND v_route.driver_id IS DISTINCT FROM v_uid
     AND NOT EXISTS (SELECT 1 FROM public.delivery_attempts a
                     WHERE a.route_id = p_route_id AND a.driver_id = v_uid) THEN
    RAISE EXCEPTION 'Sem autorização para fechar contas desta rota';
  END IF;

  SELECT COALESCE(jsonb_object_agg(t.method_id, t.total), '{}'::jsonb), COALESCE(sum(t.total), 0)
    INTO v_totals, v_declared
    FROM (SELECT method_id, sum(amount_cents) AS total
            FROM public.delivery_payments
           WHERE route_id = p_route_id AND declared_by = v_uid AND superseded_at IS NULL
           GROUP BY method_id) t;

  -- custódia: tentativas atribuídas a este utilizador ou herdadas do condutor da rota
  SELECT COALESCE(sum((public.attempt_amount_due(a.id)->>'due_cents')::bigint), 0)
    INTO v_expected
    FROM public.delivery_attempts a
   WHERE a.route_id = p_route_id
     AND (a.driver_id = v_uid OR (a.driver_id IS NULL AND v_route.driver_id = v_uid));

  SELECT COALESCE(sum(p.amount_cents), 0) INTO v_cash
    FROM public.delivery_payments p
    JOIN public.payment_methods pm ON pm.id = p.method_id
   WHERE p.route_id = p_route_id AND p.declared_by = v_uid AND p.superseded_at IS NULL
     AND pm.kind = 'cash';

  IF NOT p_no_cash AND p_cash_cents <> v_cash THEN
    RAISE EXCEPTION 'O numerário do envelope (% cent) não corresponde ao declarado nas entregas (% cent)',
      p_cash_cents, v_cash;
  END IF;
  IF p_no_cash AND v_cash > 0 THEN
    RAISE EXCEPTION 'Declarou numerário em entregas desta rota; não pode marcar "sem numerário"';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'attempt_id', a.id, 'order_number', a.order_number, 'status', a.status)), '[]'::jsonb)
    INTO v_exc
    FROM public.delivery_attempts a
   WHERE a.route_id = p_route_id AND a.status IN ('assigned','in_transit');

  v_env := 'ENV-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));

  INSERT INTO public.route_cash_closures
    (route_id, driver_id, envelope_code, cash_declared_cents, no_cash, totals,
     expected_cents, declared_cents, exceptions, notes, submitted_by, op_key)
  VALUES (p_route_id, v_uid, v_env, CASE WHEN p_no_cash THEN 0 ELSE p_cash_cents END,
          p_no_cash, v_totals, v_expected, v_declared, v_exc, NULLIF(p_notes,''), v_uid, p_op_key)
  RETURNING id INTO v_closure;

  UPDATE public.delivery_payments
     SET locked = true, closure_id = v_closure
   WHERE route_id = p_route_id AND declared_by = v_uid AND superseded_at IS NULL;

  -- o numerário é conferido pelo envelope: não gera conferência electrónica
  FOR v_m IN SELECT pm.id, sum(p.amount_cents) AS total
             FROM public.delivery_payments p
             JOIN public.payment_methods pm ON pm.id = p.method_id
            WHERE p.closure_id = v_closure AND p.superseded_at IS NULL AND pm.kind <> 'cash'
            GROUP BY pm.id LOOP
    INSERT INTO public.route_closure_method_checks (closure_id, method_id, declared_cents)
    VALUES (v_closure, v_m.id, v_m.total);
  END LOOP;

  UPDATE public.route_schedules SET financial_status = 'submitted' WHERE id = p_route_id;

  INSERT INTO public.delivery_events (event_type, payload, actor)
  VALUES ('prestacao_contas_submetida',
          jsonb_build_object('route_id', p_route_id, 'closure_id', v_closure,
                             'envelope_code', v_env, 'cash_cents', v_cash,
                             'declared_cents', v_declared, 'expected_cents', v_expected), v_uid);

  RETURN jsonb_build_object('closure_id', v_closure, 'envelope_code', v_env,
                            'cash_cents', CASE WHEN p_no_cash THEN 0 ELSE p_cash_cents END,
                            'declared_cents', v_declared, 'expected_cents', v_expected);
END; $function$;

-- ============ 6. CONFERÊNCIA FINANCEIRA ============
CREATE OR REPLACE FUNCTION public.finance_count_envelope(
  p_closure_id uuid, p_counted_cents bigint, p_note text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); c record;
BEGIN
  IF NOT public.is_finance(v_uid) THEN RAISE EXCEPTION 'Sem permissão financeira'; END IF;
  IF p_counted_cents IS NULL OR p_counted_cents < 0 THEN RAISE EXCEPTION 'Valor contado inválido'; END IF;
  SELECT * INTO c FROM public.route_cash_closures WHERE id = p_closure_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fecho não encontrado'; END IF;
  IF c.driver_id = v_uid OR c.submitted_by = v_uid THEN
    RAISE EXCEPTION 'O responsável pela custódia não pode conferir o próprio envelope';
  END IF;
  IF c.status = 'resolved' THEN
    RAISE EXCEPTION 'Este fecho já está concluído; é preciso reabri-lo com motivo antes de alterar';
  END IF;
  UPDATE public.route_cash_closures
     SET counted_cents = p_counted_cents, counted_by = v_uid, counted_at = now(),
         difference_cents = p_counted_cents - c.cash_declared_cents,
         status = 'counting', resolution_note = COALESCE(NULLIF(p_note,''), resolution_note)
   WHERE id = p_closure_id;
  UPDATE public.route_schedules SET financial_status = 'counted' WHERE id = c.route_id;
  INSERT INTO public.delivery_events (event_type, payload, actor)
  VALUES ('envelope_conferido',
          jsonb_build_object('closure_id', p_closure_id, 'declared', c.cash_declared_cents,
                             'counted', p_counted_cents, 'note', p_note), v_uid);
  RETURN jsonb_build_object('difference_cents', p_counted_cents - c.cash_declared_cents);
END; $function$;

CREATE OR REPLACE FUNCTION public.finance_confirm_method(
  p_check_id uuid, p_confirmed_cents bigint, p_reference text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); k record; c record;
BEGIN
  IF NOT public.is_finance(v_uid) THEN RAISE EXCEPTION 'Sem permissão financeira'; END IF;
  IF p_confirmed_cents IS NULL OR p_confirmed_cents < 0 THEN RAISE EXCEPTION 'Valor confirmado inválido'; END IF;
  SELECT * INTO k FROM public.route_closure_method_checks WHERE id = p_check_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conferência não encontrada'; END IF;
  SELECT * INTO c FROM public.route_cash_closures WHERE id = k.closure_id FOR UPDATE;
  IF c.driver_id = v_uid OR c.submitted_by = v_uid THEN
    RAISE EXCEPTION 'Não pode conferir a sua própria prestação de contas';
  END IF;
  IF c.status = 'resolved' THEN
    RAISE EXCEPTION 'Este fecho já está concluído; é preciso reabri-lo com motivo antes de alterar';
  END IF;
  IF p_confirmed_cents <> k.declared_cents AND coalesce(trim(p_note),'') = '' THEN
    RAISE EXCEPTION 'Há divergência neste meio de pagamento: explique o tratamento dado';
  END IF;
  UPDATE public.route_closure_method_checks
     SET confirmed_cents = p_confirmed_cents, reference = NULLIF(p_reference,''),
         note = NULLIF(p_note,''), confirmed_by = v_uid, confirmed_at = now(),
         status = CASE WHEN p_confirmed_cents = k.declared_cents THEN 'confirmed' ELSE 'divergent' END
   WHERE id = p_check_id;
  INSERT INTO public.delivery_events (event_type, payload, actor)
  VALUES ('meio_conferido',
          jsonb_build_object('check_id', p_check_id, 'closure_id', k.closure_id,
                             'declared', k.declared_cents, 'confirmed', p_confirmed_cents), v_uid);
  RETURN jsonb_build_object('ok', true, 'difference_cents', p_confirmed_cents - k.declared_cents);
END; $function$;

CREATE OR REPLACE FUNCTION public.finance_resolve_closure(p_closure_id uuid, p_note text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); c record;
  v_pending integer; v_divergent_no_note integer; v_diff bigint; v_gap bigint;
BEGIN
  IF NOT public.is_finance(v_uid) THEN RAISE EXCEPTION 'Sem permissão financeira'; END IF;
  SELECT * INTO c FROM public.route_cash_closures WHERE id = p_closure_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fecho não encontrado'; END IF;
  IF c.status = 'resolved' THEN
    RETURN jsonb_build_object('resolved', true, 'already_resolved', true);
  END IF;
  IF c.driver_id = v_uid OR c.submitted_by = v_uid THEN
    RAISE EXCEPTION 'Não pode concluir a sua própria prestação de contas';
  END IF;
  IF c.counted_at IS NULL AND NOT c.no_cash AND c.cash_declared_cents > 0 THEN
    RAISE EXCEPTION 'Falta conferir o envelope de numerário';
  END IF;

  SELECT count(*) INTO v_pending FROM public.route_closure_method_checks
   WHERE closure_id = p_closure_id AND status = 'pending';
  IF v_pending > 0 THEN
    RAISE EXCEPTION 'Faltam % conferência(s) de meios electrónicos', v_pending;
  END IF;

  SELECT count(*) INTO v_divergent_no_note FROM public.route_closure_method_checks
   WHERE closure_id = p_closure_id AND status = 'divergent'
     AND coalesce(trim(note),'') = '';
  IF v_divergent_no_note > 0 THEN
    RAISE EXCEPTION 'Há % meio(s) electrónico(s) com divergência por tratar', v_divergent_no_note;
  END IF;

  SELECT COALESCE(sum(confirmed_cents - declared_cents), 0) INTO v_diff
    FROM public.route_closure_method_checks WHERE closure_id = p_closure_id;

  v_gap := coalesce(c.declared_cents,0) - coalesce(c.expected_cents,0);

  IF (coalesce(c.difference_cents,0) <> 0 OR v_diff <> 0 OR v_gap <> 0)
     AND coalesce(trim(p_note),'') = '' THEN
    RAISE EXCEPTION 'Há valores por explicar (envelope %, meios %, previsto %): indique a resolução',
      coalesce(c.difference_cents,0), v_diff, v_gap;
  END IF;

  UPDATE public.route_cash_closures
     SET status = 'resolved', resolved_by = v_uid, resolved_at = now(),
         settlement_note = NULLIF(p_note,''),
         resolution_note = COALESCE(NULLIF(p_note,''), resolution_note)
   WHERE id = p_closure_id;

  UPDATE public.route_schedules SET financial_status = 'settled'
   WHERE id = c.route_id
     AND NOT EXISTS (SELECT 1 FROM public.route_cash_closures x
                     WHERE x.route_id = c.route_id AND x.status <> 'resolved');

  INSERT INTO public.delivery_events (event_type, payload, actor)
  VALUES ('prestacao_contas_resolvida',
          jsonb_build_object('closure_id', p_closure_id, 'note', p_note,
                             'envelope_difference', coalesce(c.difference_cents,0),
                             'methods_difference', v_diff, 'previsto_gap', v_gap), v_uid);
  RETURN jsonb_build_object('resolved', true);
END; $function$;

CREATE OR REPLACE FUNCTION public.finance_reopen_closure(p_closure_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); c record;
BEGIN
  IF NOT public.is_finance(v_uid) THEN RAISE EXCEPTION 'Sem permissão financeira'; END IF;
  IF coalesce(trim(p_reason),'') = '' THEN RAISE EXCEPTION 'Indique o motivo da reabertura'; END IF;
  SELECT * INTO c FROM public.route_cash_closures WHERE id = p_closure_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fecho não encontrado'; END IF;
  IF c.driver_id = v_uid OR c.submitted_by = v_uid THEN
    RAISE EXCEPTION 'Não pode reabrir a sua própria prestação de contas';
  END IF;
  UPDATE public.route_cash_closures
     SET status = 'counting', reopened_at = now(), reopened_by = v_uid, reopen_reason = p_reason
   WHERE id = p_closure_id;
  UPDATE public.route_schedules SET financial_status = 'counted' WHERE id = c.route_id;
  INSERT INTO public.delivery_events (event_type, payload, actor)
  VALUES ('prestacao_contas_reaberta',
          jsonb_build_object('closure_id', p_closure_id, 'reason', p_reason), v_uid);
  RETURN jsonb_build_object('reopened', true);
END; $function$;

REVOKE ALL ON FUNCTION public.finance_reopen_closure(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_reopen_closure(uuid,text) TO authenticated, service_role;

-- ============ 7. BLOQUEIO DA COMPOSIÇÃO DA ROTA ============
CREATE OR REPLACE FUNCTION public.bump_route_composition()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r uuid; arr uuid[];
BEGIN
  arr := ARRAY[
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.route_id END,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.route_id END
  ];
  FOREACH r IN ARRAY arr LOOP
    IF r IS NULL THEN CONTINUE; END IF;
    UPDATE public.route_schedules
       SET composition_version = composition_version + 1, updated_at = now()
     WHERE id = r;
    UPDATE public.route_previsto_imports
       SET invalidated_at = COALESCE(invalidated_at, now()),
           invalidated_reason = COALESCE(invalidated_reason,
             'Composição da rota alterada após a importação')
     WHERE route_id = r AND invalidated_at IS NULL;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END; $function$;

CREATE OR REPLACE FUNCTION public.enforce_route_preparation_lock()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r uuid; arr uuid[]; v_closed timestamptz;
BEGIN
  IF current_setting('app.allow_closed_route_change', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  arr := ARRAY[
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.route_id END,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.route_id END
  ];
  FOREACH r IN ARRAY arr LOOP
    IF r IS NULL THEN CONTINUE; END IF;
    SELECT preparation_closed_at INTO v_closed FROM public.route_schedules WHERE id = r;
    IF v_closed IS NOT NULL THEN
      RAISE EXCEPTION 'A preparação desta rota está fechada: reabra a preparação antes de alterar a composição';
    END IF;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END; $function$;

DROP TRIGGER IF EXISTS trg_attempt_route_composition ON public.delivery_attempts;
CREATE TRIGGER trg_attempt_route_composition
  AFTER INSERT OR DELETE OR UPDATE OF route_id, note_id ON public.delivery_attempts
  FOR EACH ROW EXECUTE FUNCTION public.bump_route_composition();

DROP TRIGGER IF EXISTS trg_attempt_prep_lock ON public.delivery_attempts;
CREATE TRIGGER trg_attempt_prep_lock
  BEFORE INSERT OR DELETE OR UPDATE OF route_id, note_id ON public.delivery_attempts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_route_preparation_lock();

DROP TRIGGER IF EXISTS trg_note_route_composition ON public.delivery_notes;
CREATE TRIGGER trg_note_route_composition
  AFTER INSERT OR DELETE OR UPDATE OF route_id ON public.delivery_notes
  FOR EACH ROW EXECUTE FUNCTION public.bump_route_composition();

DROP TRIGGER IF EXISTS trg_note_prep_lock ON public.delivery_notes;
CREATE TRIGGER trg_note_prep_lock
  BEFORE INSERT OR DELETE OR UPDATE OF route_id ON public.delivery_notes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_route_preparation_lock();

DROP TRIGGER IF EXISTS trg_stop_prep_lock ON public.route_stops;
CREATE TRIGGER trg_stop_prep_lock
  BEFORE INSERT OR DELETE OR UPDATE ON public.route_stops
  FOR EACH ROW EXECUTE FUNCTION public.enforce_route_preparation_lock();

CREATE OR REPLACE FUNCTION public.reopen_route_preparation(p_route_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_delivery_manager(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para reabrir a preparação da rota';
  END IF;
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Indique o motivo da reabertura';
  END IF;
  PERFORM set_config('app.allow_closed_route_change', 'on', true);
  UPDATE public.route_schedules
     SET preparation_closed_at = NULL, preparation_closed_by = NULL,
         preparation_reopen_reason = p_reason,
         composition_version = composition_version + 1
   WHERE id = p_route_id;
  UPDATE public.route_previsto_imports
     SET invalidated_at = COALESCE(invalidated_at, now()),
         invalidated_reason = COALESCE(invalidated_reason, 'Preparação reaberta: ' || p_reason)
   WHERE route_id = p_route_id AND invalidated_at IS NULL;
  INSERT INTO public.delivery_events (event_type, payload, actor)
  VALUES ('rota_preparacao_reaberta',
          jsonb_build_object('route_id', p_route_id, 'reason', p_reason), v_uid);
  PERFORM set_config('app.allow_closed_route_change', 'off', true);
  RETURN jsonb_build_object('reopened', true);
END; $function$;