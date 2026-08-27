create or replace function public.merge_duplicate_products(p_keep uuid, p_remove uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moved int := 0;
begin
  if p_keep = p_remove then
    raise exception 'Produtos iguais';
  end if;
  if not exists (select 1 from products where id = p_keep) or not exists (select 1 from products where id = p_remove) then
    raise exception 'Produto não encontrado';
  end if;

  -- counts: soma quantidades quando existe o mesmo coli/sessão/localização
  update counts c
  set quantity = c.quantity + d.qty
  from (
    select colis_number, coalesce(session_id,'00000000-0000-0000-0000-000000000000'::uuid) sid,
           coalesce(location,'') loc, sum(quantity) qty
    from counts where product_id = p_remove
    group by 1,2,3
  ) d
  where c.product_id = p_keep
    and c.colis_number = d.colis_number
    and coalesce(c.session_id,'00000000-0000-0000-0000-000000000000'::uuid) = d.sid
    and coalesce(c.location,'') = d.loc;

  delete from counts r
  where r.product_id = p_remove
    and exists (
      select 1 from counts k
      where k.product_id = p_keep
        and k.colis_number = r.colis_number
        and coalesce(k.session_id,'00000000-0000-0000-0000-000000000000'::uuid) = coalesce(r.session_id,'00000000-0000-0000-0000-000000000000'::uuid)
        and coalesce(k.location,'') = coalesce(r.location,'')
    );

  update counts set product_id = p_keep where product_id = p_remove;
  get diagnostics v_moved = row_count;

  update count_logs set product_id = p_keep where product_id = p_remove;
  update stock_movements set product_id = p_keep where product_id = p_remove;
  update stock_movement_lines set product_id = p_keep where product_id = p_remove;
  update product_damages set product_id = p_keep where product_id = p_remove;
  update product_changes set product_id = p_keep where product_id = p_remove;
  update stock_order_numbers set product_id = p_keep where product_id = p_remove;
  update delivery_note_items set product_id = p_keep where product_id = p_remove;
  update picking_items set product_id = p_keep where product_id = p_remove;
  update scanner_picking_task_items set product_id = p_keep where product_id = p_remove;
  update location_audit_items set product_id = p_keep where product_id = p_remove;
  update reconciliation_items set product_id = p_keep where product_id = p_remove;
  update product_barcodes b set product_id = p_keep
    where b.product_id = p_remove
      and not exists (select 1 from product_barcodes k where k.product_id = p_keep and k.barcode = b.barcode);
  delete from product_barcodes where product_id = p_remove;

  delete from products where id = p_remove;

  return jsonb_build_object('success', true, 'kept', p_keep, 'removed', p_remove, 'counts_moved', v_moved);
end;
$$;

revoke all on function public.merge_duplicate_products(uuid, uuid) from public;
grant execute on function public.merge_duplicate_products(uuid, uuid) to authenticated;