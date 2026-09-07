import { createClient } from 'npm:@supabase/supabase-js@2.90.1';
import { z } from 'npm:zod@3.24.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    email: z.string().email(),
    password: z.string().min(6).max(72),
    name: z.string().min(1).max(120),
    role: z.enum(['admin', 'financeiro', 'operator', 'entregador', 'warehouse_operator']).optional(),
  }),
  z.object({
    action: z.literal('delete'),
    user_id: z.string().uuid(),
  }),
]);

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

    if (callerProfile?.role !== 'master') {
      return json({ error: 'Apenas o Master pode gerir utilizadores' }, 403);
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: 'Dados inválidos' }, 400);
    }
    const body = parsed.data;

    if (body.action === 'create') {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: { name: body.name },
      });
      if (createError) return json({ error: createError.message }, 400);

      if (body.role && created.user) {
        // Atribuir função inicial (service role é permitido no trigger de proteção)
        const { error: roleError } = await admin
          .from('profiles')
          .update({ role: body.role })
          .eq('user_id', created.user.id);
        if (roleError) return json({ error: roleError.message }, 400);
      }

      return json({ ok: true, user_id: created.user?.id });
    }

    // delete
    if (body.user_id === userData.user.id) {
      return json({ error: 'Não pode eliminar a sua própria conta de Master' }, 400);
    }
    const { error: delError } = await admin.auth.admin.deleteUser(body.user_id);
    if (delError) return json({ error: delError.message }, 400);
    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ error: 'Erro interno' }, 500);
  }
});
