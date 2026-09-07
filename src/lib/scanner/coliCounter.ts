/**
 * Contagem volume a volume (coli a coli) usada no picking e no carregamento.
 *
 * Regras que este módulo garante:
 *  - cada leitura identifica o produto E o volume; nunca se assume o volume 1
 *    quando o produto tem vários volumes e a etiqueta não traz o sufixo -Cn;
 *  - havendo várias encomendas/linhas candidatas, o operador escolhe: nunca se
 *    aplica a leitura à primeira linha da lista;
 *  - o número de conjuntos completos é o mínimo entre os volumes, por isso ler
 *    duas vezes o mesmo volume nunca dá um conjunto completo.
 */

export interface ColiSlot {
  colis_number: number;
  /** Previsto para este volume. */
  requested: number;
  /** Já confirmado e gravado no servidor. */
  done: number;
  /** Conferido neste dispositivo e ainda por gravar. */
  scanned: number;
  /** Origem (picking) ou destino (carga) escolhido para este volume. */
  location?: string | null;
  /** Origem da prova: leitura, agregado antigo do escritório, etc. */
  evidence?: string | null;
}

export interface ColiLine {
  key: string;
  /** Códigos que identificam este artigo (código, código de fornecedor, nome). */
  aliases: string[];
  /** Encomenda a que a linha pertence (obrigatória no picking). */
  orderNumber?: string | null;
  label: string;
  slots: ColiSlot[];
}

const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();

/** Falta ler neste volume. */
export const slotPending = (s: ColiSlot) => Math.max(s.requested - s.done - s.scanned, 0);

/** Conjuntos completos considerando o que já está gravado e o que falta gravar. */
export function completeSets(line: ColiLine): number {
  if (line.slots.length === 0) return 0;
  return Math.min(...line.slots.map((s) => s.done + s.scanned));
}

/** Conjuntos completos apenas com o que o servidor já confirmou. */
export function confirmedSets(line: ColiLine): number {
  if (line.slots.length === 0) return 0;
  return Math.min(...line.slots.map((s) => s.done));
}

export const linePending = (line: ColiLine) => line.slots.reduce((t, s) => t + slotPending(s), 0);

export type ScanOutcome =
  | { status: 'ok'; lineKey: string; colis: number }
  | { status: 'escolher_linha'; candidates: ColiLine[]; colis?: number }
  | { status: 'escolher_coli'; lineKey: string; options: number[] }
  | { status: 'completo'; lineKey: string; colis?: number }
  | { status: 'desconhecido' };

/**
 * Decide o efeito de uma leitura. Não altera nada: devolve a decisão para o
 * ecrã aplicar (ou pedir a escolha em falta ao operador).
 */
export function evaluateColiScan(lines: ColiLine[], code: string, colis?: number): ScanOutcome {
  const c = norm(code);
  const matches = lines.filter((l) => l.aliases.some((a) => norm(a) === c));
  if (matches.length === 0) return { status: 'desconhecido' };

  const withPending = matches.filter((l) =>
    colis ? slotPending(l.slots.find((s) => s.colis_number === colis) ?? { requested: 0, done: 0, scanned: 0, colis_number: colis }) > 0 : linePending(l) > 0,
  );
  if (withPending.length === 0) {
    return { status: 'completo', lineKey: matches[0].key, colis };
  }
  if (withPending.length > 1) return { status: 'escolher_linha', candidates: withPending, colis };

  const line = withPending[0];
  if (colis != null) {
    const slot = line.slots.find((s) => s.colis_number === colis);
    if (!slot) return { status: 'desconhecido' };
    return slotPending(slot) > 0
      ? { status: 'ok', lineKey: line.key, colis }
      : { status: 'completo', lineKey: line.key, colis };
  }

  if (line.slots.length === 1) {
    return slotPending(line.slots[0]) > 0
      ? { status: 'ok', lineKey: line.key, colis: line.slots[0].colis_number }
      : { status: 'completo', lineKey: line.key, colis: line.slots[0].colis_number };
  }

  // Multivolume sem sufixo: o operador tem de escolher o volume.
  return {
    status: 'escolher_coli',
    lineKey: line.key,
    options: line.slots.filter((s) => slotPending(s) > 0).map((s) => s.colis_number),
  };
}

/** Aplica uma unidade conferida a um volume, respeitando o limite previsto. */
export function addColiScan(lines: ColiLine[], lineKey: string, colis: number, qty = 1): ColiLine[] {
  return lines.map((l) => {
    if (l.key !== lineKey) return l;
    return {
      ...l,
      slots: l.slots.map((s) => {
        if (s.colis_number !== colis) return s;
        const room = slotPending(s);
        return { ...s, scanned: s.scanned + Math.max(0, Math.min(qty, room)) };
      }),
    };
  });
}

/** Corrige manualmente o valor conferido de um volume. */
export function setColiScan(lines: ColiLine[], lineKey: string, colis: number, value: number): ColiLine[] {
  return lines.map((l) => {
    if (l.key !== lineKey) return l;
    return {
      ...l,
      slots: l.slots.map((s) => {
        if (s.colis_number !== colis) return s;
        const max = Math.max(s.requested - s.done, 0);
        return { ...s, scanned: Math.max(0, Math.min(value, max)) };
      }),
    };
  });
}

/** Separa o sufixo de volume de uma etiqueta (CODIGO-C2). */
export function splitColisSuffix(value: string): { base: string; colis?: number } {
  const m = (value || '').trim().match(/^(.+)-C(\d+)$/i);
  if (!m) return { base: (value || '').trim() };
  return { base: m[1], colis: Number(m[2]) };
}
