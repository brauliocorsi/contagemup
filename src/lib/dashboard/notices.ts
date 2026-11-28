export type NoticeTone = 'danger' | 'warning' | 'info';
export type NoticeGroup = 'stock' | 'warehouse' | 'dispatch';
export interface DashboardNotice {
  id: string;
  title: string;
  detail: string;
  count: number;
  action: string;
  destination: string;
  tone: NoticeTone;
  group: NoticeGroup;
}
export interface DashboardSignals {
  negativeStock?: number;
  replenishment?: number;
  unlocated?: number;
  orphans?: number;
  damages?: number;
  conf?: number;
  picking?: number;
  deliveries?: number;
}

/** Unknown signals are omitted, never represented as a resolved warning. */
export function buildDashboardNotices(signals: DashboardSignals): DashboardNotice[] {
  const definitions: DashboardNotice[] = [];
  const add = (count: number | undefined, notice: Omit<DashboardNotice, 'count'>) => {
    if (count !== undefined && count > 0) definitions.push({ ...notice, count });
  };
  add(signals.negativeStock, { id: 'negative', title: 'Produtos com stock negativo', detail: 'Divergências de stock', action: 'Rever stock', destination: 'alerts', tone: 'danger', group: 'stock' });
  add(signals.unlocated, { id: 'unlocated', title: 'Colis sem localização', detail: 'Por localizar no armazém', action: 'Arrumar', destination: 'putaway', tone: 'danger', group: 'warehouse' });
  add(signals.damages, { id: 'damages', title: 'Avarias pendentes', detail: 'Registos por resolver', action: 'Resolver avarias', destination: 'damages', tone: 'warning', group: 'warehouse' });
  add(signals.orphans, { id: 'orphans', title: 'Colis órfãos', detail: 'Partes sem conjunto completo', action: 'Rever colis', destination: 'orphans', tone: 'warning', group: 'stock' });
  add(signals.replenishment, { id: 'replenishment', title: 'Produtos abaixo do mínimo', detail: 'Reposição de stock', action: 'Ver alertas', destination: 'alerts', tone: 'warning', group: 'stock' });
  add(signals.conf, { id: 'conf', title: 'Colis em conferência', detail: 'Na localização CONF', action: 'Arrumar', destination: 'putaway', tone: 'info', group: 'warehouse' });
  add(signals.picking, { id: 'picking', title: 'Pickings por concluir', detail: 'Tarefas pendentes ou em curso', action: 'Abrir picking', destination: 'scanner-picking', tone: 'info', group: 'dispatch' });
  add(signals.deliveries, { id: 'deliveries', title: 'Notas por entregar', detail: 'No cais ou na viatura', action: 'Ver entregas', destination: 'deliveries', tone: 'info', group: 'dispatch' });
  return definitions;
}
