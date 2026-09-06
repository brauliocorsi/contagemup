// Leitura de anexos de assistência pelo projeto Apoio Ao Cliente.
//
// Canal server-to-server: só aceita o segredo partilhado WMS_ASSISTANCE_SHARED_SECRET.
// Nunca aceita tokens de utilizador (entregador/responsável) como chave de integração
// e nunca serve caminhos arbitrários: o ficheiro tem de constar dos anexos da própria
// ocorrência indicada. O armazenamento continua privado.
//
// Contrato:
//   POST { schema_version: 1, incident_id: uuid, storage_reference: string }
//   200  -> bytes do anexo (Content-Type do ficheiro)
//   400/401/404/413 -> { error }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const BUCKET = 'assistencias';
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** comparação em tempo constante para não permitir descoberta do segredo */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secret = Deno.env.get('WMS_ASSISTANCE_SHARED_SECRET');
  if (!secret) return json({ error: 'Integration not configured' }, 503);

  const auth = req.headers.get('Authorization') ?? '';
  const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  // um JWT tem três segmentos: tokens de utilizador não servem como chave de integração
  if (!presented || presented.split('.').length === 3 || !safeEqual(presented, secret)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const body = await req.json().catch(() => null);
  if (
    !body ||
    body.schema_version !== 1 ||
    typeof body.incident_id !== 'string' ||
    !UUID.test(body.incident_id) ||
    typeof body.storage_reference !== 'string' ||
    body.storage_reference.length > 512 ||
    body.storage_reference.includes('..')
  ) {
    return json({ error: 'Invalid request body' }, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: incident, error } = await admin
    .from('delivery_incidents')
    .select('id, attachments')
    .eq('id', body.incident_id)
    .maybeSingle();
  if (error) return json({ error: 'Lookup failed' }, 500);
  if (!incident) return json({ error: 'Incident not found' }, 404);

  const list = (incident.attachments ?? []) as {
    name?: string;
    mime_type?: string;
    storage_reference?: string;
  }[];
  const match = list.find((a) => a.storage_reference === body.storage_reference);
  if (!match) return json({ error: 'Attachment does not belong to this incident' }, 404);

  const { data: file, error: dlError } = await admin.storage
    .from(BUCKET)
    .download(body.storage_reference);
  if (dlError || !file) return json({ error: 'Attachment unavailable' }, 404);
  if (file.size > MAX_BYTES) return json({ error: 'Attachment too large' }, 413);

  const mime = match.mime_type && ALLOWED_MIME.test(match.mime_type)
    ? match.mime_type
    : 'application/octet-stream';

  return new Response(await file.arrayBuffer(), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': mime,
      'Content-Length': String(file.size),
      'Content-Disposition': `attachment; filename="${(match.name ?? 'anexo').replace(/[^\w.\-]/g, '_')}"`,
      'Cache-Control': 'no-store',
    },
  });
});
