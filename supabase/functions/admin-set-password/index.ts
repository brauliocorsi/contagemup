import { createClient } from 'npm:@supabase/supabase-js@2.90.1';
import { z } from 'npm:zod@3.24.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BodySchema = z.object({
  user_id: z.string().uuid(),
  new_password: z.string().min(8).max(72),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json({ error: 'Configuração interna indisponível' }, 500);
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ error: 'Não autenticado' }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return json({ error: 'Não autenticado' }, 401);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('user_id', userData.user.id)
      .maybeSingle();

    if (callerProfile?.role !== 'admin' && callerProfile?.role !== 'master') {
      return json({ error: 'Apenas administradores podem alterar senhas' }, 403);
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: 'Dados inválidos. A senha deve ter entre 8 e 72 caracteres.' }, 400);
    }
    const { user_id, new_password } = parsed.data;

    const { error: updateError } = await admin.auth.admin.updateUserById(user_id, {
      password: new_password,
    });
    if (updateError) {
      const msg = /known to be weak|pwned|leaked/i.test(updateError.message)
        ? 'A senha cumpre os requisitos de formato, mas já apareceu numa fuga de dados e foi recusada. Crie uma senha totalmente diferente, sem sequências previsíveis como “a1b2c3”.'
        : updateError.message;
      return json({ error: msg }, 422);
    }

    return json({ success: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro inesperado' }, 500);
  }
});
