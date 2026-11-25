import { batchSchema, validToken } from './contract.ts';

type Dependencies = {
  expectedToken: () => string | undefined;
  processBatch: (payload: unknown) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
};

export function createHandler(cors: Record<string, string>, dependencies: Dependencies) {
  const headers = {
    ...cors,
    'Access-Control-Allow-Headers': `${cors['Access-Control-Allow-Headers'] || 'content-type'}, x-up-token`,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
  const respond = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers });

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return respond(405, { error: 'Método não permitido. Use POST.' });
    if (!await validToken(req.headers.get('x-up-token'), dependencies.expectedToken())) {
      return respond(401, { error: 'Unauthorized' });
    }
    let payload: unknown;
    try { payload = await req.json(); }
    catch { return respond(400, { error: 'JSON inválido.' }); }
    const parsed = batchSchema.safeParse(payload);
    if (!parsed.success) return respond(400, { error: 'Lote inválido.', details: parsed.error.flatten() });
    try {
      const { data, error } = await dependencies.processBatch(parsed.data);
      if (error) {
        if (error.code === '22023') return respond(400, { error: error.message });
        return respond(500, { error: 'Não foi possível receber o lote. Nenhuma entrada foi gravada.' });
      }
      return respond(200, data);
    } catch {
      return respond(503, { error: 'Receção temporariamente indisponível. Reenvie com o mesmo batch_id.' });
    }
  };
}