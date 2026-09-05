// MÓDULO EXPERIMENTAL REMOVÍVEL — converte o snapshot do GestãoClick em entrada do motor.
import { makeGroupKey, makeLineKey } from './engine';
import type { DemandLine, EngineInput, PhysicalCoverage, SupplyLine } from './types';
import type { LabState } from './localState';

export interface GcLine {
  posicao: number;
  codigo: string;
  produtoId: string;
  variacaoId: string;
  nome: string;
  detalhes: string;
  quantidade: number;
  quantidadeSaidaBruta?: number | null;
}
export interface GcVenda {
  id: string;
  codigo: string;
  data: string;
  dataEntrega: string;
  situacaoId: string;
  situacaoNome: string;
  cliente: string;
  linhas: GcLine[];
}
export interface GcCompra {
  id: string;
  codigo: string;
  data: string;
  previsao: string;
  situacaoId: string;
  situacaoNome: string;
  fornecedor: string;
  linhasIndisponiveis: boolean;
  linhas: GcLine[];
}
export interface GcSnapshot {
  generatedAt: string;
  vendas: GcVenda[];
  compras: GcCompra[];
  quality: {
    complete: boolean;
    errors: string[];
    notes: string[];
    vendasPaginasLidas: number;
    vendasPaginasTotal: number;
    comprasPaginasLidas: number;
    comprasPaginasTotal: number;
    comprasDetalhesLidos: number;
    comprasDetalhesEmFalta: number;
    quantidadeSaidaConfirmada: boolean;
  };
}

export interface PhysicalLookup {
  get(codeLower: string): { codigo: string; nome: string; livre: number; aRever: number; review: string[] } | undefined;
}

export function buildEngineInput(
  snapshot: GcSnapshot | null,
  state: LabState,
  physical: PhysicalLookup | null,
): EngineInput {
  const demands: DemandLine[] = [];
  const supplies: SupplyLine[] = [];
  const parciais = new Set(state.situacoesParciaisIds);

  for (const v of snapshot?.vendas ?? []) {
    for (const l of v.linhas) {
      const base = makeGroupKey(l);
      const key = makeLineKey(`venda:${v.id}`, base.groupKey, l.posicao);
      const groupKey = state.manualGroupMatch[key] ?? base.groupKey;
      const review = [...base.review];
      const manual = state.manualDemands[key];
      // Entregas parciais não são dedutíveis dos dados disponíveis: pendente desconhecido.
      let pendente: number | null = parciais.has(v.situacaoId) ? null : l.quantidade;
      if (manual) {
        pendente = manual.pendente;
        review.push('Valor manual de teste (a confirmar).');
      }
      demands.push({
        key,
        vendaId: v.id,
        vendaCodigo: v.codigo || v.id,
        data: v.dataEntrega || v.data,
        situacaoId: v.situacaoId,
        situacaoNome: v.situacaoNome,
        cliente: v.cliente,
        groupKey,
        produtoId: l.produtoId,
        variacaoId: l.variacaoId,
        codigo: l.codigo,
        nome: l.nome,
        detalhes: l.detalhes,
        quantidade: l.quantidade,
        pendente,
        origin: manual ? 'manual' : 'gc',
        review,
      });
    }
  }

  for (const c of snapshot?.compras ?? []) {
    if (c.linhasIndisponiveis && c.linhas.length === 0) {
      supplies.push({
        key: `compra:${c.id}#indisponivel`,
        compraId: c.id,
        compraCodigo: c.codigo || c.id,
        data: c.previsao || c.data,
        situacaoId: c.situacaoId,
        situacaoNome: c.situacaoNome,
        fornecedor: c.fornecedor,
        groupKey: `compra-sem-linhas:${c.id}`,
        produtoId: '',
        variacaoId: '',
        codigo: '',
        nome: `Compra ${c.codigo || c.id} sem linhas legíveis`,
        detalhes: '',
        quantidade: 0,
        porReceber: null,
        origin: 'gc',
        review: ['Linhas da compra indisponíveis — indicar manualmente ou rever no GestãoClick.'],
      });
      continue;
    }
    for (const l of c.linhas) {
      const base = makeGroupKey(l);
      const key = makeLineKey(`compra:${c.id}`, base.groupKey, l.posicao);
      const groupKey = state.manualGroupMatch[key] ?? base.groupKey;
      const review = [...base.review];
      const manual = state.manualSupplies[key];
      // quantidade_saida tem semântica NÃO CONFIRMADA: nunca assumida como recebido.
      const porReceber: number | null = manual ? manual.porReceber : null;
      if (!manual) review.push('Por receber desconhecido (quantidade_saida não confirmada) — indicar manualmente.');
      else review.push('Valor manual de teste (a confirmar).');
      supplies.push({
        key,
        compraId: c.id,
        compraCodigo: c.codigo || c.id,
        data: c.previsao || c.data,
        situacaoId: c.situacaoId,
        situacaoNome: c.situacaoNome,
        fornecedor: c.fornecedor,
        groupKey,
        produtoId: l.produtoId,
        variacaoId: l.variacaoId,
        codigo: l.codigo,
        nome: l.nome,
        detalhes: l.detalhes,
        quantidade: l.quantidade,
        porReceber,
        origin: manual ? 'manual' : 'gc',
        review,
      });
    }
  }

  // Cobertura física: ligada por código do Contagem. Sem código -> sem cobertura (marcado para revisão).
  const physicalOut: PhysicalCoverage[] = [];
  const seen = new Set<string>();
  for (const line of [...demands, ...supplies]) {
    if (seen.has(line.groupKey)) continue;
    seen.add(line.groupKey);
    const code = (line.codigo || '').trim().toLowerCase();
    const entry = code && physical ? physical.get(code) : undefined;
    if (!entry) {
      physicalOut.push({
        groupKey: line.groupKey,
        codigo: line.codigo,
        nome: line.nome,
        livre: 0,
        aRever: 0,
        review: [code ? `Produto ${line.codigo} não encontrado no Contagem — cobertura física não verificada.` : 'Linha sem código — cobertura física não verificada.'],
      });
      continue;
    }
    physicalOut.push({
      groupKey: line.groupKey,
      codigo: entry.codigo,
      nome: entry.nome,
      livre: entry.livre,
      aRever: entry.aRever,
      review: entry.review,
    });
  }

  return { demands, supplies, physical: physicalOut };
}
