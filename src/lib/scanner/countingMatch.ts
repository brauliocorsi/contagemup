/**
 * Resolução de uma leitura de contagem contra as linhas de uma localização.
 *
 * Regras:
 * - o código lido pode ou não trazer o coli (`CODIGO-C2`);
 * - só se aceita automaticamente uma correspondência inequívoca;
 * - se o código servir vários colis e a etiqueta não disser qual, pede-se
 *   identificação explícita em vez de escolher o primeiro candidato;
 * - um artigo que não pertence à localização é sinalizado como exceção,
 *   nunca inventa stock.
 */

export interface CountingCandidate {
  id: string;
  product_code: string;
  product_name: string;
  colis_number: number | null;
}

export type CountingMatchStatus =
  | 'ok'
  | 'ambiguo'
  | 'coli_inexistente'
  | 'fora_da_localizacao';

export interface CountingMatchResult<T extends CountingCandidate> {
  status: CountingMatchStatus;
  item?: T;
  /** Candidatos quando é preciso escolher o coli. */
  candidates: T[];
  /** Código base, já sem o sufixo de coli. */
  baseCode: string;
  /** Coli lido na etiqueta, quando existe. */
  colis: number | null;
  message: string;
}

const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();

/** Separa `CODIGO-C2` em código base e número de coli. */
export function splitColisCode(raw: string): { base: string; colis: number | null } {
  const value = (raw || '').trim();
  const m = value.match(/^(.+)-C(\d+)$/i);
  if (!m) return { base: value, colis: null };
  return { base: m[1], colis: Number(m[2]) };
}

export function resolveCountingScan<T extends CountingCandidate>(
  items: T[],
  rawCode: string,
  parsedColis?: number | null,
  locationLabel = 'esta localização',
): CountingMatchResult<T> {
  const split = splitColisCode(rawCode);
  const colis = parsedColis ?? split.colis;
  const baseCode = norm(split.base);
  const fullCode = norm(rawCode);

  const candidates = items.filter(
    (i) =>
      norm(i.product_code) === baseCode ||
      norm(i.product_code) === fullCode ||
      norm(i.product_name) === baseCode,
  );

  if (candidates.length === 0) {
    return {
      status: 'fora_da_localizacao',
      candidates: [],
      baseCode: split.base,
      colis,
      message: `"${split.base}" não está previsto em ${locationLabel}`,
    };
  }

  if (colis != null) {
    const exact = candidates.filter((i) => i.colis_number === colis);
    if (exact.length === 1) {
      return { status: 'ok', item: exact[0], candidates: exact, baseCode: split.base, colis, message: '' };
    }
    if (exact.length === 0) {
      return {
        status: 'coli_inexistente',
        candidates,
        baseCode: split.base,
        colis,
        message: `Coli ${colis} de ${split.base.toUpperCase()} não está em ${locationLabel}`,
      };
    }
    // Várias caixas legítimas com a mesma etiqueta na mesma localização.
    return {
      status: 'ambiguo',
      candidates: exact,
      baseCode: split.base,
      colis,
      message: `${exact.length} linhas do coli ${colis} em ${locationLabel} — escolha qual contar`,
    };
  }

  if (candidates.length === 1) {
    return { status: 'ok', item: candidates[0], candidates, baseCode: split.base, colis, message: '' };
  }

  return {
    status: 'ambiguo',
    candidates,
    baseCode: split.base,
    colis,
    message: `${split.base.toUpperCase()} tem ${candidates.length} colis em ${locationLabel} — leia a etiqueta do coli ou escolha na lista`,
  };
}
