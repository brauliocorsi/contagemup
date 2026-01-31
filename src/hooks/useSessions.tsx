import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CountingSession } from '@/types/stock';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from './useAuth';

const fetchSessionsFromDB = async (): Promise<CountingSession[]> => {
  const { data, error } = await supabase
    .from('counting_sessions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as CountingSession[]) || [];
};

export function useSessions() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: sessions = [], isLoading: loading } = useQuery({
    queryKey: ['counting-sessions'],
    queryFn: fetchSessionsFromDB,
    staleTime: 2 * 60 * 1000, // 2 minutos
    gcTime: 5 * 60 * 1000, // 5 minutos
  });

  const createMutation = useMutation({
    mutationFn: async ({ name, category }: { name: string; category: string }) => {
      if (!user) throw new Error('Utilizador não autenticado');

      const { data, error } = await supabase
        .from('counting_sessions')
        .insert({ name, category, created_by: user.id })
        .select()
        .single();

      if (error) throw error;
      return data as CountingSession;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['counting-sessions'] });
      toast({ title: 'Sucesso', description: 'Sessão criada com sucesso' });
    },
    onError: () => {
      toast({
        title: 'Erro',
        description: 'Não foi possível criar a sessão',
        variant: 'destructive'
      });
    }
  });

  const completeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('counting_sessions')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['counting-sessions'] });
      toast({ title: 'Sucesso', description: 'Sessão completada' });
    },
    onError: () => {
      toast({
        title: 'Erro',
        description: 'Não foi possível completar a sessão',
        variant: 'destructive'
      });
    }
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('counting_sessions')
        .update({ status: 'cancelled' })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['counting-sessions'] });
      toast({ title: 'Sucesso', description: 'Sessão cancelada' });
    },
    onError: () => {
      toast({
        title: 'Erro',
        description: 'Não foi possível cancelar a sessão',
        variant: 'destructive'
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // 1. Delete count_logs related to the session
      await supabase.from('count_logs').delete().eq('session_id', id);

      // 2. Delete counts related to the session
      await supabase.from('counts').delete().eq('session_id', id);

      // 3. Get reconciliations for this session
      const { data: recs } = await supabase
        .from('reconciliations')
        .select('id')
        .eq('session_id', id);

      // 4. Delete reconciliation items
      if (recs && recs.length > 0) {
        const recIds = recs.map(r => r.id);
        await supabase
          .from('reconciliation_items')
          .delete()
          .in('reconciliation_id', recIds);
      }

      // 5. Delete reconciliations
      await supabase.from('reconciliations').delete().eq('session_id', id);

      // 6. Delete the session itself
      const { error } = await supabase
        .from('counting_sessions')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['counting-sessions'] });
      toast({ title: 'Sucesso', description: 'Sessão eliminada definitivamente' });
    },
    onError: (err) => {
      console.error('Error deleting session:', err);
      toast({
        title: 'Erro',
        description: 'Ocorreu um erro ao eliminar a sessão',
        variant: 'destructive'
      });
    }
  });

  const fetchSessions = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['counting-sessions'] });
  }, [queryClient]);

  const createSession = useCallback(async (name: string, category: string = 'Todas') => {
    try {
      return await createMutation.mutateAsync({ name, category });
    } catch {
      return null;
    }
  }, [createMutation]);

  const completeSession = useCallback(async (id: string) => {
    try {
      await completeMutation.mutateAsync(id);
      return true;
    } catch {
      return false;
    }
  }, [completeMutation]);

  const cancelSession = useCallback(async (id: string) => {
    try {
      await cancelMutation.mutateAsync(id);
      return true;
    } catch {
      return false;
    }
  }, [cancelMutation]);

  const deleteSession = useCallback(async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      return true;
    } catch {
      return false;
    }
  }, [deleteMutation]);

  return {
    sessions,
    loading,
    fetchSessions,
    createSession,
    completeSession,
    cancelSession,
    deleteSession
  };
}
