import { loadXLSX } from '@/lib/lazyXlsx';
import type { SepOrder } from './types';

export type PickingLine = {
  key: string;
  codigo: string;
  nome: string;
  detalhes: string;
  categoria: string;
  quantidade: number;
  encomendas: string[];
  /** Quantidade por nota de encomenda (chave = código da encomenda). */
  porEncomenda: Record<string, number>;
  /** Datas de saída (entrega) das vendas associadas, ordenadas. */
  saidas: string[];
  localizacoes?: string;
  /** Stock positivo disponível no Contagem (undefined = ainda não calculado). */
  stock?: number;
};

export type PickingGroup = {
  categoria: string;
  lines: PickingLine[];
  quantidade: number;
};

const CATEGORY_RULES: { categoria: string; termos: string[] }[] = [
  { categoria: 'Camas', termos: ['cama', 'beliche'] },
  { categoria: 'Estrados', termos: ['estrado', 'sommier', 'somier'] },
  { categoria: 'Colchões', termos: ['colchao', 'colchão', 'colchoes'] },
  { categoria: 'Cabeceiras', termos: ['cabeceira'] },
  { categoria: 'Mesas', termos: ['mesa', 'secretaria', 'secretária', 'consola'] },
  { categoria: 'Cadeiras', termos: ['cadeira', 'banco', 'cadeirao', 'cadeirão'] },
  { categoria: 'Sofás', termos: ['sofa', 'sofá', 'chaise', 'puff', 'pufe'] },
  { categoria: 'Roupeiros', termos: ['roupeiro', 'armario', 'armário', 'closet'] },
  { categoria: 'Cómodas', termos: ['comoda', 'cómoda', 'mesinha', 'criado'] },
  { categoria: 'Estantes', termos: ['estante', 'prateleira', 'movel tv', 'móvel tv', 'aparador'] },
  { categoria: 'Espelhos', termos: ['espelho'] },
  { categoria: 'Têxteis', termos: ['almofada', 'edredon', 'lencol', 'lençol', 'capa', 'manta'] },
  { categoria: 'Iluminação', termos: ['candeeiro', 'luminaria', 'luminária', 'abajur'] },
];

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function categoryOf(nome: string): string {
  const n = normalize(nome);
  for (const rule of CATEGORY_RULES) {
    if (rule.termos.some((t) => n.includes(normalize(t)))) return rule.categoria;
  }
  return 'Outros';
}

function toNumber(value: string): number {
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function buildPicking(orders: SepOrder[]): PickingLine[] {
  const map = new Map<string, PickingLine>();
  for (const order of orders) {
    for (const produto of order.produtos) {
      const key = `${produto.codigo}||${produto.nome}||${produto.detalhes}`;
      const line = map.get(key) ?? {
        key,
        codigo: produto.codigo,
        nome: produto.nome,
        detalhes: produto.detalhes,
        categoria: categoryOf(produto.nome),
        quantidade: 0,
        encomendas: [],
        porEncomenda: {},
        saidas: [],
      };
      const qtd = toNumber(produto.quantidade);
      line.quantidade += qtd;
      if (order.entrega && !line.saidas.includes(order.entrega)) {
        line.saidas.push(order.entrega);
        line.saidas.sort();
      }
      if (order.codigo) {
        if (!line.encomendas.includes(order.codigo)) line.encomendas.push(order.codigo);
        line.porEncomenda[order.codigo] = (line.porEncomenda[order.codigo] ?? 0) + qtd;
      }
      map.set(key, line);
    }
  }
  return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
}

export function groupByCategory(lines: PickingLine[]): PickingGroup[] {
  const map = new Map<string, PickingLine[]>();
  for (const line of lines) {
    map.set(line.categoria, [...(map.get(line.categoria) ?? []), line]);
  }
  return [...map.entries()]
    .map(([categoria, group]) => ({
      categoria,
      lines: [...group].sort((a, b) => a.nome.localeCompare(b.nome, 'pt')),
      quantidade: group.reduce((sum, l) => sum + l.quantidade, 0),
    }))
    .sort((a, b) =>
      a.categoria === 'Outros'
        ? 1
        : b.categoria === 'Outros'
          ? -1
          : a.categoria.localeCompare(b.categoria, 'pt'),
    );
}

export async function exportPickingXlsx(
  lines: PickingLine[],
  from: string,
  to: string,
  byCategory = false,
) {
  const XLSX = await loadXLSX();
  const ordered = byCategory ? groupByCategory(lines).flatMap((g) => g.lines) : lines;
  const rows = ordered.map((l) => ({
    Categoria: l.categoria,
    Codigo: l.codigo,
    Produto: l.nome,
    Detalhes: l.detalhes,
    Localizacao: l.localizacoes ?? '—',
    Saida: l.saidas.join(', '),
    Stock: l.stock ?? '',
    Quantidade: l.quantidade,
    Encomendas: l.encomendas.join(', '),
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 18 },
    { wch: 16 },
    { wch: 46 },
    { wch: 30 },
    { wch: 30 },
    { wch: 22 },
    { wch: 10 },
    { wch: 12 },
    { wch: 40 },
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Picking');
  XLSX.writeFile(book, `picking-${from}-a-${to}.xlsx`);
}
