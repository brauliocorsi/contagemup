import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CountingSession } from '@/types/stock';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from './useAuth';

export function useSessions() {
  const [sessions, setSessions] = useState<CountingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchSessions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('counting_sessions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as sessões',
        variant: 'destructive'
      });
    } else {
      setSessions((data as CountingSession[]) || []);
    }
    setLoading(false);
  };

  const createSession = async (name: string, category: string = 'Todas') => {
    if (!user) return null;

    const { data, error } = await supabase
      .from('counting_sessions')
      .insert({ name, category, created_by: user.id })
      .select()
      .single();

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível criar a sessão',
        variant: 'destructive'
      });
      return null;
    }

    toast({ title: 'Sucesso', description: 'Sessão criada com sucesso' });
    await fetchSessions();
    return data as CountingSession;
  };

  const completeSession = async (id: string) => {
    const { error } = await supabase
      .from('counting_sessions')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível completar a sessão',
        variant: 'destructive'
      });
      return false;
    }

    toast({ title: 'Sucesso', description: 'Sessão completada' });
    await fetchSessions();
    return true;
  };

  const cancelSession = async (id: string) => {
    const { error } = await supabase
      .from('counting_sessions')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível cancelar a sessão',
        variant: 'destructive'
      });
      return false;
    }

    toast({ title: 'Sucesso', description: 'Sessão cancelada' });
    await fetchSessions();
    return true;
  };

  const deleteSession = async (id: string) => {
    try {
      // 1. Delete count_logs related to the session
      const { error: logsError } = await supabase
        .from('count_logs')
        .delete()
        .eq('session_id', id);

      if (logsError) {
        console.error('Error deleting count logs:', logsError);
      }

      // 2. Delete counts related to the session
      const { error: countsError } = await supabase
        .from('counts')
        .delete()
        .eq('session_id', id);

      if (countsError) {
        console.error('Error deleting counts:', countsError);
      }

      // 3. Get reconciliations for this session
      const { data: recs } = await supabase
        .from('reconciliations')
        .select('id')
        .eq('session_id', id);

      // 4. Delete reconciliation items
      if (recs && recs.length > 0) {
        const recIds = recs.map(r => r.id);
        const { error: itemsError } = await supabase
          .from('reconciliation_items')
          .delete()
          .in('reconciliation_id', recIds);

        if (itemsError) {
          console.error('Error deleting reconciliation items:', itemsError);
        }
      }

      // 5. Delete reconciliations
      const { error: recsError } = await supabase
        .from('reconciliations')
        .delete()
        .eq('session_id', id);

      if (recsError) {
        console.error('Error deleting reconciliations:', recsError);
      }

      // 6. Delete the session itself
      const { error } = await supabase
        .from('counting_sessions')
        .delete()
        .eq('id', id);

      if (error) {
        toast({
          title: 'Erro',
          description: 'Não foi possível eliminar a sessão',
          variant: 'destructive'
        });
        return false;
      }

      toast({ title: 'Sucesso', description: 'Sessão eliminada definitivamente' });
      await fetchSessions();
      return true;
    } catch (err) {
      console.error('Error deleting session:', err);
      toast({
        title: 'Erro',
        description: 'Ocorreu um erro ao eliminar a sessão',
        variant: 'destructive'
      });
      return false;
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

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
