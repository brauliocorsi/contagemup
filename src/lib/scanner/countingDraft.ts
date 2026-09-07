/**
 * Rascunho de contagem recuperável, separado por utilizador e conferência.
 *
 * Guarda-se em `localStorage` para sobreviver a atualização de página, troca de
 * conferência ou fecho acidental da app. Cada linha tem estado próprio para se
 * poder mostrar o que está por guardar, guardado ou com erro.
 */

export type DraftEntryStatus = 'por_guardar' | 'guardado' | 'erro';

export interface DraftEntry {
  value: number;
  status: DraftEntryStatus;
  /** Chave estável da operação, reutilizada em reenvios após falha de rede. */
  opKey: string;
  error?: string;
  updatedAt: number;
}

export interface CountingDraft {
  auditId: string;
  userId: string;
  entries: Record<string, DraftEntry>;
  /** Leituras de artigos não previstos, para revisão do responsável. */
  exceptions: Array<{ code: string; colis: number | null; location: string; quantity: number }>;
  updatedAt: number;
}

const PREFIX = 'contagem-rascunho';

export function draftKey(userId: string, auditId: string) {
  return `${PREFIX}:${userId}:${auditId}`;
}

export function emptyDraft(userId: string, auditId: string): CountingDraft {
  return { auditId, userId, entries: {}, exceptions: [], updatedAt: Date.now() };
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function store(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadDraft(userId: string, auditId: string, storage?: StorageLike): CountingDraft {
  const s = store(storage);
  if (!s) return emptyDraft(userId, auditId);
  try {
    const raw = s.getItem(draftKey(userId, auditId));
    if (!raw) return emptyDraft(userId, auditId);
    const parsed = JSON.parse(raw) as CountingDraft;
    if (!parsed || parsed.auditId !== auditId || parsed.userId !== userId) {
      return emptyDraft(userId, auditId);
    }
    return { ...emptyDraft(userId, auditId), ...parsed, entries: parsed.entries ?? {} };
  } catch {
    return emptyDraft(userId, auditId);
  }
}

export function saveDraft(draft: CountingDraft, storage?: StorageLike) {
  const s = store(storage);
  if (!s) return;
  try {
    s.setItem(draftKey(draft.userId, draft.auditId), JSON.stringify({ ...draft, updatedAt: Date.now() }));
  } catch {
    /* armazenamento cheio ou indisponível — o rascunho continua em memória */
  }
}

export function clearDraft(userId: string, auditId: string, storage?: StorageLike) {
  const s = store(storage);
  if (!s) return;
  try {
    s.removeItem(draftKey(userId, auditId));
  } catch {
    /* ignorado */
  }
}

/**
 * Remove os rascunhos de contagem que não pertencem a este utilizador.
 * Chamado na troca de conta para que ninguém veja nem reenvie o trabalho do anterior.
 */
export function purgeForeignCountingDrafts(userId: string | null | undefined) {
  if (typeof window === 'undefined') return;
  try {
    const remove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(`${PREFIX}:`)) continue;
      if (!userId || !key.startsWith(`${PREFIX}:${userId}:`)) remove.push(key);
    }
    remove.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* ignorado */
  }
}

/** Cria uma chave de operação estável (reenvio conta uma vez). */
export function newOpKey(auditId: string, itemId: string) {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `conf:${auditId}:${itemId}:${rnd}`;
}

export function setEntry(
  draft: CountingDraft,
  itemId: string,
  value: number,
  auditId: string,
): CountingDraft {
  const prev = draft.entries[itemId];
  return {
    ...draft,
    entries: {
      ...draft.entries,
      [itemId]: {
        value: Math.max(0, value),
        status: 'por_guardar',
        // Mudar o valor é uma operação nova: chave nova.
        opKey: newOpKey(auditId, itemId),
        updatedAt: Date.now(),
      },
    },
    updatedAt: Date.now(),
  };
}

export function markEntry(
  draft: CountingDraft,
  itemId: string,
  status: DraftEntryStatus,
  error?: string,
): CountingDraft {
  const prev = draft.entries[itemId];
  if (!prev) return draft;
  return {
    ...draft,
    entries: { ...draft.entries, [itemId]: { ...prev, status, error, updatedAt: Date.now() } },
    updatedAt: Date.now(),
  };
}

export function dropEntry(draft: CountingDraft, itemId: string): CountingDraft {
  const entries = { ...draft.entries };
  delete entries[itemId];
  return { ...draft, entries, updatedAt: Date.now() };
}

export function pendingCount(draft: CountingDraft) {
  return Object.values(draft.entries).filter((e) => e.status !== 'guardado').length;
}

export function draftSummary(draft: CountingDraft) {
  const values = Object.values(draft.entries);
  return {
    porGuardar: values.filter((e) => e.status === 'por_guardar').length,
    guardadas: values.filter((e) => e.status === 'guardado').length,
    comErro: values.filter((e) => e.status === 'erro').length,
  };
}
