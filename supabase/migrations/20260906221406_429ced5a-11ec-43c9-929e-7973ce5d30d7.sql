-- =========================================================
-- FASE FINANCEIRA OPERACIONAL DA ROTA + ASSISTÊNCIAS
-- Aditiva: não converte histórico em pagamentos confirmados.
-- =========================================================

-- perfil financeiro
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin','operator','entregador','financeiro'));

-- ---------- 1. Configuração de formas de pagamento ----------
CREATE TABLE public.payment_methods (
  id text PRIMARY KEY,
  label text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('cash','card','transfer','other')),
  collect_on_delivery boolean NOT NULL DEFAULT false,
  requires_reference boolean NOT NULL DEFAULT false,
  gc_identifiers text[] NOT NULL DEFAULT '{}',
  gc_name_patterns text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver formas de pagamento" ON public.payment_methods
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins gerem formas de pagamento" ON public.payment_methods
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER payment_methods_updated BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 2. Papéis financeiros ----------
CREATE OR REPLACE FUNCTION public.is_finance(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.user_id = _uid AND p.role IN ('admin','financeiro'));
$$;
REVOKE ALL ON FUNCTION public.is_finance(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_finance(uuid) TO authenticated;

-- ---------- 3. Preparação e estado financeiro da rota ----------
ALTER TABLE public.route_schedules
  ADD COLUMN IF NOT EXISTS composition_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS preparation_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS preparation_closed_by uuid,
  ADD COLUMN IF NOT EXISTS preparation_reopen_reason text,
  ADD COLUMN IF NOT EXISTS financial_status text NOT NULL DEFAULT 'open';
ALTER TABLE public.route_schedules DROP CONSTRAINT IF EXISTS route_schedules_financial_status_check;
ALTER TABLE public.route_schedules ADD CONSTRAINT route_schedules_financial_status_check
  CHECK (financial_status IN ('open','submitted','counted','settled'));

-- ---------- 4. Importações de previsto ----------
CREATE TABLE public.route_previsto_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES public.route_schedules(id) ON DELETE CASCADE,
  composition_version integer NOT NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','completed','partial','failed')),
  op_key text UNIQUE,
  requested_by uuid,
  notes_total integer NOT NULL DEFAULT 0,
  notes_ok integer NOT NULL DEFAULT 0,
  notes_failed integer NOT NULL DEFAULT 0,
  failures jsonb NOT NULL DEFAULT '[]'::jsonb,
  invalidated_at timestamptz,
  invalidated_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_previsto_imports_route ON public.route_previsto_imports(route_id);
GRANT SELECT ON public.route_previsto_imports TO authenticated;
GRANT ALL ON public.route_previsto_imports TO service_role;
ALTER TABLE public.route_previsto_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Responsaveis veem importacoes" ON public.route_previsto_imports
  FOR SELECT TO authenticated
  USING (public.is_delivery_manager(auth.uid()) OR public.is_finance(auth.uid()));
CREATE TRIGGER previsto_imports_updated BEFORE UPDATE ON public.route_previsto_imports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 5. Previsto por nota / parcela ----------
CREATE TABLE public.delivery_note_payables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES public.delivery_notes(id) ON DELETE CASCADE,
  route_id uuid REFERENCES public.route_schedules(id) ON DELETE SET NULL,
  import_id uuid REFERENCES public.route_previsto_imports(id) ON DELETE SET NULL,
  revision integer NOT NULL DEFAULT 1,
  parcel_key text NOT NULL,
  gc_sale_id text,
  gc_sale_code text,
  gc_store text,
  method_raw_id text,
  method_raw_name text,
  method_id text REFERENCES public.payment_methods(id),
  classification text NOT NULL
    CHECK (classification IN ('collect_on_delivery','already_paid','unknown')),
  amount_cents bigint NOT NULL,
  due_date date,
  gc_status text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_url text,
  fetched_at timestamptz,
  exception_note text,
  active boolean NOT NULL DEFAULT true,
  imported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_payable_note_rev_parcel
  ON public.delivery_note_payables(note_id, revision, parcel_key);
CREATE INDEX idx_payables_note_active ON public.delivery_note_payables(note_id) WHERE active;
CREATE INDEX idx_payables_route ON public.delivery_note_payables(route_id);
GRANT SELECT ON public.delivery_note_payables TO authenticated;
GRANT ALL ON public.delivery_note_payables TO service_role;
ALTER TABLE public.delivery_note_payables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver previsto autorizado" ON public.delivery_note_payables
  FOR SELECT TO authenticated
  USING (
    public.is_delivery_manager(auth.uid())
    OR public.is_finance(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.delivery_attempts a
      WHERE a.note_id = delivery_note_payables.note_id
        AND public.driver_sees_attempt(auth.uid(), a.route_id, a.driver_id)
    )
  );
CREATE TRIGGER payables_updated BEFORE UPDATE ON public.delivery_note_payables
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 6. Ajustes autorizados ao valor a cobrar ----------
CREATE TABLE public.delivery_payable_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.delivery_attempts(id) ON DELETE CASCADE,
  note_id uuid NOT NULL REFERENCES public.delivery_notes(id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL,
  reason text NOT NULL,
  authorized_by uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_adjust_attempt ON public.delivery_payable_adjustments(attempt_id) WHERE active;
GRANT SELECT ON public.delivery_payable_adjustments TO authenticated;
GRANT ALL ON public.delivery_payable_adjustments TO service_role;
ALTER TABLE public.delivery_payable_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver ajustes autorizados" ON public.delivery_payable_adjustments
  FOR SELECT TO authenticated
  USING (
    public.is_delivery_manager(auth.uid()) OR public.is_finance(auth.uid())
    OR EXISTS (SELECT 1 FROM public.delivery_attempts a
               WHERE a.id = delivery_payable_adjustments.attempt_id
                 AND public.driver_sees_attempt(auth.uid(), a.route_id, a.driver_id))
  );

-- ---------- 7. Recebimentos declarados ----------
CREATE TABLE public.delivery_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.delivery_attempts(id) ON DELETE CASCADE,
  note_id uuid NOT NULL REFERENCES public.delivery_notes(id) ON DELETE CASCADE,
  route_id uuid REFERENCES public.route_schedules(id) ON DELETE SET NULL,
  method_id text NOT NULL REFERENCES public.payment_methods(id),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  gross_cents bigint,
  change_cents bigint NOT NULL DEFAULT 0,
  reference text,
  notes text,
  difference_reason text,
  declared_by uuid NOT NULL,
  declared_at timestamptz NOT NULL DEFAULT now(),
  op_key text NOT NULL,
  locked boolean NOT NULL DEFAULT false,
  closure_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_attempt ON public.delivery_payments(attempt_id);
CREATE INDEX idx_payments_route ON public.delivery_payments(route_id);
CREATE INDEX idx_payments_note ON public.delivery_payments(note_id);
GRANT SELECT ON public.delivery_payments TO authenticated;
GRANT ALL ON public.delivery_payments TO service_role;
ALTER TABLE public.delivery_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver recebimentos autorizados" ON public.delivery_payments
  FOR SELECT TO authenticated
  USING (
    public.is_delivery_manager(auth.uid()) OR public.is_finance(auth.uid())
    OR declared_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.delivery_attempts a
               WHERE a.id = delivery_payments.attempt_id
                 AND public.driver_sees_attempt(auth.uid(), a.route_id, a.driver_id))
  );

-- ---------- 8. Prestação de contas / envelope ----------
CREATE TABLE public.route_cash_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES public.route_schedules(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL,
  envelope_code text NOT NULL UNIQUE,
  cash_declared_cents bigint NOT NULL DEFAULT 0,
  no_cash boolean NOT NULL DEFAULT false,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_cents bigint NOT NULL DEFAULT 0,
  declared_cents bigint NOT NULL DEFAULT 0,
  exceptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','counting','resolved')),
  submitted_by uuid NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  counted_cents bigint,
  counted_by uuid,
  counted_at timestamptz,
  difference_cents bigint,
  resolution_note text,
  resolved_by uuid,
  resolved_at timestamptz,
  op_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_closure_route_driver ON public.route_cash_closures(route_id, driver_id);
GRANT SELECT ON public.route_cash_closures TO authenticated;
GRANT ALL ON public.route_cash_closures TO service_role;
ALTER TABLE public.route_cash_closures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver fechos autorizados" ON public.route_cash_closures
  FOR SELECT TO authenticated
  USING (public.is_delivery_manager(auth.uid()) OR public.is_finance(auth.uid())
         OR driver_id = auth.uid() OR submitted_by = auth.uid());
CREATE TRIGGER closures_updated BEFORE UPDATE ON public.route_cash_closures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.delivery_payments
  ADD CONSTRAINT delivery_payments_closure_fk
  FOREIGN KEY (closure_id) REFERENCES public.route_cash_closures(id) ON DELETE SET NULL;

CREATE TABLE public.route_closure_method_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_id uuid NOT NULL REFERENCES public.route_cash_closures(id) ON DELETE CASCADE,
  method_id text NOT NULL REFERENCES public.payment_methods(id),
  declared_cents bigint NOT NULL,
  confirmed_cents bigint,
  reference text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','divergent')),
  note text,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_check_closure_method ON public.route_closure_method_checks(closure_id, method_id);
GRANT SELECT ON public.route_closure_method_checks TO authenticated;
GRANT ALL ON public.route_closure_method_checks TO service_role;
ALTER TABLE public.route_closure_method_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver conferencias autorizadas" ON public.route_closure_method_checks
  FOR SELECT TO authenticated
  USING (public.is_delivery_manager(auth.uid()) OR public.is_finance(auth.uid())
         OR EXISTS (SELECT 1 FROM public.route_cash_closures c
                    WHERE c.id = closure_id AND c.driver_id = auth.uid()));
CREATE TRIGGER checks_updated BEFORE UPDATE ON public.route_closure_method_checks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 9. Assistências ----------
CREATE TABLE public.delivery_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid REFERENCES public.delivery_attempts(id) ON DELETE SET NULL,
  note_id uuid REFERENCES public.delivery_notes(id) ON DELETE SET NULL,
  route_id uuid REFERENCES public.route_schedules(id) ON DELETE SET NULL,
  order_number text NOT NULL,
  client_name text,
  subject text NOT NULL,
  description text NOT NULL,
  delivery_outcome text,
  product_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  driver_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  dispatch_status text NOT NULL DEFAULT 'pending'
    CHECK (dispatch_status IN ('pending','sent','error')),
  dispatch_attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  last_error text,
  ticket_id text,
  ticket_number text,
  deduplicated boolean,
  op_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_incidents_status ON public.delivery_incidents(dispatch_status);
CREATE INDEX idx_incidents_attempt ON public.delivery_incidents(attempt_id);
GRANT SELECT ON public.delivery_incidents TO authenticated;
GRANT ALL ON public.delivery_incidents TO service_role;
ALTER TABLE public.delivery_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver assistencias autorizadas" ON public.delivery_incidents
  FOR SELECT TO authenticated
  USING (public.is_delivery_manager(auth.uid()) OR public.is_finance(auth.uid())
         OR driver_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.delivery_attempts a
                    WHERE a.id = delivery_incidents.attempt_id
                      AND public.driver_sees_attempt(auth.uid(), a.route_id, a.driver_id)));
CREATE TRIGGER incidents_updated BEFORE UPDATE ON public.delivery_incidents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 10. Composição da rota invalida importação ----------
CREATE OR REPLACE FUNCTION public.bump_route_composition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r uuid;
BEGIN
  FOREACH r IN ARRAY ARRAY[NEW.route_id, CASE WHEN TG_OP='UPDATE' THEN OLD.route_id END] LOOP
    IF r IS NULL THEN CONTINUE; END IF;
    UPDATE public.route_schedules
       SET composition_version = composition_version + 1, updated_at = now()
     WHERE id = r;
    UPDATE public.route_previsto_imports
       SET status = CASE WHEN status = 'running' THEN status ELSE status END,
           invalidated_at = COALESCE(invalidated_at, now()),
           invalidated_reason = COALESCE(invalidated_reason,
             'Composição da rota alterada após a importação')
     WHERE route_id = r AND invalidated_at IS NULL;
  END LOOP;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_attempt_route_composition
AFTER INSERT OR UPDATE OF route_id ON public.delivery_attempts
FOR EACH ROW EXECUTE FUNCTION public.bump_route_composition();

-- ---------- 11. Fecho de preparação ----------
CREATE OR REPLACE FUNCTION public.close_route_preparation(p_route_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v record;
BEGIN
  IF NOT public.is_delivery_manager(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para fechar a preparação da rota';
  END IF;
  SELECT * INTO v FROM public.route_schedules WHERE id = p_route_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rota não encontrada'; END IF;
  IF v.preparation_closed_at IS NOT NULL THEN
    RETURN jsonb_build_object('already_closed', true, 'composition_version', v.composition_version);
  END IF;
  UPDATE public.route_schedules
     SET preparation_closed_at = now(), preparation_closed_by = v_uid
   WHERE id = p_route_id;
  RETURN jsonb_build_object('closed', true, 'composition_version', v.composition_version);
END; $$;

CREATE OR REPLACE FUNCTION public.reopen_route_preparation(p_route_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_delivery_manager(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para reabrir a preparação da rota';
  END IF;
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Indique o motivo da reabertura';
  END IF;
  UPDATE public.route_schedules
     SET preparation_closed_at = NULL, preparation_closed_by = NULL,
         preparation_reopen_reason = p_reason,
         composition_version = composition_version + 1
   WHERE id = p_route_id;
  UPDATE public.route_previsto_imports
     SET invalidated_at = COALESCE(invalidated_at, now()),
         invalidated_reason = COALESCE(invalidated_reason, 'Preparação reaberta: ' || p_reason)
   WHERE route_id = p_route_id AND invalidated_at IS NULL;
  INSERT INTO public.delivery_events (note_id, attempt_id, event_type, payload, actor)
  VALUES (NULL, NULL, 'rota_preparacao_reaberta',
          jsonb_build_object('route_id', p_route_id, 'reason', p_reason), v_uid);
  RETURN jsonb_build_object('reopened', true);
END; $$;

-- ---------- 12. Valor a cobrar numa tentativa ----------
CREATE OR REPLACE FUNCTION public.attempt_amount_due(p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a record; v_expected bigint; v_paid_before bigint; v_override bigint;
  v_unknown integer; v_already bigint; v_rev integer;
BEGIN
  SELECT * INTO a FROM public.delivery_attempts WHERE id = p_attempt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tentativa não encontrada'; END IF;

  SELECT max(revision) INTO v_rev FROM public.delivery_note_payables
   WHERE note_id = a.note_id AND active;

  SELECT
    COALESCE(sum(amount_cents) FILTER (WHERE classification='collect_on_delivery'),0),
    COALESCE(sum(amount_cents) FILTER (WHERE classification='already_paid'),0),
    count(*) FILTER (WHERE classification='unknown')
  INTO v_expected, v_already, v_unknown
  FROM public.delivery_note_payables
  WHERE note_id = a.note_id AND active AND revision = v_rev;

  SELECT COALESCE(sum(amount_cents),0) INTO v_paid_before
    FROM public.delivery_payments p
   WHERE p.note_id = a.note_id AND p.attempt_id <> p_attempt_id;

  SELECT amount_cents INTO v_override
    FROM public.delivery_payable_adjustments
   WHERE attempt_id = p_attempt_id AND active
   ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'has_previsto', v_rev IS NOT NULL,
    'revision', v_rev,
    'expected_cents', COALESCE(v_expected,0),
    'already_paid_cents', COALESCE(v_already,0),
    'paid_previous_attempts_cents', COALESCE(v_paid_before,0),
    'override_cents', v_override,
    'unknown_parcels', COALESCE(v_unknown,0),
    'due_cents', GREATEST(COALESCE(v_override, COALESCE(v_expected,0) - COALESCE(v_paid_before,0)), 0)
  );
END; $$;

-- ---------- 13. Ajuste autorizado ----------
CREATE OR REPLACE FUNCTION public.set_attempt_payable_override(
  p_attempt_id uuid, p_amount_cents bigint, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_note uuid;
BEGIN
  IF NOT public.is_delivery_manager(v_uid) AND NOT public.is_finance(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para alterar o valor a cobrar';
  END IF;
  IF coalesce(trim(p_reason),'') = '' THEN RAISE EXCEPTION 'Indique o motivo do ajuste'; END IF;
  IF p_amount_cents < 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  SELECT note_id INTO v_note FROM public.delivery_attempts WHERE id = p_attempt_id;
  IF v_note IS NULL THEN RAISE EXCEPTION 'Tentativa não encontrada'; END IF;
  UPDATE public.delivery_payable_adjustments SET active = false
   WHERE attempt_id = p_attempt_id AND active;
  INSERT INTO public.delivery_payable_adjustments
    (attempt_id, note_id, amount_cents, reason, authorized_by)
  VALUES (p_attempt_id, v_note, p_amount_cents, p_reason, v_uid);
  INSERT INTO public.delivery_events (note_id, attempt_id, event_type, payload, actor)
  VALUES (v_note, p_attempt_id, 'valor_cobranca_ajustado',
          jsonb_build_object('amount_cents', p_amount_cents, 'reason', p_reason), v_uid);
  RETURN jsonb_build_object('ok', true);
END; $$;

-- ---------- 14. Declaração de recebimentos pelo entregador ----------
CREATE OR REPLACE FUNCTION public.declare_delivery_payments(
  p_attempt_id uuid, p_lines jsonb, p_difference_reason text, p_op_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); a record; l jsonb; v_total bigint := 0;
  v_due jsonb; v_method record; v_prev jsonb; v_closed boolean;
BEGIN
  IF coalesce(trim(p_op_key),'') = '' THEN RAISE EXCEPTION 'Chave de operação em falta'; END IF;

  SELECT result INTO v_prev FROM public.delivery_operations WHERE op_key = p_op_key;
  IF v_prev IS NOT NULL THEN RETURN v_prev; END IF;

  SELECT * INTO a FROM public.delivery_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tentativa não encontrada'; END IF;

  IF NOT public.is_delivery_manager(v_uid)
     AND NOT public.driver_sees_attempt(v_uid, a.route_id, a.driver_id) THEN
    RAISE EXCEPTION 'Sem autorização para declarar recebimentos desta entrega';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.route_cash_closures c
                 WHERE c.route_id = a.route_id AND c.driver_id = v_uid) INTO v_closed;
  IF v_closed THEN
    RAISE EXCEPTION 'A prestação de contas desta rota já foi fechada; peça reabertura ao responsável';
  END IF;

  IF EXISTS (SELECT 1 FROM public.delivery_payments WHERE attempt_id = p_attempt_id AND locked) THEN
    RAISE EXCEPTION 'Os recebimentos desta entrega já estão bloqueados';
  END IF;

  v_due := public.attempt_amount_due(p_attempt_id);

  DELETE FROM public.delivery_payments WHERE attempt_id = p_attempt_id AND NOT locked;

  FOR l IN SELECT * FROM jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) LOOP
    SELECT * INTO v_method FROM public.payment_methods
     WHERE id = l->>'method_id' AND active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Forma de pagamento não configurada: %', l->>'method_id'; END IF;
    IF (l->>'amount_cents')::bigint <= 0 THEN CONTINUE; END IF;
    IF v_method.requires_reference AND coalesce(trim(l->>'reference'),'') = '' THEN
      RAISE EXCEPTION 'Indique a referência para %', v_method.label;
    END IF;
    INSERT INTO public.delivery_payments
      (attempt_id, note_id, route_id, method_id, amount_cents, gross_cents, change_cents,
       reference, notes, difference_reason, declared_by, op_key)
    VALUES (p_attempt_id, a.note_id, a.route_id, v_method.id,
            (l->>'amount_cents')::bigint,
            NULLIF(l->>'gross_cents','')::bigint,
            COALESCE(NULLIF(l->>'change_cents','')::bigint, 0),
            NULLIF(l->>'reference',''), NULLIF(l->>'notes',''),
            NULLIF(p_difference_reason,''), v_uid, p_op_key);
    v_total := v_total + (l->>'amount_cents')::bigint;
  END LOOP;

  IF v_total <> (v_due->>'due_cents')::bigint
     AND coalesce(trim(p_difference_reason),'') = '' THEN
    RAISE EXCEPTION 'Indique o motivo da diferença face ao previsto';
  END IF;

  INSERT INTO public.delivery_events (note_id, attempt_id, event_type, payload, actor)
  VALUES (a.note_id, p_attempt_id, 'recebimento_declarado',
          jsonb_build_object('total_cents', v_total, 'due', v_due,
                             'difference_reason', p_difference_reason), v_uid);

  v_prev := jsonb_build_object('total_cents', v_total,
                               'due_cents', (v_due->>'due_cents')::bigint,
                               'difference_cents', v_total - (v_due->>'due_cents')::bigint);
  INSERT INTO public.delivery_operations (op_key, kind, attempt_id, actor, result)
  VALUES (p_op_key, 'declare_payments', p_attempt_id, v_uid, v_prev);
  RETURN v_prev;
END; $$;

-- ---------- 15. Prestação de contas por rota ----------
CREATE OR REPLACE FUNCTION public.submit_route_accounting(
  p_route_id uuid, p_cash_cents bigint, p_no_cash boolean, p_notes text, p_op_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_closure uuid; v_env text; v_totals jsonb;
  v_declared bigint; v_expected bigint; v_cash bigint; v_exc jsonb; v_prev record; m record;
BEGIN
  IF coalesce(trim(p_op_key),'') = '' THEN RAISE EXCEPTION 'Chave de operação em falta'; END IF;
  SELECT * INTO v_prev FROM public.route_cash_closures WHERE op_key = p_op_key;
  IF FOUND THEN
    RETURN jsonb_build_object('closure_id', v_prev.id, 'envelope_code', v_prev.envelope_code,
                              'idempotent', true);
  END IF;

  IF EXISTS (SELECT 1 FROM public.route_cash_closures
              WHERE route_id = p_route_id AND driver_id = v_uid) THEN
    RAISE EXCEPTION 'Já fechou a prestação de contas desta rota';
  END IF;

  IF NOT public.is_delivery_manager(v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.route_schedules r
                     WHERE r.id = p_route_id AND r.driver_id = v_uid) THEN
    RAISE EXCEPTION 'Sem autorização para fechar contas desta rota';
  END IF;

  SELECT COALESCE(jsonb_object_agg(t.method_id, t.total), '{}'::jsonb),
         COALESCE(sum(t.total), 0)
    INTO v_totals, v_declared
    FROM (SELECT method_id, sum(amount_cents) AS total
            FROM public.delivery_payments
           WHERE route_id = p_route_id AND declared_by = v_uid
           GROUP BY method_id) t;

  SELECT COALESCE(sum((public.attempt_amount_due(a.id)->>'due_cents')::bigint), 0)
    INTO v_expected
    FROM public.delivery_attempts a
   WHERE a.route_id = p_route_id AND a.driver_id IS NOT DISTINCT FROM v_uid;

  SELECT COALESCE(sum(p.amount_cents), 0) INTO v_cash
    FROM public.delivery_payments p
    JOIN public.payment_methods m ON m.id = p.method_id
   WHERE p.route_id = p_route_id AND p.declared_by = v_uid AND m.kind = 'cash';

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
   WHERE route_id = p_route_id AND declared_by = v_uid;

  FOR m IN SELECT pm.id, pm.kind, sum(p.amount_cents) AS total
             FROM public.delivery_payments p
             JOIN public.payment_methods pm ON pm.id = p.method_id
            WHERE p.closure_id = v_closure
            GROUP BY pm.id, pm.kind LOOP
    INSERT INTO public.route_closure_method_checks (closure_id, method_id, declared_cents)
    VALUES (v_closure, m.id, m.total);
  END LOOP;

  UPDATE public.route_schedules SET financial_status = 'submitted' WHERE id = p_route_id;

  INSERT INTO public.delivery_events (note_id, attempt_id, event_type, payload, actor)
  VALUES (NULL, NULL, 'prestacao_contas_submetida',
          jsonb_build_object('route_id', p_route_id, 'closure_id', v_closure,
                             'envelope_code', v_env, 'cash_cents', v_cash,
                             'declared_cents', v_declared), v_uid);

  RETURN jsonb_build_object('closure_id', v_closure, 'envelope_code', v_env,
                            'cash_cents', CASE WHEN p_no_cash THEN 0 ELSE p_cash_cents END,
                            'declared_cents', v_declared, 'expected_cents', v_expected);
END; $$;

-- ---------- 16. Conferência financeira ----------
CREATE OR REPLACE FUNCTION public.finance_count_envelope(
  p_closure_id uuid, p_counted_cents bigint, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); c record;
BEGIN
  IF NOT public.is_finance(v_uid) THEN RAISE EXCEPTION 'Sem permissão financeira'; END IF;
  SELECT * INTO c FROM public.route_cash_closures WHERE id = p_closure_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fecho não encontrado'; END IF;
  IF c.driver_id = v_uid OR c.submitted_by = v_uid THEN
    RAISE EXCEPTION 'O responsável pela custódia não pode conferir o próprio envelope';
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
END; $$;

CREATE OR REPLACE FUNCTION public.finance_confirm_method(
  p_check_id uuid, p_confirmed_cents bigint, p_reference text, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); k record;
BEGIN
  IF NOT public.is_finance(v_uid) THEN RAISE EXCEPTION 'Sem permissão financeira'; END IF;
  SELECT * INTO k FROM public.route_closure_method_checks WHERE id = p_check_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conferência não encontrada'; END IF;
  IF EXISTS (SELECT 1 FROM public.route_cash_closures c
              WHERE c.id = k.closure_id AND (c.driver_id = v_uid OR c.submitted_by = v_uid)) THEN
    RAISE EXCEPTION 'Não pode conferir a sua própria prestação de contas';
  END IF;
  UPDATE public.route_closure_method_checks
     SET confirmed_cents = p_confirmed_cents, reference = NULLIF(p_reference,''),
         note = NULLIF(p_note,''), confirmed_by = v_uid, confirmed_at = now(),
         status = CASE WHEN p_confirmed_cents = k.declared_cents THEN 'confirmed' ELSE 'divergent' END
   WHERE id = p_check_id;
  RETURN jsonb_build_object('ok', true,
    'difference_cents', p_confirmed_cents - k.declared_cents);
END; $$;

CREATE OR REPLACE FUNCTION public.finance_resolve_closure(p_closure_id uuid, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); c record; v_pending integer;
BEGIN
  IF NOT public.is_finance(v_uid) THEN RAISE EXCEPTION 'Sem permissão financeira'; END IF;
  SELECT * INTO c FROM public.route_cash_closures WHERE id = p_closure_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fecho não encontrado'; END IF;
  IF c.counted_at IS NULL AND NOT c.no_cash AND c.cash_declared_cents > 0 THEN
    RAISE EXCEPTION 'Falta conferir o envelope de numerário';
  END IF;
  SELECT count(*) INTO v_pending FROM public.route_closure_method_checks
   WHERE closure_id = p_closure_id AND status = 'pending';
  IF v_pending > 0 THEN
    RAISE EXCEPTION 'Faltam % conferência(s) de meios electrónicos', v_pending;
  END IF;
  IF coalesce(c.difference_cents,0) <> 0 AND coalesce(trim(p_note),'') = '' THEN
    RAISE EXCEPTION 'Há diferença por explicar: indique a resolução';
  END IF;
  UPDATE public.route_cash_closures
     SET status = 'resolved', resolved_by = v_uid, resolved_at = now(),
         resolution_note = COALESCE(NULLIF(p_note,''), resolution_note)
   WHERE id = p_closure_id;
  UPDATE public.route_schedules SET financial_status = 'settled'
   WHERE id = c.route_id
     AND NOT EXISTS (SELECT 1 FROM public.route_cash_closures x
                     WHERE x.route_id = c.route_id AND x.status <> 'resolved');
  INSERT INTO public.delivery_events (event_type, payload, actor)
  VALUES ('prestacao_contas_resolvida',
          jsonb_build_object('closure_id', p_closure_id, 'note', p_note), v_uid);
  RETURN jsonb_build_object('resolved', true);
END; $$;

-- ---------- 17. Abrir assistência ----------
CREATE OR REPLACE FUNCTION public.open_delivery_incident(
  p_attempt_id uuid, p_subject text, p_description text,
  p_lines jsonb, p_attachments jsonb, p_op_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); a record; v_id uuid; v_existing record;
BEGIN
  IF coalesce(trim(p_op_key),'') = '' THEN RAISE EXCEPTION 'Chave de operação em falta'; END IF;
  SELECT * INTO v_existing FROM public.delivery_incidents WHERE op_key = p_op_key;
  IF FOUND THEN RETURN jsonb_build_object('incident_id', v_existing.id, 'idempotent', true); END IF;

  SELECT * INTO a FROM public.delivery_attempts WHERE id = p_attempt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tentativa não encontrada'; END IF;
  IF NOT public.is_delivery_manager(v_uid)
     AND NOT public.driver_sees_attempt(v_uid, a.route_id, a.driver_id) THEN
    RAISE EXCEPTION 'Sem autorização para abrir assistência nesta entrega';
  END IF;
  IF coalesce(trim(p_subject),'') = '' OR coalesce(trim(p_description),'') = '' THEN
    RAISE EXCEPTION 'Assunto e descrição são obrigatórios';
  END IF;

  INSERT INTO public.delivery_incidents
    (attempt_id, note_id, route_id, order_number, client_name, subject, description,
     delivery_outcome, product_lines, attachments, driver_id, op_key)
  VALUES (p_attempt_id, a.note_id, a.route_id, a.order_number, a.client_name,
          p_subject, p_description, a.outcome,
          coalesce(p_lines,'[]'::jsonb), coalesce(p_attachments,'[]'::jsonb), v_uid, p_op_key)
  RETURNING id INTO v_id;

  INSERT INTO public.delivery_events (note_id, attempt_id, event_type, payload, actor)
  VALUES (a.note_id, p_attempt_id, 'assistencia_aberta',
          jsonb_build_object('incident_id', v_id, 'subject', p_subject), v_uid);

  RETURN jsonb_build_object('incident_id', v_id);
END; $$;

-- ---------- 18. Permissões de execução ----------
REVOKE ALL ON FUNCTION public.close_route_preparation(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.reopen_route_preparation(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.attempt_amount_due(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.set_attempt_payable_override(uuid, bigint, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.declare_delivery_payments(uuid, jsonb, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.submit_route_accounting(uuid, bigint, boolean, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.finance_count_envelope(uuid, bigint, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.finance_confirm_method(uuid, bigint, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.finance_resolve_closure(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.open_delivery_incident(uuid, text, text, jsonb, jsonb, text) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.close_route_preparation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_route_preparation(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.attempt_amount_due(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_attempt_payable_override(uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.declare_delivery_payments(uuid, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_route_accounting(uuid, bigint, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_count_envelope(uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_confirm_method(uuid, bigint, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_resolve_closure(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_delivery_incident(uuid, text, text, jsonb, jsonb, text) TO authenticated;