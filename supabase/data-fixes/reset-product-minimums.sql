WITH reset AS (
  UPDATE public.products SET min_stock = 0 WHERE min_stock > 0 RETURNING id
)
SELECT count(*) AS reset_products FROM reset;
