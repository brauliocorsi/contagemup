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

  const createSession = async (name: string) => {
    if (!user) return null;

    const { data, error } = await supabase
      .from('counting_sessions')
      .insert({ name, created_by: user.id })
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

  useEffect(() => {
    fetchSessions();
  }, []);

  return {
    sessions,
    loading,
    fetchSessions,
    createSession,
    completeSession,
    cancelSession
  };
}
