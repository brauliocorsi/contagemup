
CREATE TABLE public.erp_products_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL DEFAULT '',
  erp_stock numeric NOT NULL DEFAULT 0,
  grupo text NOT NULL DEFAULT '',
  raw_data jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_erp_products_cache_code ON public.erp_products_cache(code);
CREATE INDEX idx_erp_products_cache_fetched_at ON public.erp_products_cache(fetched_at);

ALTER TABLE public.erp_products_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view erp products cache" ON public.erp_products_cache FOR SELECT TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert erp products cache" ON public.erp_products_cache FOR INSERT TO public WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete erp products cache" ON public.erp_products_cache FOR DELETE TO public USING (auth.uid() IS NOT NULL);

CREATE TABLE public.erp_sales_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code text NOT NULL,
  venda_data jsonb NOT NULL DEFAULT '{}',
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_erp_sales_cache_code ON public.erp_sales_cache(product_code);
CREATE INDEX idx_erp_sales_cache_fetched_at ON public.erp_sales_cache(fetched_at);

ALTER TABLE public.erp_sales_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view erp sales cache" ON public.erp_sales_cache FOR SELECT TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert erp sales cache" ON public.erp_sales_cache FOR INSERT TO public WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete erp sales cache" ON public.erp_sales_cache FOR DELETE TO public USING (auth.uid() IS NOT NULL);
