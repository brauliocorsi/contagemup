import { useState, useMemo } from 'react';
import { useERPReconciliation, ERPComparisonItem } from '@/hooks/useERPReconciliation';
import { useProductSales, VendaInfo } from '@/hooks/useProductSales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, Search, Download, CheckCircle2, AlertTriangle, ArrowUp, ArrowDown, HelpCircle, Loader2, ShoppingCart, ChevronDown, ChevronUp, User, Calendar, Plus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as XLSX from 'xlsx';

const STATUS_CONFIG = {
  match: { label: 'OK', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: CheckCircle2 },
  surplus: { label: 'Excesso Local', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', icon: ArrowUp },
  shortage: { label: 'Falta Local', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', icon: ArrowDown },
  erp_only: { label: 'Só no ERP', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200', icon: HelpCircle },
  local_only: { label: 'Só Local', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', icon: AlertTriangle },
};

export function ERPReconciliationView() {
  const { comparisonItems, loading, fetchAndCompare, searchSingleProduct, registerERPProducts } = useERPReconciliation();
  const { salesMap, loading: salesLoading, loaded: salesLoaded, fetchSales, getSalesForProduct, getSalesCount } = useProductSales();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [quickSearch, setQuickSearch] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [registering, setRegistering] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    return comparisonItems.filter(item => {
      const matchesSearch = !search ||
        item.productCode.toLowerCase().includes(search.toLowerCase()) ||
        item.productName.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [comparisonItems, search, statusFilter]);

  const summary = useMemo(() => {
    const s = { total: comparisonItems.length, match: 0, surplus: 0, shortage: 0, erp_only: 0, local_only: 0 };
    comparisonItems.forEach(i => { s[i.status]++; });
    return s;
  }, [comparisonItems]);

  const exportToExcel = () => {
    const data = filtered.map(item => ({
      'Código': item.productCode,
      'Produto': item.productName,
      'Stock ERP': item.erpStock,
      'Stock Local': item.localStock,
      'Diferença': item.difference,
      'Estado': STATUS_CONFIG[item.status].label,
      'Localização': item.location || '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Conciliação ERP');
    XLSX.writeFile(wb, `conciliacao_erp_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const erpOnlyItems = useMemo(() => filtered.filter(i => i.status === 'erp_only'), [filtered]);

  const handleRegisterSingle = async (item: ERPComparisonItem) => {
    setRegistering(prev => new Set(prev).add(item.productCode));
    await registerERPProducts([item]);
    setRegistering(prev => { const s = new Set(prev); s.delete(item.productCode); return s; });
  };

  const handleRegisterAll = async () => {
    setRegistering(new Set(erpOnlyItems.map(i => i.productCode)));
    await registerERPProducts(erpOnlyItems);
    setRegistering(new Set());
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Conciliação ERP</h2>
          <p className="text-sm text-muted-foreground">Compare o stock local com o GestãoClick</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 items-end sm:items-center">
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar produto no ERP..."
                value={quickSearch}
                onChange={e => setQuickSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && quickSearch.trim()) searchSingleProduct(quickSearch); }}
                className="pl-9 w-[220px]"
              />
            </div>
            <Button variant="secondary" onClick={() => quickSearch.trim() && searchSingleProduct(quickSearch)} disabled={loading || !quickSearch.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          <Button onClick={fetchAndCompare} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            {loading ? 'A carregar...' : 'Sincronizar Tudo'}
          </Button>
          {comparisonItems.length > 0 && (
            <>
              <Button variant="outline" onClick={exportToExcel}>
                <Download className="h-4 w-4 mr-2" />
                Exportar Excel
              </Button>
              {erpOnlyItems.length > 0 && (
                <Button variant="default" onClick={handleRegisterAll} disabled={registering.size > 0}>
                  {registering.size > 0 ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  Cadastrar {erpOnlyItems.length} em falta
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {comparisonItems.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('all')}>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{summary.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow border-green-200" onClick={() => setStatusFilter('match')}>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{summary.match}</p>
              <p className="text-xs text-muted-foreground">Coincidentes</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow border-red-200" onClick={() => setStatusFilter('shortage')}>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-red-600">{summary.shortage}</p>
              <p className="text-xs text-muted-foreground">Falta Local</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow border-blue-200" onClick={() => setStatusFilter('surplus')}>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-blue-600">{summary.surplus}</p>
              <p className="text-xs text-muted-foreground">Excesso Local</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow border-orange-200" onClick={() => setStatusFilter(statusFilter === 'erp_only' ? 'all' : 'erp_only')}>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-orange-600">{summary.erp_only + summary.local_only}</p>
              <p className="text-xs text-muted-foreground">Só num sistema</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      {comparisonItems.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar por código ou nome..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrar estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="match">Coincidentes</SelectItem>
              <SelectItem value="shortage">Falta Local</SelectItem>
              <SelectItem value="surplus">Excesso Local</SelectItem>
              <SelectItem value="erp_only">Só no ERP</SelectItem>
              <SelectItem value="local_only">Só Local</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Results table */}
      {comparisonItems.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Stock ERP</TableHead>
                    <TableHead className="text-right">Stock Local</TableHead>
                    <TableHead className="text-right">Diferença</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Localização</TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1">
                        Vendas
                        {!salesLoaded && (
                          <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px]" onClick={fetchSales} disabled={salesLoading}>
                            {salesLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Carregar'}
                          </Button>
                        )}
                      </div>
                     </TableHead>
                     <TableHead>Ações</TableHead>
                   </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item, idx) => {
                    const config = STATUS_CONFIG[item.status];
                    const Icon = config.icon;
                    const rowKey = `${item.productCode}-${idx}`;
                    const isExpanded = expandedRow === rowKey;
                    const sales = salesLoaded ? getSalesForProduct(item.productCode) : [];
                    const salesCount = sales.length;

                    return (
                      <>
                        <TableRow key={rowKey}>
                          <TableCell className="font-mono text-sm">{item.productCode}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{item.productName}</TableCell>
                          <TableCell className="text-right font-medium">{item.erpStock}</TableCell>
                          <TableCell className="text-right font-medium">{item.localStock}</TableCell>
                          <TableCell className={`text-right font-bold ${item.difference > 0 ? 'text-blue-600' : item.difference < 0 ? 'text-red-600' : ''}`}>
                            {item.difference > 0 ? '+' : ''}{item.difference}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={`${config.color} gap-1`}>
                              <Icon className="h-3 w-3" />
                              {config.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{item.location || '—'}</TableCell>
                          <TableCell>
                            {salesLoaded && salesCount > 0 ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                                onClick={() => setExpandedRow(isExpanded ? null : rowKey)}
                              >
                                <ShoppingCart className="h-3 w-3" />
                                {salesCount}
                                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              </Button>
                            ) : salesLoaded ? (
                              <span className="text-xs text-muted-foreground">0</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.status === 'erp_only' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs"
                                onClick={() => handleRegisterSingle(item)}
                                disabled={registering.has(item.productCode)}
                              >
                                {registering.has(item.productCode) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                                Cadastrar
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                        {isExpanded && salesCount > 0 && (
                          <TableRow key={`${rowKey}-sales`} className="bg-muted/30">
                            <TableCell colSpan={8} className="p-0">
                              <div className="px-4 py-3 space-y-1.5">
                                <p className="text-xs font-semibold text-muted-foreground mb-2">
                                  <ShoppingCart className="h-3 w-3 inline mr-1" />
                                  {salesCount} venda(s) ativa(s) — excluindo: conferido, agendado entrega, cancelado
                                </p>
                                <div className="grid gap-1.5">
                                  {sales.map((venda: VendaInfo) => (
                                    <div
                                      key={venda.venda_id}
                                      className="flex items-center gap-3 text-sm bg-background rounded-md border px-3 py-2"
                                    >
                                      <span className="font-mono font-semibold text-foreground">#{venda.codigo}</span>
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{venda.situacao}</Badge>
                                      <span className="flex items-center gap-1 text-muted-foreground text-xs">
                                        <User className="h-3 w-3" />
                                        <span className="truncate max-w-[180px]">{venda.cliente_nome}</span>
                                      </span>
                                      <span className="flex items-center gap-1 text-muted-foreground text-xs ml-auto">
                                        <Calendar className="h-3 w-3" />
                                        {venda.data}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="p-3 text-sm text-muted-foreground border-t">
              A mostrar {filtered.length} de {comparisonItems.length} produtos
            </div>
          </CardContent>
        </Card>
      ) : !loading ? (
        <Card>
          <CardContent className="py-16 text-center">
            <RefreshCw className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Conciliação ERP</h3>
            <p className="text-muted-foreground mb-4">
              Clique em "Sincronizar com ERP" para buscar os produtos do GestãoClick e comparar com o stock local.
            </p>
            <Button onClick={fetchAndCompare}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Sincronizar com ERP
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
