import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Supplier {
  id: string;
  name: string;
}

/** Fornecedores do GestãoClick (cache 30 min). */
export function useSuppliers() {
  const query = useQuery({
    queryKey: ['gc-suppliers'],
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    queryFn: async (): Promise<Supplier[]> => {
      const { data, error } = await supabase.functions.invoke('gestaoclick-update-supplier', {
        body: { action: 'list-suppliers' },
      });
      if (error) throw error;

      const raw = Array.isArray(data) ? data : (data?.result ?? data?.data ?? []);
      const list: Supplier[] = (Array.isArray(raw) ? raw : [])
        .map((s: any) => ({
          id: String(s?.id ?? s?.fornecedor_id ?? ''),
          name: String(s?.nome ?? s?.razao_social ?? s?.nome_fantasia ?? '').trim(),
        }))
        .filter((s) => s.name);

      // remove duplicados por nome
      const seen = new Set<string>();
      const unique = list.filter((s) => {
        const k = s.name.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      return unique.sort((a, b) => a.name.localeCompare(b.name, 'pt'));
    },
  });

  return {
    suppliers: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
