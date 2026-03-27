
CREATE OR REPLACE FUNCTION public.cleanup_false_movements()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM stock_movements m
  WHERE m.quantity = 1
    AND EXISTS (
      SELECT 1 FROM count_logs l
      WHERE l.product_id = m.product_id
        AND ABS(EXTRACT(EPOCH FROM (l.created_at::timestamptz - m.created_at::timestamptz))) < 10
    );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.count_false_movements()
RETURNS TABLE(total_suspect bigint, affected_products bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::bigint AS total_suspect,
    COUNT(DISTINCT m.product_id)::bigint AS affected_products
  FROM stock_movements m
  WHERE m.quantity = 1
    AND EXISTS (
      SELECT 1 FROM count_logs l
      WHERE l.product_id = m.product_id
        AND ABS(EXTRACT(EPOCH FROM (l.created_at::timestamptz - m.created_at::timestamptz))) < 10
    );
END;
$$;
