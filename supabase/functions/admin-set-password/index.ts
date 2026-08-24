import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

    if (callerProfile?.role !== 'admin') {
      return json({ error: 'Apenas administradores podem alterar senhas' }, 403);
    }

    const { user_id, new_password } = await req.json();
    if (!user_id || typeof new_password !== 'string' || new_password.length < 6) {
      return json({ error: 'Dados inválidos (senha mínima de 6 caracteres)' }, 400);
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(user_id, {
      password: new_password,
    });
    if (updateError) {
      const msg = /known to be weak|pwned|leaked/i.test(updateError.message)
        ? 'Esta senha é demasiado comum e aparece em fugas de dados conhecidas. Escolha uma senha diferente (ex.: mistura de letras, números e símbolos).'
        : updateError.message;
      return json({ error: msg }, 400);
    }

    return json({ success: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro inesperado' }, 500);
  }
});
