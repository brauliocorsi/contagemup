// MÓDULO EXPERIMENTAL REMOVÍVEL — estado local de teste (localStorage), por utilizador.
// Nada é gravado na base de dados. Não guardar dados sensíveis aqui.
import type { EngineOutput } from './types';

export const LAB_STORAGE_PREFIX = 'needs-lab:v1:';

export interface ManualDemandAdjust {
  pendente: number | null;
  nota?: string;
}
export interface ManualSupplyAdjust {
  porReceber: number | null;
  nota?: string;
}

export interface LabState {
  vendaSituacaoIds: string[];
  compraSituacaoIds: string[];
  /** Situações de venda cujo pendente NÃO é dedutível (entregas parciais) — exigem confirmação manual. */
  situacoesParciaisIds: string[];
  manualDemands: Record<string, ManualDemandAdjust>;
  manualSupplies: Record<string, ManualSupplyAdjust>;
  /** Correspondência manual de linha -> grupo (quando o ERP não dá identidade fiável). */
  manualGroupMatch: Record<string, string>;
  /** "O que eu compraria manualmente" por grupo + notas locais. */
  manualBuy: Record<string, { quantidade: number | null; nota?: string }>;
  snapshot: EngineOutput | null;
  snapshotAt: string | null;
}

export const emptyLabState: LabState = {
  vendaSituacaoIds: [],
  compraSituacaoIds: [],
  situacoesParciaisIds: [],
  manualDemands: {},
  manualSupplies: {},
  manualGroupMatch: {},
  manualBuy: {},
  snapshot: null,
  snapshotAt: null,
};

export function labStorageKey(userId: string | null | undefined): string {
  return `${LAB_STORAGE_PREFIX}${userId ?? 'anon'}`;
}

export function loadLabState(userId: string | null | undefined): LabState {
  try {
    const raw = localStorage.getItem(labStorageKey(userId));
    if (!raw) return { ...emptyLabState };
    return { ...emptyLabState, ...(JSON.parse(raw) as Partial<LabState>) };
  } catch {
    return { ...emptyLabState };
  }
}

export function saveLabState(userId: string | null | undefined, state: LabState): void {
  try {
    localStorage.setItem(labStorageKey(userId), JSON.stringify(state));
  } catch {
    /* quota — a simulação continua em memória */
  }
}

/** Limpa APENAS a simulação deste utilizador. Não toca em dados de negócio. */
export function clearLabState(userId: string | null | undefined): void {
  try {
    localStorage.removeItem(labStorageKey(userId));
  } catch {
    /* ignore */
  }
}

export function toCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.join(';'), ...rows.map((r) => headers.map((h) => esc(r[h])).join(';'))].join('\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
