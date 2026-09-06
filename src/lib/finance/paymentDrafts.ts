/**
 * Rascunhos locais de recebimento.
 *
 * Um rascunho fica preso ao par (utilizador, tentativa) e guarda também a rota,
 * para que:
 *  - dois operadores no mesmo aparelho nunca vejam o rascunho um do outro;
 *  - a prestação de contas consiga detectar recebimentos ainda por enviar;
 *  - a saída de sessão limpe tudo o que ficou por sincronizar.
 *
 * A chave de operação enviada ao servidor deriva do conteúdo: reenviar o mesmo
 * pedido é idempotente, alterar valores gera obrigatoriamente uma operação nova.
 */

const PREFIX = 'payment_draft:v2:';
const LEGACY_PREFIX = 'payment_draft:';

export interface DraftLine {
  key: string;
  method_id: string;
  amount: string;
  gross: string;
  reference: string;
}

export interface PaymentDraft {
  userId: string;
  attemptId: string;
  routeId: string | null;
  orderNumber: string | null;
  lines: DraftLine[];
  reason: string;
  savedAt: string;
}

const draftKey = (userId: string, attemptId: string) => `${PREFIX}${userId}:${attemptId}`;

function safeParse(raw: string | null): PaymentDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PaymentDraft;
    return parsed && Array.isArray(parsed.lines) ? parsed : null;
  } catch {
    return null;
  }
}

export function readDraft(userId: string, attemptId: string): PaymentDraft | null {
  return safeParse(localStorage.getItem(draftKey(userId, attemptId)));
}

export function saveDraft(draft: PaymentDraft) {
  localStorage.setItem(
    draftKey(draft.userId, draft.attemptId),
    JSON.stringify({ ...draft, savedAt: new Date().toISOString() }),
  );
}

export function clearDraft(userId: string, attemptId: string) {
  localStorage.removeItem(draftKey(userId, attemptId));
}

function allKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k.startsWith(PREFIX) || k.startsWith(LEGACY_PREFIX))) keys.push(k);
  }
  return keys;
}

/** Rascunhos do utilizador actual (opcionalmente só os de uma rota). */
export function listDrafts(userId: string, routeId?: string): PaymentDraft[] {
  const out: PaymentDraft[] = [];
  for (const k of allKeys()) {
    if (!k.startsWith(`${PREFIX}${userId}:`)) continue;
    const d = safeParse(localStorage.getItem(k));
    if (!d) continue;
    if (routeId && d.routeId !== routeId) continue;
    if (d.lines.length === 0) continue;
    out.push(d);
  }
  return out;
}

/** Apaga rascunhos de outros utilizadores e o formato antigo (sem dono). */
export function purgeForeignDrafts(userId: string | null | undefined) {
  for (const k of allKeys()) {
    const mine = userId ? k.startsWith(`${PREFIX}${userId}:`) : false;
    if (!mine) localStorage.removeItem(k);
  }
}

/** Limpeza total: saída de sessão ou revogação de acesso. */
export function clearAllDrafts() {
  for (const k of allKeys()) localStorage.removeItem(k);
}

/**
 * Chave de operação ligada ao actor, à tentativa, ao tipo e ao conteúdo.
 * O servidor recusa a mesma chave com conteúdo diferente.
 */
export async function buildOperationKey(
  userId: string,
  attemptId: string,
  payload: unknown,
): Promise<string> {
  const body = JSON.stringify({ kind: 'declare_payments', userId, attemptId, payload });
  const bytes = new TextEncoder().encode(body);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `pay:${attemptId}:${hex.slice(0, 40)}`;
}
