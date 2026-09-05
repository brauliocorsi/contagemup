// MÓDULO EXPERIMENTAL REMOVÍVEL — motor de cálculo determinístico (puro, sem efeitos).
import type {
  Allocation,
  DemandLine,
  DemandResult,
  EngineInput,
  EngineOutput,
  GroupResult,
  PhysicalCoverage,
  SupplyLine,
} from './types';

/** Chave de agrupamento produto/variação/configuração. Nunca casa apenas por nome sem marcar revisão. */
export function makeGroupKey(input: {
  produtoId?: string;
  variacaoId?: string;
  codigo?: string;
  nome?: string;
  detalhes?: string;
}): { groupKey: string; review: string[] } {
  const review: string[] = [];
  const produtoId = (input.produtoId ?? '').trim();
  const variacaoId = (input.variacaoId ?? '').trim();
  const codigo = (input.codigo ?? '').trim().toLowerCase();
  const nome = (input.nome ?? '').trim().toLowerCase();
  const detalhes = (input.detalhes ?? '').trim().toLowerCase();

  if (produtoId) {
    return { groupKey: `p:${produtoId}|v:${variacaoId || '-'}`, review };
  }
  if (codigo) {
    review.push('Sem produto_id do ERP — agrupado pelo código interno.');
    return { groupKey: `c:${codigo}|v:${variacaoId || '-'}`, review };
  }
  review.push('Sem produto_id nem código — agrupado por nome/configuração; correspondência a confirmar.');
  return { groupKey: `n:${nome}|d:${detalhes}`, review };
}

/** Chave estável de linha: não usa apenas o índice do array como identidade. */
export function makeLineKey(docId: string, groupKey: string, posicao: number): string {
  return `${docId}#${groupKey}#${posicao}`;
}

