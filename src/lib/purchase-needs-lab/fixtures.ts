// MÓDULO EXPERIMENTAL REMOVÍVEL — exemplo EXPLICITAMENTE FICTÍCIO para testar sem depender da API.
import type { DemandLine, EngineInput, PhysicalCoverage, SupplyLine } from './types';

export const FICTICIO_AVISO = 'Exemplo fictício — produto, vendas e compras inventados apenas para demonstração.';

const GROUP = 'p:FICTICIO-1|v:-';

function demand(over: Partial<DemandLine> & { key: string; vendaCodigo: string; data: string; pendente: number | null }): DemandLine {
  return {
    vendaId: over.vendaCodigo,
    situacaoId: 'fic-1',
    situacaoNome: 'Em aberto (fictício)',
    cliente: 'Cliente Fictício',
    groupKey: GROUP,
    produtoId: 'FICTICIO-1',
    variacaoId: '',
    codigo: 'DEMO-001',
    nome: 'Cama Demo (fictícia)',
    detalhes: 'Configuração A',
    quantidade: over.pendente ?? 0,
    origin: 'fixture',
    review: [],
    ...over,
  } as DemandLine;
}

function supply(over: Partial<SupplyLine> & { key: string; compraCodigo: string; data: string; porReceber: number | null }): SupplyLine {
  return {
    compraId: over.compraCodigo,
    situacaoId: 'fic-c1',
    situacaoNome: 'Compra em aberto (fictícia)',
    fornecedor: 'Fornecedor Fictício',
    groupKey: GROUP,
    produtoId: 'FICTICIO-1',
    variacaoId: '',
    codigo: 'DEMO-001',
    nome: 'Cama Demo (fictícia)',
    detalhes: 'Configuração A',
    quantidade: over.porReceber ?? 0,
    origin: 'fixture',
    review: [],
    ...over,
  } as SupplyLine;
}

function physical(livre: number, aRever = 0): PhysicalCoverage {
  return { groupKey: GROUP, codigo: 'DEMO-001', nome: 'Cama Demo (fictícia)', livre, aRever, review: [] };
}

export interface GuidedStep {
  id: string;
  titulo: string;
  descricao: string;
  esperado: string;
  input: EngineInput;
  /** falta comprar esperada para o grupo fictício */
  faltaEsperada: number;
}

const v1 = demand({ key: 'V1#l0', vendaCodigo: 'V-1', data: '2026-01-02', pendente: 1 });
const v2 = demand({ key: 'V2#l0', vendaCodigo: 'V-2', data: '2026-01-05', pendente: 1 });
const c1 = supply({ key: 'C1#l0', compraCodigo: 'C-1', data: '2026-01-03', porReceber: 1 });

export const guidedSteps: GuidedStep[] = [
  {
    id: 'passo-1',
    titulo: '1. Primeira venda de 1 unidade',
    descricao: 'Uma venda em aberto de 1 unidade, sem stock físico livre e sem compras.',
    esperado: 'Falta comprar 1',
    input: { demands: [v1], supplies: [], physical: [physical(0)] },
    faltaEsperada: 1,
  },
  {
    id: 'passo-2',
    titulo: '2. Compra aberta de 1 unidade',
    descricao: 'A mesma venda, agora com uma compra em aberto de 1 unidade por receber.',
    esperado: 'Falta comprar 0',
    input: { demands: [v1], supplies: [c1], physical: [physical(0)] },
    faltaEsperada: 0,
  },
  {
    id: 'passo-3',
    titulo: '3. Segunda venda da mesma peça',
    descricao: 'Chega outra venda de 1 unidade. A compra já está reservada à primeira venda.',
    esperado: 'Falta comprar 1 (a mais)',
    input: { demands: [v1, v2], supplies: [c1], physical: [physical(0)] },
    faltaEsperada: 1,
  },
  {
    id: 'passo-4',
    titulo: '4. Reabrir/fechar a mesma venda sem alterações',
    descricao: 'A venda V-1 é reaberta e fechada sem mudar quantidades. O cálculo é reexecutado do zero.',
    esperado: 'Sem aumento: continua 1',
    input: { demands: [v1, v2], supplies: [c1], physical: [physical(0)] },
    faltaEsperada: 1,
  },
  {
    id: 'passo-5',
    titulo: '5. Incremento apenas pelo delta',
    descricao: 'A venda V-2 passa de 1 para 3 unidades.',
    esperado: 'Falta comprar 3 (1 coberta pela compra, 3 em falta)',
    input: {
      demands: [v1, { ...v2, pendente: 3, quantidade: 3 }],
      supplies: [c1],
      physical: [physical(0)],
    },
    faltaEsperada: 3,
  },
  {
    id: 'passo-6',
    titulo: '6. Receção parcial converte cobertura',
    descricao: 'Recebe-se 1 unidade da compra: passa a físico livre e a compra fica com 0 por receber. Não conta duas vezes.',
    esperado: 'Falta comprar 3 (igual ao passo anterior, só mudou a origem da cobertura)',
    input: {
      demands: [v1, { ...v2, pendente: 3, quantidade: 3 }],
      supplies: [{ ...c1, porReceber: 0 }],
      physical: [physical(1)],
    },
    faltaEsperada: 3,
  },
  {
    id: 'passo-7',
    titulo: '7. Entrega parcial reduz a pendência',
    descricao: 'A venda V-2 entrega 2 das 3 unidades; fica 1 pendente.',
    esperado: 'Falta comprar 1',
    input: {
      demands: [v1, { ...v2, pendente: 1, quantidade: 3 }],
      supplies: [{ ...c1, porReceber: 0 }],
      physical: [physical(1)],
    },
    faltaEsperada: 1,
  },
  {
    id: 'passo-8',
    titulo: '8. Cancelamento da compra reabre a falta',
    descricao: 'A compra em aberto é cancelada (deixa de estar nas situações consideradas).',
    esperado: 'Falta comprar 2',
    input: {
      demands: [v1, { ...v2, pendente: 3, quantidade: 3 }],
      supplies: [],
      physical: [physical(2)],
    },
    faltaEsperada: 2,
  },
  {
    id: 'passo-9',
    titulo: '9. Dados incompletos (pendente por confirmar)',
    descricao: 'Venda antiga sem informação de entregas: o pendente fica desconhecido.',
    esperado: 'Marcado como incompleto — nunca assumido como zero',
    input: {
      demands: [v1, { ...v2, pendente: null }],
      supplies: [],
      physical: [physical(0)],
    },
    faltaEsperada: 1,
  },
];
