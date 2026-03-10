-- Fix CH2 damaged_stock to match active damages
UPDATE products 
SET damaged_stock = COALESCE((
  SELECT SUM(pd.quantity) 
  FROM product_damages pd 
  WHERE pd.product_id = products.id AND pd.status = 'active'
), 0)
WHERE damaged_stock != COALESCE((
  SELECT SUM(pd.quantity) 
  FROM product_damages pd 
  WHERE pd.product_id = products.id AND pd.status = 'active'
), 0);

-- Create trigger function to auto-sync damaged_stock
CREATE OR REPLACE FUNCTION public.sync_damaged_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_product_id uuid;
  new_damaged_stock integer;
BEGIN
  -- Determine which product_id to update
  IF TG_OP = 'DELETE' THEN
    target_product_id := OLD.product_id;
  ELSE
    target_product_id := NEW.product_id;
  END IF;

  -- Recalculate damaged_stock from active damages
  SELECT COALESCE(SUM(quantity), 0) INTO new_damaged_stock
  FROM product_damages
  WHERE product_id = target_product_id AND status = 'active';

  -- Update the product
  UPDATE products SET damaged_stock = new_damaged_stock WHERE id = target_product_id;

  -- If product_id changed on UPDATE, also update the old product
  IF TG_OP = 'UPDATE' AND OLD.product_id != NEW.product_id THEN
    SELECT COALESCE(SUM(quantity), 0) INTO new_damaged_stock
    FROM product_damages
    WHERE product_id = OLD.product_id AND status = 'active';
    UPDATE products SET damaged_stock = new_damaged_stock WHERE id = OLD.product_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger on product_damages
DROP TRIGGER IF EXISTS trigger_sync_damaged_stock ON product_damages;
CREATE TRIGGER trigger_sync_damaged_stock
AFTER INSERT OR UPDATE OR DELETE ON product_damages
FOR EACH ROW
EXECUTE FUNCTION sync_damaged_stock();