import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'counting_selected_session';

interface ActiveSession {
  id: string;
  name: string;
  category: string;
}

export function useActiveSession() {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActiveSession = async () => {
      const savedSessionId = localStorage.getItem(STORAGE_KEY);
      
      if (!savedSessionId) {
        setActiveSession(null);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('counting_sessions')
        .select('id, name, category')
        .eq('id', savedSessionId)
        .eq('status', 'active')
        .maybeSingle();

      if (error || !data) {
        setActiveSession(null);
      } else {
        setActiveSession(data as ActiveSession);
      }
      setLoading(false);
    };

    fetchActiveSession();

    // Listen for storage changes (when session is changed in CountingView)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        fetchActiveSession();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // Also listen for custom event for same-tab updates
    const handleSessionChange = () => {
      fetchActiveSession();
    };
    window.addEventListener('session-changed', handleSessionChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('session-changed', handleSessionChange);
    };
  }, []);

  return { activeSession, loading };
}
