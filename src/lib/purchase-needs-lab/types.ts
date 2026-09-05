// MÓDULO EXPERIMENTAL REMOVÍVEL — "Necessidades de Compra — Testes" (só leitura + simulação).
// Remoção: apagar src/lib/purchase-needs-lab, src/components/purchase-needs-lab,
// supabase/functions/needs-lab-gc e o item de menu 'needs-lab'.

export type Origin = 'gc' | 'manual' | 'fixture';

/** Linha de procura: uma linha de produto de uma venda. */
export interface DemandLine {
  /** Chave determinística e reexecutável (não usa índice de array como identidade sozinho). */
  key: string;
  vendaId: string;
  vendaCodigo: string;
  data: string; // YYYY-MM-DD
  situacaoId: string;
  situacaoNome: string;
  cliente: string;
  groupKey: string;
  produtoId: string;
  variacaoId: string;
  codigo: string;
  nome: string;
  detalhes: string;
  /** Quantidade vendida tal como veio do sistema de origem. */
  quantidade: number;
  /** Pendente de entregar. null = desconhecido, exige confirmação manual. */
  pendente: number | null;
  origin: Origin;
  review: string[];
}

/** Linha de fornecimento: compra ainda por receber (simulada). */
export interface SupplyLine {
  key: string;
  compraId: string;
  compraCodigo: string;
  data: string;
  situacaoId: string;
  situacaoNome: string;
  fornecedor: string;
  groupKey: string;
  produtoId: string;
  variacaoId: string;
  codigo: string;
  nome: string;
  detalhes: string;
  quantidade: number;
  /** Por receber. null = desconhecido (quantidade_saida não é interpretada). */
  porReceber: number | null;
  origin: Origin;
  review: string[];
}

/** Cobertura física livre no Contagem (conjuntos completos em localizações de stock). */
export interface PhysicalCoverage {
  groupKey: string;
  codigo: string;
  nome: string;
  /** Conjuntos completos livres (exclui quarentena, cais, viatura, conferência, zonas livres). */
  livre: number;
  /** Unidades que existem mas cuja disponibilidade não é garantida — nunca contam como cobertura. */
  aRever: number;
  review: string[];
}

export interface Allocation {
  from: 'fisico' | 'compra';
  supplyKey?: string;
  compraCodigo?: string;
  quantidade: number;
}

export interface DemandResult {
  line: DemandLine;
  pendenteUsado: number;
  coberto: number;
  falta: number;
  alocacoes: Allocation[];
  incompleto: boolean;
}

export interface GroupResult {
  groupKey: string;
  codigo: string;
  nome: string;
  detalhes: string;
  fornecedores: string[];
  pendente: number;
  coberturaFisica: number;
  coberturaFisicaUsada: number;
  comprasPorReceber: number;
  comprasUsadas: number;
  faltaComprar: number;
  incompleto: boolean;
  review: string[];
  demandas: DemandResult[];
  fornecimentos: SupplyLine[];
}

export interface EngineInput {
  demands: DemandLine[];
  supplies: SupplyLine[];
  physical: PhysicalCoverage[];
}

export interface EngineOutput {
  groups: GroupResult[];
  totals: {
    pendente: number;
    faltaComprar: number;
    gruposIncompletos: number;
    gruposComRevisao: number;
  };
}
