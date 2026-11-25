import { createClient } from 'npm:@supabase/supabase-js@2.119.2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2.119.2/cors';
import { createHandler } from './handler.ts';

Deno.serve(createHandler(corsHeaders, {
  expectedToken: () => Deno.env.get('FACTORY_INTAKE_TOKEN'),
  processBatch: async (payload) => {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) throw new Error('Unavailable');
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    return db.rpc('receive_factory_batch', { p_payload: payload });
  },
}));