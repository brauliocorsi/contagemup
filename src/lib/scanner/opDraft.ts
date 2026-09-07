/**
 * Rascunho persistente das conferências do scanner.
 *
 * Cada rascunho pertence a um utilizador e a um contexto (tarefa de separação,
 * nota + viatura). Guarda também a chave de operação: se a resposta do servidor
 * se perder, o reenvio usa a MESMA chave e o servidor devolve o resultado
 * anterior em vez de movimentar stock outra vez.
 */

const PREFIX = 'scanner:opdraft';

export type DraftStatus = 'por_guardar' | 'a_enviar' | 'gravado' | 'erro';

export interface OpDraft<T> {
  opKey: string;
  userId: string;
  context: string;
  status: DraftStatus;
  error?: string | null;
  updatedAt: number;
  data: T;
}

const keyFor = (userId: string, context: string) => `${PREFIX}:${userId}:${context}`;

export function newOpKey(kind: string) {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${kind}:${rnd}`;
}

export function loadOpDraft<T>(userId: string | null | undefined, context: string): OpDraft<T> | null {
  if (!userId || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(keyFor(userId, context));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OpDraft<T>;
    return parsed.userId === userId ? parsed : null;
  } catch {
    return null;
  }
}

export function saveOpDraft<T>(draft: OpDraft<T>) {
  if (!draft.userId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(keyFor(draft.userId, draft.context), JSON.stringify({ ...draft, updatedAt: Date.now() }));
  } catch {
    /* armazenamento cheio: o ecrã continua a funcionar em memória */
  }
}

export function clearOpDraft(userId: string | null | undefined, context: string) {
  if (!userId || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(keyFor(userId, context));
  } catch {
    /* ignora */
  }
}

/** Apaga rascunhos de outras contas (troca de operador no mesmo aparelho). */
export function purgeForeignOpDrafts(userId: string | null | undefined) {
  if (typeof localStorage === 'undefined') return;
  const mine = userId ? `${PREFIX}:${userId}:` : null;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(`${PREFIX}:`)) continue;
    if (!mine || !k.startsWith(mine)) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}
