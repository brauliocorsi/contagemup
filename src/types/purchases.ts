export interface GcCompraHeader {
  id: string;
  numero: string;
  data: string;
  fornecedor_nome: string;
  situacao: string;
  valor_total: number | null;
}

export interface GcCompraItem {
  codigo: string;
  nome: string;
  quantidade: number;
  valor_unitario: number | null;
  produto_id_gc: string;
  variacao_id_gc: string;
}

export interface GcCompraDetailResponse {
  compra: GcCompraHeader;
  itens: GcCompraItem[];
}
