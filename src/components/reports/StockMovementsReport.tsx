import { useState, useMemo, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Calendar as CalendarIcon, FileDown, TrendingUp, TrendingDown, Search, Filter, X, User, AlertTriangle } from 'lucide-react';
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
import { ChevronDown, ChevronUp, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useStockMovements, StockMovement } from '@/hooks/useStockMovements';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

export function StockMovementsReport() {
  const { movements, isLoading } = useStockMovements();
  const [isOpen, setIsOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'entrada' | 'saida'>('all');
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [sortColumn, setSortColumn] = useState<'date' | 'product' | 'quantity' | 'user' | null>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  // Fetch user names for movements
  useEffect(() => {
    const fetchUserNames = async () => {
      const userIds = [...new Set(movements.filter(m => m.created_by).map(m => m.created_by!))];
      if (userIds.length === 0) return;

      const { data } = await supabase
        .from('profiles')
        .select('user_id, name')
        .in('user_id', userIds);

      if (data) {
        const names: Record<string, string> = {};
        data.forEach(profile => {
          names[profile.user_id] = profile.name;
        });
        setUserNames(names);
      }
    };

    if (movements.length > 0) {
      fetchUserNames();
    }
  }, [movements]);

  const handleSort = (column: 'date' | 'product' | 'quantity' | 'user') => {
    if (sortColumn === column) {
      if (sortDirection === 'desc') {
        setSortDirection('asc');
      } else {
        setSortColumn(null);
        setSortDirection('desc');
      }
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (column: 'date' | 'product' | 'quantity' | 'user') => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 ml-1 text-primary" />
      : <ArrowDown className="h-4 w-4 ml-1 text-primary" />;
  };

  const filteredMovements = useMemo(() => {
    let result = movements;

    // Filter by type
    if (filterType !== 'all') {
      result = result.filter(m => m.movement_type === filterType);
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(m => 
        m.products?.code?.toLowerCase().includes(term) ||
        m.products?.name?.toLowerCase().includes(term) ||
        m.reason?.toLowerCase().includes(term) ||
        m.reference?.toLowerCase().includes(term)
      );
    }

    // Filter by date range
    if (dateRange.from || dateRange.to) {
      result = result.filter(m => {
        const movementDate = parseISO(m.created_at);
        if (dateRange.from && dateRange.to) {
          return isWithinInterval(movementDate, { start: dateRange.from, end: dateRange.to });
        }
        if (dateRange.from) {
          return movementDate >= dateRange.from;
        }
        if (dateRange.to) {
          return movementDate <= dateRange.to;
        }
        return true;
      });
    }

    // Apply sorting
    if (sortColumn) {
      result = [...result].sort((a, b) => {
        let comparison = 0;
        
        switch (sortColumn) {
          case 'date':
            comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            break;
          case 'product':
            comparison = (a.products?.name || '').localeCompare(b.products?.name || '');
            break;
          case 'quantity':
            comparison = a.quantity - b.quantity;
            break;
          case 'user':
            const nameA = a.created_by ? userNames[a.created_by] || '' : '';
            const nameB = b.created_by ? userNames[b.created_by] || '' : '';
            comparison = nameA.localeCompare(nameB);
            break;
        }
        
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [movements, filterType, searchTerm, dateRange, sortColumn, sortDirection, userNames]);

  // Statistics
  const stats = useMemo(() => {
    const entries = filteredMovements.filter(m => m.movement_type === 'entrada');
    const exits = filteredMovements.filter(m => m.movement_type === 'saida');
    
    const totalEntries = entries.reduce((sum, m) => sum + m.quantity, 0);
    const totalExits = exits.reduce((sum, m) => sum + m.quantity, 0);
    const balance = totalEntries - totalExits;
    
    // Damage statistics from unique products in movements
    const uniqueProducts = new Map<string, { damaged_stock: number }>();
    filteredMovements.forEach(m => {
      if (m.products && !uniqueProducts.has(m.product_id)) {
        uniqueProducts.set(m.product_id, { damaged_stock: m.products.damaged_stock || 0 });
      }
    });
    const productsWithDamages = [...uniqueProducts.values()].filter(p => p.damaged_stock > 0).length;
    const totalDamagedUnits = [...uniqueProducts.values()].reduce((sum, p) => sum + p.damaged_stock, 0);

    return {
      totalMovements: filteredMovements.length,
      entriesCount: entries.length,
      exitsCount: exits.length,
      totalEntries,
      totalExits,
      balance,
      productsWithDamages,
      totalDamagedUnits,
    };
  }, [filteredMovements]);

  const clearFilters = () => {
    setSearchTerm('');
    setFilterType('all');
    setDateRange({ from: undefined, to: undefined });
  };

  const hasActiveFilters = searchTerm || filterType !== 'all' || dateRange.from || dateRange.to;

  const exportToCSV = () => {
    if (filteredMovements.length === 0) return;

    const headers = ['Data', 'Hora', 'Tipo', 'Código', 'Produto', 'Quantidade', 'Motivo', 'Referência', 'Funcionário'];
    const rows = filteredMovements.map(m => [
      format(new Date(m.created_at), 'dd/MM/yyyy'),
      format(new Date(m.created_at), 'HH:mm'),
      m.movement_type === 'entrada' ? 'Entrada' : 'Saída',
      m.products?.code || '',
      m.products?.name || '',
      m.movement_type === 'entrada' ? `+${m.quantity}` : `-${m.quantity}`,
      m.reason || '',
      m.reference || '',
      m.created_by ? userNames[m.created_by] || 'Desconhecido' : 'Sistema',
    ]);

    // Summary rows
    const summaryRows = [
      [],
      ['RESUMO'],
      ['Total de movimentos', stats.totalMovements],
      ['Total entradas', stats.totalEntries],
      ['Total saídas', stats.totalExits],
      ['Balanço', stats.balance > 0 ? `+${stats.balance}` : stats.balance],
    ];

    const csv = [...[headers], ...rows, ...summaryRows]
      .map(row => row.map(cell => `"${cell}"`).join(';'))
      .join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = dateRange.from && dateRange.to
      ? `${format(dateRange.from, 'yyyy-MM-dd')}_${format(dateRange.to, 'yyyy-MM-dd')}`
      : format(new Date(), 'yyyy-MM-dd');
    a.download = `movimentos_stock_${dateStr}.csv`;
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
                <TrendingUp className="h-4 w-4" />
                Relatório de Movimentos de Stock
                <Badge variant="secondary">{movements.length} total</Badge>
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
                    placeholder="Código, nome, motivo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={filterType} onValueChange={(v) => setFilterType(v as typeof filterType)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="entrada">
                      <span className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-600" />
                        Entradas
                      </span>
                    </SelectItem>
                    <SelectItem value="saida">
                      <span className="flex items-center gap-2">
                        <TrendingDown className="h-4 w-4 text-red-600" />
                        Saídas
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
                  {filteredMovements.length} movimentos encontrados
                </span>
              </div>
              <Button onClick={exportToCSV} disabled={filteredMovements.length === 0}>
                <FileDown className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm text-muted-foreground">Total Movimentos</p>
                <p className="text-2xl font-bold">{stats.totalMovements}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-sm text-green-600">Entradas</p>
                <p className="text-2xl font-bold text-green-700">+{stats.totalEntries}</p>
                <p className="text-xs text-muted-foreground">{stats.entriesCount} operações</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3">
                <p className="text-sm text-red-600">Saídas</p>
                <p className="text-2xl font-bold text-red-700">-{stats.totalExits}</p>
                <p className="text-xs text-muted-foreground">{stats.exitsCount} operações</p>
              </div>
              <div className={`rounded-lg p-3 ${stats.balance >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
                <p className={`text-sm ${stats.balance >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>Balanço</p>
                <p className={`text-2xl font-bold ${stats.balance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                  {stats.balance > 0 ? '+' : ''}{stats.balance}
                </p>
              </div>
              <div className="bg-orange-50 rounded-lg p-3">
                <p className="text-sm text-orange-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Prod. c/ Avarias
                </p>
                <p className="text-2xl font-bold text-orange-700">{stats.productsWithDamages}</p>
                {stats.totalDamagedUnits > 0 && (
                  <p className="text-xs text-muted-foreground">{stats.totalDamagedUnits} un. danificadas</p>
                )}
              </div>
            </div>

            {/* Table */}
            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">A carregar...</p>
            ) : filteredMovements.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum movimento encontrado com os filtros aplicados.
              </p>
            ) : (
              <div className="rounded-md border max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort('date')}
                      >
                        <span className="flex items-center">
                          Data
                          {getSortIcon('date')}
                        </span>
                      </TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort('product')}
                      >
                        <span className="flex items-center">
                          Produto
                          {getSortIcon('product')}
                        </span>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50 select-none text-right"
                        onClick={() => handleSort('quantity')}
                      >
                        <span className="flex items-center justify-end">
                          Qtd
                          {getSortIcon('quantity')}
                        </span>
                      </TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Referência</TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort('user')}
                      >
                        <span className="flex items-center">
                          <User className="h-4 w-4 mr-1" />
                          Funcionário
                          {getSortIcon('user')}
                        </span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMovements.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap">
                          <div>
                            <p className="text-sm">{format(new Date(m.created_at), 'dd/MM/yy')}</p>
                            <p className="text-xs text-muted-foreground">{format(new Date(m.created_at), 'HH:mm')}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {m.movement_type === 'entrada' ? (
                            <Badge className="bg-green-600 gap-1">
                              <TrendingUp className="h-3 w-3" />
                              Entrada
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1">
                              <TrendingDown className="h-3 w-3" />
                              Saída
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-mono text-sm">{m.products?.code || '-'}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                              {m.products?.name || '-'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={m.movement_type === 'entrada' ? 'default' : 'destructive'}
                            className={m.movement_type === 'entrada' ? 'bg-green-600' : ''}
                          >
                            {m.movement_type === 'entrada' ? '+' : '-'}{m.quantity}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                          {m.reason || '-'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                          {m.reference || '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm">
                              {m.created_by ? userNames[m.created_by] || 'Carregando...' : 'Sistema'}
                            </span>
                          </div>
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
