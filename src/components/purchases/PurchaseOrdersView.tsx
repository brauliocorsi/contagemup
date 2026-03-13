import { useState, useMemo, useCallback } from 'react';
import { format, subDays } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Loader2, ShoppingBag, Package, Download, SortAsc, Trash2, AlertTriangle, CalendarIcon, Eye, EyeOff, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useProducts } from '@/hooks/useProducts';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

interface SoldItem {
  productCode: string;
  productName: string;
  totalSold: number;
  vendas: Array<{ codigo: string; cliente: string; situacao: string; quantidade: number }>;
}

const PAGES_PER_CHUNK = 20;

export function PurchaseOrdersView() {
  const [dateFrom, setDateFrom] = useState<Date>(subDays(new Date(), 1));
  const [dateTo, setDateTo] = useState<Date>(subDays(new Date(), 1));
  const [soldItems, setSoldItems] = useState<SoldItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [removedProducts, setRemovedProducts] = useState<Set<string>>(new Set());
  const [sortAlpha, setSortAlpha] = useState(true);
  const [showAll, setShowAll] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number } | null>(null);
  const { toast } = useToast();
  const { products } = useProducts();

  const localProductMap = useMemo(() => {
    const map = new Map<string, { id: string; code: string; name: string; current_stock: number }>();
    for (const p of products) {
      map.set(p.code.toLowerCase(), { id: p.id, code: p.code, name: p.name, current_stock: p.current_stock });
    }
    return map;
  }, [products]);

  const mergeSoldItems = useCallback((existing: SoldItem[], newItems: SoldItem[]): SoldItem[] => {
    const map = new Map<string, SoldItem>();
    for (const item of existing) {
      map.set(item.productCode.toLowerCase(), { ...item });
    }
    for (const item of newItems) {
      const key = item.productCode.toLowerCase();
      const ex = map.get(key);
      if (ex) {
        // Merge vendas, avoiding duplicates by codigo
        const existingCodigos = new Set(ex.vendas.map(v => v.codigo));
        for (const v of item.vendas) {
          if (!existingCodigos.has(v.codigo)) {
            ex.vendas.push(v);
            ex.totalSold += v.quantidade;
          }
        }
      } else {
        map.set(key, { ...item });
      }
    }
    return Array.from(map.values());
  }, []);

  const fetchPurchaseOrders = async () => {
    setLoading(true);
    setSoldItems([]);
    setLoaded(false);
    setRemovedProducts(new Set());
    setScanProgress(null);

    try {
      const dateFromStr = format(dateFrom, 'yyyy-MM-dd');
      const dateToStr = format(dateTo, 'yyyy-MM-dd');
      
      let allSoldItems: SoldItem[] = [];
      let startPage = 1;
      let hasMore = true;
      let totalPages = 0;

      while (hasMore) {
        const { data, error } = await supabase.functions.invoke('gestaoclick-purchase-orders', {
          body: { dateFrom: dateFromStr, dateTo: dateToStr, startPage, pagesPerChunk: PAGES_PER_CHUNK },
        });

        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);

        const chunkItems: SoldItem[] = data?.soldItems || [];
        allSoldItems = mergeSoldItems(allSoldItems, chunkItems);
        
        totalPages = data?.scannedPages?.total || totalPages;
        const scannedTo = data?.scannedPages?.to || startPage;
        
        setScanProgress({ current: scannedTo, total: totalPages });
        setSoldItems([...allSoldItems]);

        hasMore = data?.hasMorePages === true;
        startPage = data?.nextStartPage || (startPage + PAGES_PER_CHUNK);
        
        // Small delay between chunks
        if (hasMore) await new Promise(r => setTimeout(r, 200));
      }

      setLoaded(true);
      setScanProgress(null);

      toast({
        title: 'Pesquisa concluída',
        description: `${allSoldItems.length} produto(s) vendido(s). ${totalPages} página(s) varridas.`,
      });
    } catch (err: any) {
      console.error('Error fetching purchase orders:', err);
      toast({ title: 'Erro', description: err.message || 'Erro ao buscar vendas', variant: 'destructive' });
    } finally {
      setLoading(false);
      setScanProgress(null);
    }
  };

  const enrichedItems = useMemo(() => {
    const items = soldItems
      .filter(item => !removedProducts.has(item.productCode.toLowerCase()))
      .map(item => {
        const local = localProductMap.get(item.productCode.toLowerCase());
        const currentStock = local?.current_stock ?? 0;
        const stockAfterSale = currentStock - item.totalSold;
        return {
          ...item,
          localStock: currentStock,
          stockAfterSale,
          deficit: Math.abs(Math.min(0, stockAfterSale)),
          isRegistered: !!local,
        };
      });

    if (sortAlpha) {
      items.sort((a, b) => a.productName.localeCompare(b.productName, 'pt'));
    } else {
      items.sort((a, b) => b.deficit - a.deficit);
    }

    return items;
  }, [soldItems, localProductMap, removedProducts, sortAlpha]);

  const negativeStockItems = useMemo(() =>
    enrichedItems.filter(item => item.stockAfterSale < 0 || item.localStock < 0),
    [enrichedItems]
  );

  const displayItems = showAll ? enrichedItems : negativeStockItems;
  const totalDeficit = negativeStockItems.reduce((sum, p) => sum + p.deficit, 0);

  const handleRemoveProduct = (code: string) => {
    setRemovedProducts(prev => new Set(prev).add(code.toLowerCase()));
  };

  const toggleExpand = (code: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const handleRestoreAll = () => setRemovedProducts(new Set());

  const handleSetSingleDate = (d: Date) => {
    setDateFrom(d);
    setDateTo(d);
  };

  const exportToExcel = () => {
    const data = displayItems.map(p => ({
      'Código': p.productCode,
      'Produto': p.productName,
      'Nº Venda(s)': p.vendas.map(v => v.codigo).join(', '),
      'Vendido': p.totalSold,
      'Stock Atual': p.localStock,
      'Stock Após Venda': p.stockAfterSale,
      'Deficit (Comprar)': p.deficit,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Ordens de Compra');
    const fname = dateFrom === dateTo
      ? `compras_${format(dateFrom, 'yyyy-MM-dd')}.xlsx`
      : `compras_${format(dateFrom, 'yyyy-MM-dd')}_a_${format(dateTo, 'yyyy-MM-dd')}.xlsx`;
    XLSX.writeFile(wb, fname);
  };

  const isSameDate = format(dateFrom, 'yyyy-MM-dd') === format(dateTo, 'yyyy-MM-dd');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-primary" />
          Ordens de Compra
        </h2>
        <p className="text-sm text-muted-foreground">
          Produtos vendidos com stock negativo — necessidade de reposição
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Date From */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[160px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(dateFrom, 'dd/MM/yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={(d) => d && setDateFrom(d)} locale={pt} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>

            <span className="text-sm text-muted-foreground">até</span>

            {/* Date To */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[160px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(dateTo, 'dd/MM/yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={(d) => d && setDateTo(d)} locale={pt} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>

            {/* Quick presets */}
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="text-xs h-8 px-2" onClick={() => handleSetSingleDate(new Date())}>Hoje</Button>
              <Button variant="outline" size="sm" className="text-xs h-8 px-2" onClick={() => handleSetSingleDate(subDays(new Date(), 1))}>Ontem</Button>
              <Button variant="outline" size="sm" className="text-xs h-8 px-2" onClick={() => { setDateFrom(subDays(new Date(), 7)); setDateTo(new Date()); }}>7 dias</Button>
            </div>

            <Button onClick={fetchPurchaseOrders} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShoppingBag className="h-4 w-4 mr-2" />}
              {loading ? 'A varrer...' : 'Buscar Vendas'}
            </Button>

            {loaded && soldItems.length > 0 && (
              <Button variant={showAll ? 'default' : 'outline'} size="sm" onClick={() => setShowAll(!showAll)}>
                {showAll ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
                {showAll ? 'Todos' : 'Só Negativos'}
              </Button>
            )}

            {displayItems.length > 0 && (
              <>
                <Button variant="outline" onClick={exportToExcel}>
                  <Download className="h-4 w-4 mr-2" /> Exportar
                </Button>
                <Button variant={sortAlpha ? 'default' : 'outline'} size="sm" onClick={() => setSortAlpha(!sortAlpha)}>
                  <SortAsc className="h-4 w-4 mr-1" />
                  {sortAlpha ? 'A-Z' : 'Ordenar A-Z'}
                </Button>
                {removedProducts.size > 0 && (
                  <Button variant="ghost" size="sm" onClick={handleRestoreAll}>
                    Restaurar {removedProducts.size} removido(s)
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Scan progress */}
          {scanProgress && (
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>A varrer páginas... {scanProgress.current}/{scanProgress.total}</span>
                <span>{soldItems.length} produto(s) encontrado(s)</span>
              </div>
              <Progress value={(scanProgress.current / scanProgress.total) * 100} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      {loaded && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{soldItems.length}</p>
              <p className="text-xs text-muted-foreground">Produtos Vendidos</p>
            </CardContent>
          </Card>
          <Card className="border-destructive/50">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-destructive">{negativeStockItems.length}</p>
              <p className="text-xs text-muted-foreground">Com Stock Negativo</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{totalDeficit}</p>
              <p className="text-xs text-muted-foreground">Unidades a Comprar</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">
                {isSameDate ? format(dateFrom, 'dd/MM') : `${format(dateFrom, 'dd/MM')} - ${format(dateTo, 'dd/MM')}`}
              </p>
              <p className="text-xs text-muted-foreground">Período</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Product list */}
      {displayItems.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              {showAll ? 'Todos os Produtos Vendidos' : 'Produtos para Compra'}
              <Badge variant="secondary" className="text-xs ml-1">{displayItems.length}</Badge>
              {removedProducts.size > 0 && (
                <Badge variant="outline" className="text-xs ml-1">{removedProducts.size} removido(s)</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Nº Venda(s)</TableHead>
                    <TableHead className="text-right">Vendido</TableHead>
                    <TableHead className="text-right">Stock Atual</TableHead>
                    <TableHead className="text-right">Após Venda</TableHead>
                    <TableHead className="text-right text-destructive font-bold">Comprar</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayItems.map(p => (
                    <TableRow key={p.productCode}>
                      <TableCell className="font-mono text-sm">{p.productCode}</TableCell>
                      <TableCell>{p.productName}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {p.vendas.map((v, i) => (
                            <Badge key={i} variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                              #{v.codigo}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{p.totalSold}</TableCell>
                      <TableCell className="text-right">
                        <span className={cn("font-medium", p.localStock < 0 && "text-destructive")}>
                          {p.isRegistered ? p.localStock : '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn("font-medium", p.stockAfterSale < 0 && "text-destructive")}>
                          {p.stockAfterSale}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {p.deficit > 0 ? (
                          <Badge variant="destructive" className="font-bold">{p.deficit} un.</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleRemoveProduct(p.productCode)} title="Remover da lista">
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {loaded && negativeStockItems.length === 0 && soldItems.length > 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <ShoppingBag className="h-12 w-12 mx-auto text-green-600 mb-3" />
            <h3 className="text-lg font-semibold mb-1">Nenhum produto com stock negativo</h3>
            <p className="text-sm text-muted-foreground">
              Todos os {soldItems.length} produto(s) vendido(s) têm stock suficiente.
            </p>
          </CardContent>
        </Card>
      )}

      {loaded && soldItems.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="text-lg font-semibold mb-1">Sem vendas encontradas</h3>
            <p className="text-sm text-muted-foreground">
              Nenhuma venda registada para o período selecionado.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
