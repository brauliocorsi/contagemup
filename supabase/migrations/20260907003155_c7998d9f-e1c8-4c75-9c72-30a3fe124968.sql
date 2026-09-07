REVOKE EXECUTE ON FUNCTION public.wo_guard_location_audits() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.wo_guard_location_audit_items() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.wo_guard_picking_tasks() FROM PUBLIC, anon, authenticated;

DO $do$
DECLARE
  r record;
  def text;
BEGIN
  FOR r IN SELECT unnest(ARRAY[
    'public.deliver_location_audit(uuid)',
    'public.complete_location_audit(uuid,boolean)',
    'public.stage_picking_to_dock(uuid,text,jsonb)',
    'public.load_notes_to_vehicle(uuid[],text,jsonb)'
  ]) AS sig
  LOOP
    def := pg_get_functiondef(r.sig::regprocedure);
    IF def LIKE '%app.wms_rpc%' THEN CONTINUE; END IF;
    def := replace(
      def,
      'PERFORM public.assert_app_role(',
      'PERFORM set_config(''app.wms_rpc'', ''1'', true); PERFORM public.assert_app_role('
    );
    IF def NOT LIKE '%app.wms_rpc%' THEN
      RAISE EXCEPTION 'Não foi possível marcar a operação em %', r.sig;
    END IF;
    EXECUTE def;
  END LOOP;
END;
$do$;