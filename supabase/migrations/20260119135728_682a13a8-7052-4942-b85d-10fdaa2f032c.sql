-- Criar tabela count_logs para rastrear operações de contagem
CREATE TABLE public.count_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.counting_sessions(id) ON DELETE CASCADE,
  colis_number INTEGER NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('increment', 'decrement')),
  quantity_before INTEGER NOT NULL,
  quantity_after INTEGER NOT NULL,
  counted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_count_logs_product_id ON public.count_logs(product_id);
CREATE INDEX idx_count_logs_session_id ON public.count_logs(session_id);
CREATE INDEX idx_count_logs_created_at ON public.count_logs(created_at DESC);

-- Habilitar RLS
ALTER TABLE public.count_logs ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Authenticated users can view count logs"
  ON public.count_logs FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert count logs"
  ON public.count_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);