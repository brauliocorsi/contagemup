import { useState, useEffect, useRef, useCallback, createContext, useContext, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';
import { Profile } from '@/types/stock';
import { clearAllDrafts } from '@/lib/finance/paymentDrafts';
import { purgeForeignCountingDrafts } from '@/lib/scanner/countingDraft';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const prevUserId = useRef<string | null>(null);
  const prevRole = useRef<string | null>(null);
  /** Cada pedido de perfil recebe um número; respostas antigas são descartadas. */
  const fetchSeq = useRef(0);

  // Troca de utilizador: nada do anterior pode sobreviver
  useEffect(() => {
    if (user?.id !== prevUserId.current) {
      if (prevUserId.current !== null) {
        queryClient.clear();
        localStorage.removeItem('counting_selected_session');
        clearAllDrafts();
      }
      purgeForeignCountingDrafts(user?.id ?? null);
      prevUserId.current = user?.id ?? null;
      prevRole.current = null;
    }
  }, [user?.id, queryClient]);

  // Mudança de função: o que estava em cache já não corresponde às permissões
  useEffect(() => {
    const role = profile?.role ?? null;
    if (prevRole.current !== null && role !== prevRole.current) {
      queryClient.clear();
    }
    prevRole.current = role;
  }, [profile?.role, queryClient]);

  /**
   * Lê o perfil ignorando respostas obsoletas. Falha de leitura NÃO conserva o
   * perfil anterior: sem perfil não há acesso nenhum.
   */
  const fetchProfile = useCallback(async (userId: string) => {
    const seq = ++fetchSeq.current;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (seq !== fetchSeq.current) return; // resposta ultrapassada
    setProfile(!error && data ? (data as Profile) : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        void fetchProfile(session.user.id);
      } else {
        fetchSeq.current++;
        setProfile(null);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser((prev) => {
        // conta diferente: o perfil anterior desaparece já, antes da nova leitura
        if (prev?.id !== session?.user?.id) {
          fetchSeq.current++;
          setProfile(null);
        }
        return session?.user ?? null;
      });
      if (session?.user) {
        void fetchProfile(session.user.id);
      } else {
        fetchSeq.current++;
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  /**
   * A função pode ser alterada pelo Master a qualquer momento. Revalidamos ao
   * regressar à aplicação e em tempo real sobre a própria linha de perfil.
   */
  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;

    const revalidate = () => {
      if (!document.hidden) void fetchProfile(uid);
    };
    document.addEventListener('visibilitychange', revalidate);
    window.addEventListener('focus', revalidate);

    const channel = supabase
      .channel(`perfil:${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `user_id=eq.${uid}` },
        () => void fetchProfile(uid),
      )
      .subscribe();

    return () => {
      document.removeEventListener('visibilitychange', revalidate);
      window.removeEventListener('focus', revalidate);
      void supabase.removeChannel(channel);
    };
  }, [user?.id, fetchProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name }
      }
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    // Limpar cache do React Query ANTES do logout
    console.log('Signing out, clearing all cache...');
    queryClient.clear();
    
    // Limpar localStorage específico do utilizador
    localStorage.removeItem('counting_selected_session');
    clearAllDrafts();
    
    // Fazer logout
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
