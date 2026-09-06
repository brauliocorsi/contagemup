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

/** Apaga todos os rascunhos deste utilizador (usado ao sair da aplicação). */
export function clearAllDrafts(userId: string) {
  try {
    const prefix = `delivery_draft:${userId}:`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignorar */
  }
}

/**
 * Apaga os rascunhos de entregas a que o utilizador já não tem acesso
 * (rota reatribuída a outro entregador). Devolve os rascunhos descartados
 * que tinham trabalho por enviar, para poderem ser mostrados como conflito.
 */
export function pruneRevokedDrafts(userId: string, allowedAttemptIds: string[]): DeliveryDraft[] {
  const allowed = new Set(allowedAttemptIds);
  const dropped: DeliveryDraft[] = [];
  try {
    const prefix = `delivery_draft:${userId}:`;
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(prefix)) continue;
      const attemptId = k.slice(prefix.length);
      if (allowed.has(attemptId)) continue;
      stale.push(k);
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const d = JSON.parse(raw) as DeliveryDraft;
        const hasWork =
          d.pendingSend ||
          Object.values(d.quantities ?? {}).some((q) => q > 0) ||
          Boolean(d.failureReason);
        if (hasWork) dropped.push(d);
      } catch {
        /* rascunho ilegível */
      }
    }
    stale.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignorar */
  }
  return dropped;
}
