REVOKE EXECUTE ON FUNCTION public.move_stock_qty(uuid,integer,integer,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.effective_total_colis(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.stage_picking_to_dock(uuid,text,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.load_notes_to_vehicle(uuid[],text,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deliver_note(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.return_note_items(uuid,text,jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.effective_total_colis(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stage_picking_to_dock(uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.load_notes_to_vehicle(uuid[],text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deliver_note(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_note_items(uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_stock_qty(uuid,integer,integer,text,text) TO authenticated;