/**
 * Rascunho local da entrega, isolado por utilizador e por tentativa.
 * Serve para o entregador não perder o trabalho quando a rede falha:
 * o que está aqui é "por enviar" — só é definitivo depois de gravado no servidor.
 */

export interface DeliveryDraft {
  /** quantidade entregue por linha (id da linha da tentativa) */
  quantities: Record<string, number>;
  /** motivo específico por linha */
  reasons: Record<string, string>;
  failureReason: string | null;
  failureNotes: string;
  /** chave de idempotência: reenviar com a mesma chave nunca duplica a entrega */
  opKey: string;
  savedAt: string;
  /** true quando houve tentativa de envio sem confirmação do servidor */
  pendingSend: boolean;
}

function key(userId: string, attemptId: string) {
  return `delivery_draft:${userId}:${attemptId}`;
}

export function newDraft(): DeliveryDraft {
  return {
    quantities: {},
    reasons: {},
    failureReason: null,
    failureNotes: '',
    opKey: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    pendingSend: false,
  };
}

export function loadDraft(userId: string, attemptId: string): DeliveryDraft | null {
  try {
    const raw = localStorage.getItem(key(userId, attemptId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeliveryDraft;
    if (!parsed.opKey) parsed.opKey = crypto.randomUUID();
    parsed.quantities ??= {};
    parsed.reasons ??= {};
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(userId: string, attemptId: string, draft: DeliveryDraft) {
  try {
    localStorage.setItem(
      key(userId, attemptId),
      JSON.stringify({ ...draft, savedAt: new Date().toISOString() }),
    );
  } catch {
    /* armazenamento cheio ou indisponível: o ecrã continua a funcionar */
  }
}

export function clearDraft(userId: string, attemptId: string) {
  try {
    localStorage.removeItem(key(userId, attemptId));
  } catch {
    /* ignorar */
  }
}

/** Interpreta a etiqueta lida: "COD-C2" devolve o código e o coli 2. */
export function parseLabel(raw: string): { code: string; coli: number | null } {
  const clean = raw.trim().toUpperCase().replace(/\s+/g, '');
  const m = clean.match(/^(.*?)[-_]C(\d{1,2})$/);
  if (m) return { code: m[1], coli: Number(m[2]) };
  return { code: clean, coli: null };
}
