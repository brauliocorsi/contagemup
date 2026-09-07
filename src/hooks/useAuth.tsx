import { useState, useEffect, useRef, createContext, useContext, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';
import { Profile } from '@/types/stock';
import { clearAllDrafts } from '@/lib/finance/paymentDrafts';

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

  // Detectar mudança de utilizador e limpar cache
  useEffect(() => {
    if (user?.id !== prevUserId.current) {
      // Se havia um utilizador anterior e mudou, limpar cache
      if (prevUserId.current !== null && user?.id !== prevUserId.current) {
        console.log('User changed, clearing cache...');
        queryClient.clear();
        localStorage.removeItem('counting_selected_session');
        // rascunhos financeiros nunca podem passar de um operador para outro
        clearAllDrafts();
      }
      prevUserId.current = user?.id ?? null;
      prevRole.current = null;
    }
  }, [user?.id, queryClient]);

  // Mudança de função: o que estava em cache já não corresponde às permissões
  useEffect(() => {
    const role = profile?.role ?? null;
    if (prevRole.current !== null && role !== prevRole.current) {
      console.log('Role changed, clearing cache...');
      queryClient.clear();
    }
    prevRole.current = role;
  }, [profile?.role, queryClient]);


  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data) {
      setProfile(data as Profile);
    }
    setLoading(false);
  };

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
