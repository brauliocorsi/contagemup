import { describe, it, expect } from 'vitest';
import { computeNeeds, diffSnapshots, makeGroupKey, makeLineKey } from './engine';
import { guidedSteps } from './fixtures';
import type { DemandLine, PhysicalCoverage, SupplyLine } from './types';

const G = 'p:1|v:-';

function d(key: string, data: string, pendente: number | null, group = G): DemandLine {
  return {
    key, vendaId: key, vendaCodigo: key, data, situacaoId: 's1', situacaoNome: 'Aberta', cliente: 'X',
    groupKey: group, produtoId: '1', variacaoId: '', codigo: 'A', nome: 'A', detalhes: '',
    quantidade: pendente ?? 0, pendente, origin: 'fixture', review: [],
  };
}
function s(key: string, data: string, porReceber: number | null, group = G): SupplyLine {
  return {
    key, compraId: key, compraCodigo: key, data, situacaoId: 'c1', situacaoNome: 'Aberta', fornecedor: 'F',
    groupKey: group, produtoId: '1', variacaoId: '', codigo: 'A', nome: 'A', detalhes: '',
    quantidade: porReceber ?? 0, porReceber, origin: 'fixture', review: [],
  };
}
function p(livre: number, aRever = 0, group = G): PhysicalCoverage {
  return { groupKey: group, codigo: 'A', nome: 'A', livre, aRever, review: [] };
}

describe('computeNeeds', () => {
  it('cobre FIFO por data e cada unidade só cobre uma venda', () => {
    const out = computeNeeds({ demands: [d('v2', '2026-01-05', 1), d('v1', '2026-01-02', 1)], supplies: [], physical: [p(1)] });
    const g = out.groups[0];
    expect(g.faltaComprar).toBe(1);
    expect(g.demandas[0].line.key).toBe('v1');
    expect(g.demandas[0].falta).toBe(0);
    expect(g.demandas[1].falta).toBe(1);
  });

  it('não conta físico e compra em duplicado', () => {
    const out = computeNeeds({ demands: [d('v1', '2026-01-02', 2)], supplies: [s('c1', '2026-01-01', 1)], physical: [p(1)] });
    expect(out.groups[0].faltaComprar).toBe(0);
    expect(out.groups[0].coberturaFisicaUsada).toBe(1);
    expect(out.groups[0].comprasUsadas).toBe(1);
  });

  it('ignora stock negativo/quarentena (nunca cobertura) e assinala revisão', () => {
    const out = computeNeeds({ demands: [d('v1', '2026-01-02', 1)], supplies: [], physical: [p(0, 5)] });
    expect(out.groups[0].faltaComprar).toBe(1);
    expect(out.groups[0].review.join(' ')).toContain('não livres');
  });

  it('pendente desconhecido marca incompleto e não inventa zero', () => {
    const out = computeNeeds({ demands: [d('v1', '2026-01-02', null)], supplies: [], physical: [p(0)] });
    expect(out.groups[0].incompleto).toBe(true);
    expect(out.groups[0].review.join(' ')).toContain('por confirmar');
  });

  it('compra sem quantidade por receber conhecida não conta como cobertura', () => {
    const out = computeNeeds({ demands: [d('v1', '2026-01-02', 1)], supplies: [s('c1', '2026-01-01', null)], physical: [p(0)] });
    expect(out.groups[0].faltaComprar).toBe(1);
    expect(out.groups[0].comprasPorReceber).toBe(0);
  });

  it('separa configurações diferentes em grupos distintos', () => {
    const out = computeNeeds({
      demands: [d('v1', '2026-01-02', 1, 'p:1|v:10'), d('v2', '2026-01-02', 1, 'p:1|v:20')],
      supplies: [s('c1', '2026-01-01', 1, 'p:1|v:10')],
      physical: [],
    });
    expect(out.groups).toHaveLength(2);
    expect(out.totals.faltaComprar).toBe(1);
  });

  it('é determinístico e não acumula ao reexecutar', () => {
    const input = { demands: [d('v1', '2026-01-02', 1), d('v2', '2026-01-05', 1)], supplies: [s('c1', '2026-01-01', 1)], physical: [p(0)] };
    const a = computeNeeds(input);
    const b = computeNeeds(input);
    expect(b.totals.faltaComprar).toBe(a.totals.faltaComprar);
    expect(diffSnapshots(a, b)).toHaveLength(0);
  });

  it('diffSnapshots mostra apenas o delta', () => {
    const before = computeNeeds({ demands: [d('v1', '2026-01-02', 1)], supplies: [], physical: [p(0)] });
    const after = computeNeeds({ demands: [d('v1', '2026-01-02', 1), d('v2', '2026-01-05', 2)], supplies: [], physical: [p(0)] });
    const delta = diffSnapshots(before, after);
    expect(delta[0].delta).toBe(2);
  });
});

describe('cenários guiados (exemplo fictício)', () => {
  for (const step of guidedSteps) {
    it(step.titulo, () => {
      const out = computeNeeds(step.input);
      expect(out.totals.faltaComprar).toBe(step.faltaEsperada);
    });
  }
});

describe('identidade de linhas', () => {
  it('usa produto_id quando existe', () => {
    expect(makeGroupKey({ produtoId: '7', variacaoId: '3' }).groupKey).toBe('p:7|v:3');
  });
  it('marca revisão quando só há nome', () => {
    const r = makeGroupKey({ nome: 'Cama', detalhes: 'A' });
    expect(r.review.length).toBeGreaterThan(0);
  });
  it('a chave de linha inclui documento e posição', () => {
    expect(makeLineKey('V9', 'p:1|v:-', 2)).toBe('V9#p:1|v:-#2');
  });
});
