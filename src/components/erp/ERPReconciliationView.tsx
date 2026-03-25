import { useState, useMemo, useEffect } from 'react';
import { useERPReconciliation, ERPComparisonItem, SyncValidation } from '@/hooks/useERPReconciliation';
import { useProductSales, VendaInfo } from '@/hooks/useProductSales';
import { useCategories } from '@/hooks/useCategories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, Search, Download, CheckCircle2, AlertTriangle, ArrowUp, ArrowDown, HelpCircle, Loader2, ShoppingCart, ChevronDown, ChevronUp, User, Calendar, Plus, Copy, Link, ShieldCheck, ShieldAlert, Ban, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import * as XLSX from 'xlsx';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  match: { label: 'OK', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: CheckCircle2 },
  surplus: { label: 'Excesso Local', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', icon: ArrowUp },
  shortage: { label: 'Falta Local', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', icon: ArrowDown },
  erp_only: { label: 'Só no ERP', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200', icon: HelpCircle },
  local_only: { label: 'Só Local', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', icon: AlertTriangle },
  duplicate_suspect: { label: 'Possível Duplicado', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', icon: Copy },
};

export function ERPReconciliationView() {
  const { comparisonItems, loading, fetchAndCompare, searchSingleProduct, registerERPProducts, unifyDuplicate, cachedAt: productsCachedAt, syncValidation } = useERPReconciliation();
  const { salesMap, loading: salesLoading, loaded: salesLoaded, fetchSales, getSalesForProduct, getSalesCount, cachedAt: salesCachedAt } = useProductSales();
  const { categories } = useCategories();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [validationFilter, setValidationFilter] = useState<string>('all');
  const [quickSearch, setQuickSearch] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [registering, setRegistering] = useState<Set<string>>(new Set());
  const [unifying, setUnifying] = useState<Set<string>>(new Set());
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [pendingRegisterItems, setPendingRegisterItems] = useState<ERPComparisonItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('Geral');
  const [unifyConfirmItem, setUnifyConfirmItem] = useState<ERPComparisonItem | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  // Auto-load sales on mount
  useEffect(() => {
    if (!salesLoaded && !salesLoading) {
      fetchSales();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper to show cache age
  const getCacheAge = (cachedAt: string | null): string | null => {
    if (!cachedAt) return null;
    const mins = Math.round((Date.now() - new Date(cachedAt).getTime()) / 60000);
    if (mins < 1) return 'agora';
    return `há ${mins} min`;
  };

  // Calculate sold stock per product from active sales
  const getSoldStock = (productCode: string): number => {
    if (!salesLoaded) return 0;
    const sales = getSalesForProduct(productCode);
    let total = 0;
    for (const venda of sales) {
      if (venda.produtos && Array.isArray(venda.produtos)) {
        for (const prod of venda.produtos) {
          const code = (prod.codigo || '').trim().toLowerCase();
          if (code === productCode.trim().toLowerCase()) {
            total += parseFloat(prod.quantidade || '0') || 0;
          }
        }
      }
    }
    return Math.round(total);
  };

  const filtered = useMemo(() => {
    return comparisonItems.filter(item => {
      const matchesSearch = !search ||
        item.productCode.toLowerCase().includes(search.toLowerCase()) ||
        item.productName.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      
      // Validation filter
      let matchesValidation = true;
      if (validationFilter !== 'all' && salesLoaded) {
        const soldStock = getSoldStock(item.productCode);
        const result = item.localStock - soldStock - item.erpStock;
        const isValid = result === 0;
        if (validationFilter === 'validated') matchesValidation = isValid;
        else if (validationFilter === 'divergent') matchesValidation = !isValid;
      }
      
      return matchesSearch && matchesStatus && matchesValidation;
    });
  }, [comparisonItems, search, statusFilter, validationFilter, salesLoaded]);

  // Reset page when filters change
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  if (safePage !== currentPage) setCurrentPage(safePage);

  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  const summary = useMemo(() => {
    const s = { total: comparisonItems.length, match: 0, surplus: 0, shortage: 0, erp_only: 0, local_only: 0, duplicate_suspect: 0 };
    comparisonItems.forEach(i => { s[i.status]++; });
    return s;
  }, [comparisonItems]);

  const exportToExcel = () => {
    if (!canExport) return;

    const data = filtered.map(item => {
      const soldStock = getSoldStock(item.productCode);
      const result = item.localStock - soldStock - item.erpStock;
      const isValid = result === 0;
      return {
        'Código': item.productCode,
        'Produto': item.productName,
        'Stock Local': item.localStock,
        'Stock Vendido': soldStock,
        'Stock ERP': item.erpStock,
        'Resultado (Local - Vendido - ERP)': result,
        'Validação': isValid ? 'Validado' : 'Divergente',
        'Estado Conciliação': STATUS_CONFIG[item.status]?.label || item.status,
        'Localização': item.location || '',
        ...(item.possibleMatch ? {
          'Possível Duplicado - Código': item.possibleMatch.code,
          'Possível Duplicado - Nome': item.possibleMatch.name,
          'Possível Duplicado - Stock': item.possibleMatch.stock,
        } : {}),
      };
    });

    // Add summary row
    const totalLocal = filtered.reduce((s, i) => s + i.localStock, 0);
    const totalSold = filtered.reduce((s, i) => s + getSoldStock(i.productCode), 0);
    const totalERP = filtered.reduce((s, i) => s + i.erpStock, 0);
    const totalResult = totalLocal - totalSold - totalERP;
    const validated = filtered.filter(i => { const r = i.localStock - getSoldStock(i.productCode) - i.erpStock; return r === 0; }).length;
    const divergent = filtered.length - validated;

    data.push({
      'Código': '',
      'Produto': `TOTAL (${filtered.length} produtos)`,
      'Stock Local': totalLocal,
      'Stock Vendido': totalSold,
      'Stock ERP': totalERP,
      'Resultado (Local - Vendido - ERP)': totalResult,
      'Validação': `${validated} Validados / ${divergent} Divergentes`,
      'Estado Conciliação': '',
      'Localização': '',
    } as any);

    const ws = XLSX.utils.json_to_sheet(data);
    
    // Auto-size columns
    const colWidths = Object.keys(data[0] || {}).map(key => ({
      wch: Math.max(key.length, ...data.map(row => String((row as any)[key] ?? '').length)) + 2
    }));
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Conciliação ERP');
    XLSX.writeFile(wb, `conciliacao_erp_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const canExport = comparisonItems.length > 0 && salesLoaded && syncValidation?.isValid === true;

  const erpOnlyItems = useMemo(() => filtered.filter(i => i.status === 'erp_only'), [filtered]);

  const openCategoryDialog = (items: ERPComparisonItem[]) => {
    setPendingRegisterItems(items);
    setSelectedCategory('Geral');
    setCategoryDialogOpen(true);
  };

  const confirmRegister = async () => {
    setCategoryDialogOpen(false);
    const codes = pendingRegisterItems.map(i => i.productCode);
    setRegistering(new Set(codes));
    await registerERPProducts(pendingRegisterItems, selectedCategory);
    setRegistering(new Set());
    setPendingRegisterItems([]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Conciliação ERP</h2>
          <p className="text-sm text-muted-foreground">Compare o stock local com o GestãoClick</p>
          {(productsCachedAt || salesCachedAt) && (
            <div className="flex items-center gap-3 mt-1">
              {productsCachedAt && (
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  Produtos: cache {getCacheAge(productsCachedAt)}
                </span>
              )}
              {salesCachedAt && (
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  Vendas: cache {getCacheAge(salesCachedAt)}
                </span>
              )}
              <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={() => { fetchAndCompare(true); fetchSales(true); }} disabled={loading || salesLoading}>
                Forçar refresh
              </Button>
            </div>
          )}
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
          <Button onClick={() => fetchAndCompare()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            {loading ? 'A carregar...' : 'Sincronizar Tudo'}
          </Button>
          {comparisonItems.length > 0 && (
            <>
              <div className="relative group">
                <Button variant="outline" onClick={exportToExcel} disabled={!canExport}>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar Excel
                </Button>
                {!canExport && comparisonItems.length > 0 && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-52 p-2 bg-popover border rounded-md shadow-md text-xs text-muted-foreground hidden group-hover:block z-50">
                    <p className="font-semibold text-foreground mb-1">Exportação bloqueada:</p>
                    <ul className="space-y-0.5">
                      {!salesLoaded && <li className="flex items-center gap-1"><Ban className="h-3 w-3 text-red-500 flex-shrink-0" /> Vendas não carregadas</li>}
                      {syncValidation && !syncValidation.isValid && <li className="flex items-center gap-1"><Ban className="h-3 w-3 text-red-500 flex-shrink-0" /> Sincronização incompleta</li>}
                      {!syncValidation && <li className="flex items-center gap-1"><Ban className="h-3 w-3 text-red-500 flex-shrink-0" /> Sincronização não validada</li>}
                    </ul>
                  </div>
                )}
              </div>
              {erpOnlyItems.length > 0 && (
                <Button variant="default" onClick={() => openCategoryDialog(erpOnlyItems)} disabled={registering.size > 0}>
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
        <div className={`grid grid-cols-2 ${summary.duplicate_suspect > 0 ? 'md:grid-cols-6' : 'md:grid-cols-5'} gap-3`}>
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
          {summary.duplicate_suspect > 0 && (
            <Card className="cursor-pointer hover:shadow-md transition-shadow border-yellow-200" onClick={() => setStatusFilter(statusFilter === 'duplicate_suspect' ? 'all' : 'duplicate_suspect')}>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-yellow-600">{summary.duplicate_suspect}</p>
                <p className="text-xs text-muted-foreground">Possíveis Duplicados</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Sync Validation Banner */}
      {syncValidation && (
        <Card className={syncValidation.isValid ? 'border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-800' : 'border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800'}>
          <CardContent className="p-3 flex items-center gap-3">
            {syncValidation.isValid ? (
              <ShieldCheck className="h-5 w-5 text-green-600 flex-shrink-0" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-red-600 flex-shrink-0" />
            )}
            <div className="flex-1">
              {syncValidation.isValid ? (
                <p className="text-sm text-green-800 dark:text-green-200">
                  <span className="font-semibold">Sincronização validada:</span>{' '}
                  {syncValidation.totalProducts} produtos carregados
                  {syncValidation.fromCache ? ' (do cache)' : ` de ${syncValidation.totalPages} páginas`}
                  {syncValidation.expectedTotal && ` — esperados: ${syncValidation.expectedTotal}`}
                </p>
              ) : (
                <div>
                  <p className="text-sm text-red-800 dark:text-red-200 font-semibold">
                    Sincronização incompleta: {syncValidation.pagesFetched}/{syncValidation.totalPages} páginas carregadas
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">
                    Páginas com falha: {syncValidation.failedPages.join(', ')}. Os dados podem estar incompletos. Tente sincronizar novamente.
                  </p>
                </div>
              )}
            </div>
            {!syncValidation.isValid && (
              <Button size="sm" variant="destructive" onClick={() => fetchAndCompare(true)} disabled={loading}>
                <RefreshCw className="h-3 w-3 mr-1" />
                Tentar novamente
              </Button>
            )}
          </CardContent>
        </Card>
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
              <SelectItem value="duplicate_suspect">Possíveis Duplicados</SelectItem>
            </SelectContent>
          </Select>
          <Select value={validationFilter} onValueChange={setValidationFilter} disabled={!salesLoaded}>
            <SelectTrigger className={`w-[180px] ${validationFilter !== 'all' ? 'border-primary bg-primary/10' : ''}`}>
              <ShieldCheck className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Validação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas validações</SelectItem>
              <SelectItem value="validated">✅ Validados</SelectItem>
              <SelectItem value="divergent">❌ Divergentes</SelectItem>
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
                    <TableHead className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        Stock Vendido
                        {!salesLoaded && (
                          <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px]" onClick={() => fetchSales()} disabled={salesLoading}>
                            {salesLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Carregar'}
                          </Button>
                        )}
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Stock Local</TableHead>
                    <TableHead className="text-right">Diferença</TableHead>
                    <TableHead>Estado</TableHead>
                     <TableHead>Localização</TableHead>
                    <TableHead className="text-center">
                      <div className="flex items-center justify-center gap-1" title="Stock Local - Stock Vendido = Stock ERP">
                        Validação
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1">
                        Vendas
                        {!salesLoaded && (
                          <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px]" onClick={() => fetchSales()} disabled={salesLoading}>
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
                    const soldStock = getSoldStock(item.productCode);

                    return (
                      <>
                        <TableRow key={rowKey}>
                          <TableCell className="font-mono text-sm">{item.productCode}</TableCell>
                          <TableCell>
                            <div>{item.productName}</div>
                            {item.possibleMatch && (
                              <div className="mt-1 text-[11px] bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded px-2 py-1">
                                <Copy className="h-3 w-3 inline mr-1 text-yellow-600" />
                                <span className="text-yellow-700 dark:text-yellow-300 font-medium">
                                  Possível duplicado {item.possibleMatch.source === 'local' ? 'local' : 'no ERP'}:
                                </span>{' '}
                                <span className="font-mono">{item.possibleMatch.code}</span>
                                {' — '}
                                <span>{item.possibleMatch.name}</span>
                                {' (stock: '}{item.possibleMatch.stock}{')'}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium">{item.erpStock}</TableCell>
                          <TableCell className="text-right font-medium">
                            {salesLoaded ? (
                              soldStock > 0 ? (
                                <span className="text-amber-600 font-semibold">{soldStock}</span>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
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
                          <TableCell className="text-center">
                            {salesLoaded ? (() => {
                              const result = item.localStock - soldStock - item.erpStock;
                              const isValid = result === 0;
                              return (
                                <div className="flex flex-col items-center gap-0.5">
                                  <Badge variant="secondary" className={isValid 
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 gap-1' 
                                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 gap-1'
                                  }>
                                    {isValid ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                                    {isValid ? 'Validado' : 'Divergente'}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground">
                                    {item.localStock} - {soldStock} - {item.erpStock} = {result}
                                  </span>
                                </div>
                              );
                            })() : (
                              <span className="text-xs text-muted-foreground italic">Aguarda vendas</span>
                            )}
                          </TableCell>
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
                                onClick={() => openCategoryDialog([item])}
                                disabled={registering.has(item.productCode)}
                              >
                                {registering.has(item.productCode) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                                Cadastrar
                              </Button>
                            )}
                            {item.status === 'duplicate_suspect' && item.possibleMatch && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs bg-yellow-50 text-yellow-800 border-yellow-300 hover:bg-yellow-100"
                                onClick={() => setUnifyConfirmItem(item)}
                                disabled={unifying.has(item.productCode)}
                              >
                                {unifying.has(item.productCode) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link className="h-3 w-3" />}
                                Unificar Código
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                        {isExpanded && salesCount > 0 && (
                          <TableRow key={`${rowKey}-sales`} className="bg-muted/30">
                            <TableCell colSpan={11} className="p-0">
                              <div className="px-4 py-3 space-y-1.5">
                                <p className="text-xs font-semibold text-muted-foreground mb-2">
                                  <ShoppingCart className="h-3 w-3 inline mr-1" />
                                  {salesCount} venda(s) ativa(s) — excluindo: conferido, produto entregue, levantado, cancelado
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
            <Button onClick={() => fetchAndCompare()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Sincronizar com ERP
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Selecionar Categoria</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {pendingRegisterItems.length === 1
                ? `Cadastrar "${pendingRegisterItems[0]?.productName}" no sistema local.`
                : `Cadastrar ${pendingRegisterItems.length} produto(s) no sistema local.`}
            </p>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Geral">Geral</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>Cancelar</Button>
            <Button onClick={confirmRegister} disabled={registering.size > 0}>
              {registering.size > 0 ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!unifyConfirmItem} onOpenChange={(open) => !open && setUnifyConfirmItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Unificação de Código</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Tem a certeza que deseja unificar este produto?</p>
                {unifyConfirmItem?.possibleMatch && (
                  <div className="rounded-md border p-3 space-y-1 text-sm">
                    <p><strong>Produto:</strong> {unifyConfirmItem.productName}</p>
                    {unifyConfirmItem.possibleMatch.source === 'local' ? (
                      <>
                        <p><strong>Código local atual:</strong> {unifyConfirmItem.possibleMatch.code}</p>
                        <p><strong>Será alterado para:</strong> {unifyConfirmItem.productCode} (código ERP)</p>
                      </>
                    ) : (
                      <>
                        <p><strong>Código local atual:</strong> {unifyConfirmItem.productCode}</p>
                        <p><strong>Será alterado para:</strong> {unifyConfirmItem.possibleMatch.code} (código ERP)</p>
                      </>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Esta ação não pode ser desfeita.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!unifyConfirmItem) return;
                setUnifying(prev => new Set(prev).add(unifyConfirmItem.productCode));
                setUnifyConfirmItem(null);
                await unifyDuplicate(unifyConfirmItem);
                setUnifying(prev => { const s = new Set(prev); s.delete(unifyConfirmItem.productCode); return s; });
              }}
            >
              Confirmar Unificação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
