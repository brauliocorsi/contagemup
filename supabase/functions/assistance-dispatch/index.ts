// Envia as assistências abertas na entrega para o projeto Apoio Ao Cliente.
// Fila durável: falhas ficam em "erro" e podem ser reenviadas sem duplicar ticket
// (o receptor deduplica pelo incident_id). A chave partilhada nunca sai do servidor.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPPORT_PROJECT_ID = 'c1eae1d7-d198-4ab3-b73c-8639cd344267';
const BUCKET = 'assistencias';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const authClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await authClient.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const endpoint = Deno.env.get('APOIO_ASSISTANCE_URL');
  const secret = Deno.env.get('WMS_ASSISTANCE_SHARED_SECRET');

  const body = await req.json().catch(() => ({}));
  const ids: string[] | null = Array.isArray(body.incident_ids) ? body.incident_ids : null;

  let q = admin
    .from('delivery_incidents')
    .select('*')
    .in('dispatch_status', ['pending', 'error'])
    .order('created_at', { ascending: true })
    .limit(25);
  if (ids) q = admin.from('delivery_incidents').select('*').in('id', ids);
  const { data: incidents, error } = await q;
  if (error) return json({ error: error.message }, 500);

  if (!endpoint || !secret) {
    // Integração pronta mas sem configuração: a fila fica intacta.
    return json({
      blocked: true,
      reason:
        'Falta a configuração do Apoio ao Cliente (endereço do receptor e chave partilhada). As assistências ficam em fila.',
      pending: incidents?.length ?? 0,
    });
  }

  const results: { id: string; status: string; ticket_number?: string; error?: string }[] = [];

  for (const inc of incidents ?? []) {
    const attachments: { name: string; mime_type: string; storage_reference: string; url?: string }[] =
      [];
    for (const a of (inc.attachments ?? []) as {
      name: string;
      mime_type: string;
      storage_reference: string;
    }[]) {
      const { data: signed } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(a.storage_reference, 3600);
      attachments.push({ ...a, url: signed?.signedUrl });
    }

    const payload = {
      schema_version: 1,
      source_project_id: SUPPORT_PROJECT_ID,
      incident_id: inc.id,
      order_number: inc.order_number,
      route_id: inc.route_id,
      attempt_id: inc.attempt_id,
      note_id: inc.note_id,
      occurred_at: inc.occurred_at,
      driver_id: inc.driver_id,
      client: { name: inc.client_name ?? '' },
      subject: inc.subject,
      description: inc.description,
      delivery_outcome: inc.delivery_outcome,
      product_lines: inc.product_lines ?? [],
      attachments,
    };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`Apoio respondeu ${res.status}: ${text.slice(0, 200)}`);
      const parsed = JSON.parse(text || '{}');
      await admin
        .from('delivery_incidents')
        .update({
          dispatch_status: 'sent',
          ticket_id: parsed.ticket_id ?? null,
          ticket_number: parsed.ticket_number ?? null,
          deduplicated: parsed.deduplicated ?? false,
          dispatch_attempts: (inc.dispatch_attempts ?? 0) + 1,
          last_attempt_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', inc.id);
      results.push({ id: inc.id, status: 'sent', ticket_number: parsed.ticket_number });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Falha ao contactar o Apoio ao Cliente';
      await admin
        .from('delivery_incidents')
        .update({
          dispatch_status: 'error',
          dispatch_attempts: (inc.dispatch_attempts ?? 0) + 1,
          last_attempt_at: new Date().toISOString(),
          last_error: message,
        })
        .eq('id', inc.id);
      results.push({ id: inc.id, status: 'error', error: message });
    }
  }

  return json({ processed: results.length, results });
});