function sortDemands(a: DemandLine, b: DemandLine): number {
  const da = a.data || '9999-12-31';
  const db = b.data || '9999-12-31';
  if (da !== db) return da < db ? -1 : 1;
  if (a.vendaId !== b.vendaId) return a.vendaId < b.vendaId ? -1 : 1;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

function sortSupplies(a: SupplyLine, b: SupplyLine): number {
  const da = a.data || '9999-12-31';
  const db = b.data || '9999-12-31';
  if (da !== db) return da < db ? -1 : 1;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/**
 * Cálculo FIFO cronológico. Cada unidade física ou de compra cobre no máximo uma venda.
 * Determinístico: mesma entrada => mesma saída, sem acumulação entre execuções.
 */
export function computeNeeds(input: EngineInput): EngineOutput {
  const physicalByGroup = new Map<string, PhysicalCoverage>();
  for (const p of input.physical) physicalByGroup.set(p.groupKey, p);

  const groupKeys = new Set<string>([
    ...input.demands.map((d) => d.groupKey),
    ...input.supplies.map((s) => s.groupKey),
  ]);

  const groups: GroupResult[] = [];

  for (const groupKey of Array.from(groupKeys).sort()) {
    const demands = input.demands.filter((d) => d.groupKey === groupKey).slice().sort(sortDemands);
    const supplies = input.supplies.filter((s) => s.groupKey === groupKey).slice().sort(sortSupplies);
    const phys = physicalByGroup.get(groupKey);

    const review = new Set<string>();
    demands.forEach((d) => d.review.forEach((r) => review.add(r)));
    supplies.forEach((s) => s.review.forEach((r) => review.add(r)));
    phys?.review.forEach((r) => review.add(r));

    let physicalLeft = Math.max(0, phys?.livre ?? 0);
    const physicalTotal = physicalLeft;
    const supplyLeft = new Map<string, number>();
    let suppliesTotal = 0;
    for (const s of supplies) {
      if (s.porReceber === null) {
        review.add(
          `Compra ${s.compraCodigo || s.compraId}: quantidade por receber desconhecida — indicar manualmente (não assumida como zero nem como total).`,
        );
        continue;
      }
      supplyLeft.set(s.key, Math.max(0, s.porReceber));
      suppliesTotal += Math.max(0, s.porReceber);
    }

    let pendenteTotal = 0;
    let faltaTotal = 0;
    let incompleto = false;
    const demandResults: DemandResult[] = [];

    for (const d of demands) {
      const desconhecido = d.pendente === null;
      if (desconhecido) {
        incompleto = true;
        review.add(
          `Venda ${d.vendaCodigo || d.vendaId}: pendente de entregar por confirmar (entregas parciais não são dedutíveis dos dados disponíveis).`,
        );
      }
      const pendente = Math.max(0, d.pendente ?? 0);
      pendenteTotal += pendente;

      let porCobrir = pendente;
      const alocacoes: Allocation[] = [];

      if (porCobrir > 0 && physicalLeft > 0) {
        const take = Math.min(porCobrir, physicalLeft);
        physicalLeft -= take;
        porCobrir -= take;
        alocacoes.push({ from: 'fisico', quantidade: take });
      }

      for (const s of supplies) {
        if (porCobrir <= 0) break;
        const left = supplyLeft.get(s.key) ?? 0;
        if (left <= 0) continue;
        const take = Math.min(porCobrir, left);
        supplyLeft.set(s.key, left - take);
        porCobrir -= take;
        alocacoes.push({ from: 'compra', supplyKey: s.key, compraCodigo: s.compraCodigo || s.compraId, quantidade: take });
      }

      const coberto = pendente - porCobrir;
      faltaTotal += porCobrir;
      demandResults.push({
        line: d,
        pendenteUsado: pendente,
        coberto,
        falta: porCobrir,
        alocacoes,
        incompleto: desconhecido,
      });
    }

    const comprasUsadas = suppliesTotal - Array.from(supplyLeft.values()).reduce((a, b) => a + b, 0);
    const fornecedores = Array.from(new Set(supplies.map((s) => s.fornecedor).filter(Boolean))).sort();
    const first = demands[0] ?? supplies[0];
    if ((phys?.aRever ?? 0) > 0) {
      review.add(`${phys?.aRever} unidade(s) física(s) não livres (quarentena, cais/viatura ou localização desconhecida) — não contadas.`);
    }

    groups.push({
      groupKey,
      codigo: first?.codigo ?? phys?.codigo ?? '',
      nome: first?.nome ?? phys?.nome ?? '',
      detalhes: (demands[0]?.detalhes ?? supplies[0]?.detalhes ?? ''),
      fornecedores,
      pendente: pendenteTotal,
      coberturaFisica: physicalTotal,
      coberturaFisicaUsada: physicalTotal - physicalLeft,
      comprasPorReceber: suppliesTotal,
      comprasUsadas,
      faltaComprar: Math.max(0, faltaTotal),
      incompleto,
      review: Array.from(review),
      demandas: demandResults,
      fornecimentos: supplies,
    });
  }

  return {
    groups,
    totals: {
      pendente: groups.reduce((a, g) => a + g.pendente, 0),
      faltaComprar: groups.reduce((a, g) => a + g.faltaComprar, 0),
      gruposIncompletos: groups.filter((g) => g.incompleto).length,
      gruposComRevisao: groups.filter((g) => g.review.length > 0).length,
    },
  };
}

/** Diferença entre duas execuções, para comparar sem acumular quantidades. */
export interface SnapshotDelta {
  groupKey: string;
  codigo: string;
  nome: string;
  anterior: number;
  atual: number;
  delta: number;
}

export function diffSnapshots(previous: EngineOutput | null, current: EngineOutput): SnapshotDelta[] {
  const prev = new Map<string, number>();
  previous?.groups.forEach((g) => prev.set(g.groupKey, g.faltaComprar));
  const out: SnapshotDelta[] = [];
  for (const g of current.groups) {
    const anterior = prev.get(g.groupKey) ?? 0;
    if (anterior !== g.faltaComprar) {
      out.push({ groupKey: g.groupKey, codigo: g.codigo, nome: g.nome, anterior, atual: g.faltaComprar, delta: g.faltaComprar - anterior });
    }
    prev.delete(g.groupKey);
  }
  previous?.groups.forEach((g) => {
    if (prev.has(g.groupKey)) {
      out.push({ groupKey: g.groupKey, codigo: g.codigo, nome: g.nome, anterior: g.faltaComprar, atual: 0, delta: -g.faltaComprar });
      prev.delete(g.groupKey);
    }
  });
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
