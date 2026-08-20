import { useState, useMemo, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Calendar as CalendarIcon, FileDown, Search, ClipboardList, CheckCircle2, AlertCircle, Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useProducts } from '@/hooks/useProducts';

interface OrderEntry {
  id: string;
  product_id: string;
  order_number: string;
  colis_status: Record<string, boolean>;
  location: string | null;
  
  created_at: string;
  product_code?: string;
  product_name?: string;
  is_complete: boolean;
  total_colis: number;
  present_colis: number;
}

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

export function OrdersReport() {
  const { products } = useProducts();
  const [orders, setOrders] = useState<OrderEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'complete' | 'incomplete'>('all');
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  // Fetch orders
  useEffect(() => {
    const fetchOrders = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('stock_order_numbers')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Map orders with product info
        const ordersWithProducts: OrderEntry[] = (data || []).map(order => {
          const product = products.find(p => p.id === order.product_id);
          const colisStatus = order.colis_status as Record<string, boolean> || {};
          const totalColis = product?.total_colis || Object.keys(colisStatus).length || 1;
          const presentColis = Object.values(colisStatus).filter(v => v === true).length;
          const isComplete = presentColis >= totalColis && Object.keys(colisStatus).length >= totalColis;

          return {
            id: order.id,
            product_id: order.product_id,
            order_number: order.order_number,
            colis_status: colisStatus,
            location: order.location,
            created_at: order.created_at,
            product_code: product?.code,
            product_name: product?.name,
            is_complete: isComplete,
            total_colis: totalColis,
            present_colis: presentColis,
          };
        });

        setOrders(ordersWithProducts);
      } catch (error) {
        console.error('Error fetching orders:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (products.length > 0) {
      fetchOrders();
    }
  }, [products]);

  const filteredOrders = useMemo(() => {
    let result = orders;

    // Filter by status
    if (filterStatus !== 'all') {
      result = result.filter(o => 
        filterStatus === 'complete' ? o.is_complete : !o.is_complete
      );
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(o => 
        o.order_number.toLowerCase().includes(term) ||
        o.product_code?.toLowerCase().includes(term) ||
        o.product_name?.toLowerCase().includes(term)
      );
    }

    // Filter by date range
    if (dateRange.from || dateRange.to) {
      result = result.filter(o => {
        const orderDate = parseISO(o.created_at);
        if (dateRange.from && dateRange.to) {
          return isWithinInterval(orderDate, { start: dateRange.from, end: dateRange.to });
        }
        if (dateRange.from) {
          return orderDate >= dateRange.from;
        }
        if (dateRange.to) {
          return orderDate <= dateRange.to;
        }
        return true;
      });
    }

    return result;
  }, [orders, filterStatus, searchTerm, dateRange]);

  // Statistics
  const stats = useMemo(() => {
    const complete = filteredOrders.filter(o => o.is_complete);
    const incomplete = filteredOrders.filter(o => !o.is_complete);
    const uniqueProducts = new Set(filteredOrders.map(o => o.product_id)).size;

    return {
      total: filteredOrders.length,
      complete: complete.length,
      incomplete: incomplete.length,
      uniqueProducts,
    };
  }, [filteredOrders]);

  const clearFilters = () => {
    setSearchTerm('');
    setFilterStatus('all');
    setDateRange({ from: undefined, to: undefined });
  };

  const hasActiveFilters = searchTerm || filterStatus !== 'all' || dateRange.from || dateRange.to;

  const exportToCSV = () => {
    if (filteredOrders.length === 0) return;

    const headers = ['Nº Encomenda', 'Código Produto', 'Nome Produto', 'Status', 'Colis Presentes', 'Total Colis', 'Localização', 'Data'];
    const rows = filteredOrders.map(o => [
      o.order_number,
      o.product_code || '',
      o.product_name || '',
      o.is_complete ? 'Completa' : 'Incompleta',
      o.present_colis.toString(),
      o.total_colis.toString(),
      o.location || '',
      format(new Date(o.created_at), 'dd/MM/yyyy HH:mm'),
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(';'))
      .join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `encomendas_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Relatório de Encomendas
                <Badge variant="secondary">{orders.length} total</Badge>
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Pesquisar</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Nº encomenda, código..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="complete">
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        Completas
                      </span>
                    </SelectItem>
                    <SelectItem value="incomplete">
                      <span className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-orange-600" />
                        Incompletas
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Data Início</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateRange.from && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange.from ? format(dateRange.from, "dd/MM/yyyy") : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateRange.from}
                      onSelect={(date) => setDateRange(prev => ({ ...prev, from: date }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Data Fim</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateRange.to && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange.to ? format(dateRange.to, "dd/MM/yyyy") : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateRange.to}
                      onSelect={(date) => setDateRange(prev => ({ ...prev, to: date }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="h-4 w-4 mr-1" />
                    Limpar filtros
                  </Button>
                )}
                <span className="text-sm text-muted-foreground">
                  {filteredOrders.length} encomendas encontradas
                </span>
              </div>
              <Button onClick={exportToCSV} disabled={filteredOrders.length === 0}>
                <FileDown className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-sm text-green-600">Completas</p>
                <p className="text-2xl font-bold text-green-700">{stats.complete}</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-3">
                <p className="text-sm text-orange-600">Incompletas</p>
                <p className="text-2xl font-bold text-orange-700">{stats.incomplete}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-sm text-blue-600">Produtos Únicos</p>
                <p className="text-2xl font-bold text-blue-700">{stats.uniqueProducts}</p>
              </div>
            </div>

            {/* Table */}
            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">A carregar...</p>
            ) : filteredOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhuma encomenda encontrada.
              </p>
            ) : (
              <div className="rounded-md border max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>Nº Encomenda</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Colis</TableHead>
                      <TableHead>Localização</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((order) => (
                      <TableRow key={order.id} className={cn(!order.is_complete && "bg-orange-50/50")}>
                        <TableCell className="font-mono font-medium">
                          {order.order_number}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{order.product_code}</span>
                            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {order.product_name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {order.is_complete ? (
                            <Badge className="bg-green-100 text-green-700 border-green-300">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Completa
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-300">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Incompleta
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={cn(
                            "font-medium",
                            order.is_complete ? "text-green-700" : "text-orange-700"
                          )}>
                            {order.present_colis}/{order.total_colis}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5 text-xs">
                            {order.location && (
                              <span>{order.location}</span>
                            )}
                            {!order.location && (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(order.created_at), "dd/MM/yyyy HH:mm")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
