-- Function to sync product stock from counts
CREATE OR REPLACE FUNCTION public.sync_product_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_product_id uuid;
  new_stock integer;
BEGIN
  -- Determine which product was affected
  IF TG_OP = 'DELETE' THEN
    affected_product_id := OLD.product_id;
  ELSE
    affected_product_id := NEW.product_id;
  END IF;

  -- Calculate total stock from counts
  SELECT COALESCE(SUM(quantity), 0)
  INTO new_stock
  FROM counts
  WHERE product_id = affected_product_id;

  -- Update the product's current_stock
  UPDATE products
  SET current_stock = new_stock,
      updated_at = now()
  WHERE id = affected_product_id;

  -- For UPDATE, also check if product_id changed (moved count to different product)
  IF TG_OP = 'UPDATE' AND OLD.product_id IS DISTINCT FROM NEW.product_id THEN
    SELECT COALESCE(SUM(quantity), 0)
    INTO new_stock
    FROM counts
    WHERE product_id = OLD.product_id;

    UPDATE products
    SET current_stock = new_stock,
        updated_at = now()
    WHERE id = OLD.product_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger for automatic stock sync
DROP TRIGGER IF EXISTS trigger_sync_product_stock ON counts;
CREATE TRIGGER trigger_sync_product_stock
AFTER INSERT OR UPDATE OR DELETE ON counts
FOR EACH ROW
EXECUTE FUNCTION public.sync_product_stock();