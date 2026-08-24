import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Profile } from '@/types/stock';

/** Lista de perfis (utilizadores) para atribuições e histórico. */
export function useProfiles() {
  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return data as Profile[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const nameOf = (userId: string | null | undefined) => {
    if (!userId) return '—';
    return profiles.find((p) => p.user_id === userId)?.name ?? 'Utilizador';
  };

  return { profiles, isLoading, nameOf };
}
