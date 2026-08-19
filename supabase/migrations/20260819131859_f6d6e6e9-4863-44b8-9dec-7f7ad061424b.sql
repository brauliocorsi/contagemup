REVOKE EXECUTE ON FUNCTION public.transfer_stock_location(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transfer_pallet_location(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_stock_location(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_pallet_location(text, text) TO authenticated, service_role;