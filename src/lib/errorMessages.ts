import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Maps database errors to safe, user-friendly messages.
 * Technical details (constraint names, error codes, SQL text) are logged
 * to the console for debugging but never shown to end users.
 */
export function mapDatabaseError(error: unknown, fallback = 'Erro ao processar operação'): string {
  if (!error) return fallback;

  // Log full details server/console-side only
  // eslint-disable-next-line no-console
  console.error('Database error:', error);

  const pgError = error as Partial<PostgrestError> & { message?: string };
  const code = pgError?.code;

  switch (code) {
    case '23505':
      return 'Este registo já existe';
    case '23503':
      return 'Não é possível concluir: registo está em uso noutro local';
    case '23502':
      return 'Campos obrigatórios em falta';
    case '23514':
      return 'Valor não permitido para este campo';
    case '42501':
      return 'Sem permissão para esta operação';
    case '42P01':
      return 'Recurso não encontrado';
    case 'PGRST116':
      return 'Registo não encontrado';
    default:
      return fallback;
  }
}
