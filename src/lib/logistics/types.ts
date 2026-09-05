// Tipos partilhados entre o frontend de Logística e as Edge Functions
// `logistics-gc` e `logistics-maps`.

export type SepProduct = {
  codigo: string;
  nome: string;
  quantidade: string;
  detalhes: string;
};

export type SepService = {
  nome: string;
  valor: number;
  tipo: 'entrega' | 'montagem' | 'outro';
};

export type SepOrder = {
  id: string;
  codigo: string;
  cliente: string;
  vendedor: string;
  data: string;
  entrega: string;
  situacao: string;
  transportadora: string;
  observacoes: string;
  morada: string;
  total: string;
  produtos: SepProduct[];
  servicos: SepService[];
  valorEntrega: number;
  valorMontagem: number;
  valorServicos: number;
};

export type GcLine = {
  codigo: string;
  nome: string;
  detalhes: string;
  unidade: string;
  quantidade: string;
  valorUnitario: string;
  desconto: string;
  total: string;
};

export type GcDocument = {
  id: string;
  codigo: string;
  data: string;
  entrega: string;
  validade: string;
  situacao: string;
  loja: string;
  centroCusto: string;
  canalVenda: string;
  vendedor: string;
  transportadora: string;
  condicaoPagamento: string;
  introducao: string;
  observacoes: string;
  observacoesInternas: string;
  cliente: {
    id: string;
    nome: string;
    documento: string;
    email: string;
    telefone: string;
    morada: string;
  };
  produtos: GcLine[];
  servicos: GcLine[];
  pagamentos: { vencimento: string; forma: string; valor: string; observacao: string }[];
  atributos: { descricao: string; conteudo: string }[];
  valorProdutos: string;
  valorServicos: string;
  valorFrete: string;
  desconto: string;
  valorTotal: string;
};

export type GuideResult = {
  orderId: string;
  codigo: string;
  cliente?: string;
  ok: boolean;
  guideId?: number;
  guideNumber?: string;
  permalink?: string;
  version?: number;
  previousGuideNumber?: string;
  error?: string;
};

export type GuideRecord = {
  id: string;
  order_id: string;
  order_code: string;
  client_name: string;
  guide_number: string;
  permalink: string;
  plate: string;
  version: number;
  created_at: string;
};

export type WeekStop = {
  id: string;
  codigo: string;
  cliente: string;
  address: string;
  postal: string;
  entrega: string;
  situacao: string;
  lat: number | null;
  lng: number | null;
  valorEntrega: number;
  valorMontagem: number;
};

export type DayRoute = {
  day: string;
  date: string;
  run: number;
  stops: WeekStop[];
  km: number;
  liters: number;
  cost: number;
  mapsUrl: string;
  mapsUrls: string[];
  entregaTotal: number;
  montagemTotal: number;
  servicoTotal: number;
};

export type DayComparison = { date: string; before: number; after: number; moved: number };

export type WeekPlan = {
  origin: string;
  days: DayRoute[];
  unlocated: WeekStop[];
  suggestions: string[];
  totalKm: number;
  totalCost: number;
  baselineKm: number;
  baselineCost: number;
  movedCount: number;
  comparison: DayComparison[];
  entregaTotal: number;
  montagemTotal: number;
  servicoTotal: number;
};

export type RouteStop = {
  label: string;
  address: string;
  lat: number | null;
  lng: number | null;
};

export type RoutePlan = {
  origin: string;
  stops: RouteStop[];
  legs: string[][];
  ungeocoded: string[];
};

export const DEFAULT_ADDRESS_FROM = 'Rua Industrial, 5, 4590-000 Paços de Ferreira, Portugal';
