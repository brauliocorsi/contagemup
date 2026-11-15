import { defineTool } from '@lovable.dev/mcp-js';
import { editProductSchema } from '../edit-schema';
import { supabaseForUser } from '../supabase';
import { z } from 'zod';

export default defineTool({
  name: 'edit_product_metadata',
  title: 'Editar nome e descrição do produto',
  description: 'Edita apenas nome e descrição, com histórico e permissões da conta. Consulte primeiro updated_at e peça confirmação ao utilizador; nunca altera stock, volumes ou códigos.',
  inputSchema: {
    code: z.string().trim().min(1).describe('Código exato do produto.'),
    expected_updated_at: z.string().describe('updated_at obtido na consulta mais recente.'),
    name: z.string().optional().describe('Novo nome, se pretendido.'),
    description: z.string().optional().describe('Nova descrição; texto vazio limpa a descrição.'),
    confirm: z.boolean().describe('true apenas após confirmação explícita do utilizador.'),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (args, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: 'text', text: 'Não autenticado' }], isError: true };
    const parsed = editProductSchema.safeParse(args);
    if (!parsed.success) return { content: [{ type: 'text', text: parsed.error.issues.map(i => i.message).join('; ') }], isError: true };
    const input = parsed.data;
    const { data, error } = await supabaseForUser(ctx).rpc('mcp_edit_product_metadata', {
      p_code: input.code, p_expected_updated_at: input.expected_updated_at,
      p_name: input.name, p_description: input.description, p_confirm: input.confirm,
    });
    if (error) return { content: [{ type: 'text', text: error.message }], isError: true };
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  },
});