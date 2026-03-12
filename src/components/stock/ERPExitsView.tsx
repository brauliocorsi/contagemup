import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { CalendarIcon, Loader2, ShoppingCart, User, Package, Download, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

interface SaleExitItem {
  productCode: string;
  productName: string;
  quantity: number;
}

interface SaleExit {
  venda_id: string;
  codigo: string;
  cliente_nome: string;
  situacao: string;
  data: string;
  prazo_entrega: string;
  items: SaleExitItem[];
}

export function ERPExitsView() {
  const [date, setDate] = useState<Date>(new Date());
  const [salesExits, setSalesExits] = useState<SaleExit[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { toast } = useToast();

  const fetchScheduledExits = async (selectedDate: Date) => {
    setLoading(true);
    setSalesExits([]);
    setLoaded(false);

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const { data, error } = await supabase.functions.invoke('gestaoclick-scheduled-exits', {
        body: { date: dateStr },
      });

      if (error) throw new Error(error.message);

      setSalesExits(data?.salesExits || []);
      setLoaded(true);

      const total = data?.salesExits?.length || 0;
      toast({
        title: 'Pesquisa concluída',
        description: `${total} venda(s) agendada(s) para ${format(selectedDate, 'dd/MM/yyyy')}.`,
      });
    } catch (err: any) {
      console.error('Error fetching scheduled exits:', err);
      toast({ title: 'Erro', description: err.message || 'Erro ao buscar saídas agendadas', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDateSelect = (newDate: Date | undefined) => {
    if (newDate) {
      setDate(newDate);
    }
  };

  // Aggregate all products across all sales
  const aggregatedProducts = useMemo(() => {
    const map = new Map<string, { productCode: string; productName: string; totalQuantity: number; salesCount: number }>();
    for (const sale of salesExits) {
      for (const item of sale.items) {
        const key = item.productCode.toLowerCase();
        const existing = map.get(key);
        if (existing) {
          existing.totalQuantity += item.quantity;
          existing.salesCount++;
        } else {
          map.set(key, {
            productCode: item.productCode,
            productName: item.productName,
            totalQuantity: item.quantity,
            salesCount: 1,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);
  }, [salesExits]);

  const totalProducts = aggregatedProducts.reduce((sum, p) => sum + p.totalQuantity, 0);

  const exportToExcel = () => {
    // Sheet 1: By sale
    const salesData = salesExits.flatMap(sale =>
      sale.items.map(item => ({
        'Venda': sale.codigo,
        'Cliente': sale.cliente_nome,
        'Estado': sale.situacao,
        'Data Entrega': sale.prazo_entrega,
        'Código Produto': item.productCode,
        'Produto': item.productName,
        'Quantidade': item.quantity,
      }))
    );

    // Sheet 2: Aggregated
    const aggData = aggregatedProducts.map(p => ({
      'Código': p.productCode,
      'Produto': p.productName,
      'Quantidade Total': p.totalQuantity,
      'Nº Vendas': p.salesCount,
    }));

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(salesData);
    const ws2 = XLSX.utils.json_to_sheet(aggData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Por Venda');
    XLSX.utils.book_append_sheet(wb, ws2, 'Resumo Produtos');
    XLSX.writeFile(wb, `saidas_erp_${format(date, 'yyyy-MM-dd')}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Truck className="h-5 w-5 text-orange-600" />
          Saídas Agendadas do ERP
        </h2>
        <p className="text-sm text-muted-foreground">
          Produtos com entrega/levantamento agendado para o dia selecionado
        </p>
      </div>

      {/* Date picker + search */}
      <div className="flex flex-wrap items-center gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-[220px] justify-start text-left font-normal", !date && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date ? format(date, 'dd/MM/yyyy') : 'Selecionar data'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={handleDateSelect}
              locale={pt}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        <Button onClick={() => fetchScheduledExits(date)} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShoppingCart className="h-4 w-4 mr-2" />}
          {loading ? 'A carregar...' : 'Buscar Saídas'}
        </Button>

        {salesExits.length > 0 && (
          <Button variant="outline" onClick={exportToExcel}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        )}
      </div>

      {/* Summary */}
      {loaded && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{salesExits.length}</p>
              <p className="text-xs text-muted-foreground">Vendas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{aggregatedProducts.length}</p>
              <p className="text-xs text-muted-foreground">Produtos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{totalProducts}</p>
              <p className="text-xs text-muted-foreground">Unidades Total</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Aggregated product list (the "cart") */}
      {aggregatedProducts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              Lista de Produtos para Saída
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Qtd Total</TableHead>
                    <TableHead className="text-right">Nº Vendas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aggregatedProducts.map(p => (
                    <TableRow key={p.productCode}>
                      <TableCell className="font-mono text-sm">{p.productCode}</TableCell>
                      <TableCell>{p.productName}</TableCell>
                      <TableCell className="text-right font-bold">{p.totalQuantity}</TableCell>
                      <TableCell className="text-right">{p.salesCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sales detail */}
      {salesExits.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Detalhe por Venda</h3>
          {salesExits.map(sale => (
            <Card key={sale.venda_id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="font-mono font-bold">#{sale.codigo}</span>
                  <Badge variant="outline">{sale.situacao}</Badge>
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <User className="h-3 w-3" />
                    {sale.cliente_nome}
                  </span>
                  {sale.prazo_entrega && (
                    <span className="flex items-center gap-1 text-sm text-muted-foreground ml-auto">
                      <CalendarIcon className="h-3 w-3" />
                      {sale.prazo_entrega}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {sale.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{item.productCode}</span>
                        <span>{item.productName}</span>
                      </div>
                      <Badge variant="secondary" className="font-bold">{item.quantity} un.</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {loaded && salesExits.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Truck className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="text-lg font-semibold mb-1">Sem saídas agendadas</h3>
            <p className="text-sm text-muted-foreground">
              Nenhuma venda com entrega/levantamento agendado para {format(date, 'dd/MM/yyyy')}.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
