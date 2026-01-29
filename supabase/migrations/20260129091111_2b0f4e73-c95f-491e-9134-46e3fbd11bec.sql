
-- Recreate the trigger for stock synchronization
DROP TRIGGER IF EXISTS trigger_sync_product_stock ON counts;

CREATE TRIGGER trigger_sync_product_stock
  AFTER INSERT OR UPDATE OR DELETE ON counts
  FOR EACH ROW
  EXECUTE FUNCTION sync_product_stock();

-- Verify trigger is created
COMMENT ON TRIGGER trigger_sync_product_stock ON counts IS 'Automatically syncs product current_stock when counts change';
