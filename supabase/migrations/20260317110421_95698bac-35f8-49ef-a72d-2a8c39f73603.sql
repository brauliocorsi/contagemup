
-- Trigger to sync product stock when counts change
CREATE TRIGGER sync_product_stock_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.counts
FOR EACH ROW EXECUTE FUNCTION public.sync_product_stock();

-- Trigger to sync damaged stock when damages change
CREATE TRIGGER sync_damaged_stock_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.product_damages
FOR EACH ROW EXECUTE FUNCTION public.sync_damaged_stock();
