import { useState, useMemo, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { 
  Calendar as CalendarIcon, 
  FileDown, 
  TrendingUp, 
  TrendingDown, 
  Search, 
  X, 
  User, 
  Plus,
  Minus,
  Package,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter
} from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useStockMovements } from '@/hooks/useStockMovements';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

interface UnifiedMovement {
  id: string;
  type: 'entrada' | 'saida' | 'adicao' | 'remocao';
  source: 'manual' | 'contagem' | 'picking';
  product_code: string;
  product_name: string;
  quantity: number;
  created_at: string;
  created_by: string | null;
  reference?: string | null;
  notes?: string | null;
}

export function UnifiedMovementsReport() {
  const { movements: stockMovements, isLoading: stockLoading } = useStockMovements();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'entrada' | 'saida' | 'adicao' | 'remocao'>('all');
  const [filterEmployee, setFilterEmployee] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [sortColumn, setSortColumn] = useState<'date' | 'product' | 'quantity' | 'user'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  // Fetch count logs
  const { data: countLogs = [], isLoading: countLogsLoading } = useQuery({
    queryKey: ['count-logs-report'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('count_logs')
        .select(`
          *,
          products (code, name)
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      return data;
    },
  });

  // Fetch picking items
  const { data: pickingItems = [], isLoading: pickingLoading } = useQuery({
    queryKey: ['picking-items-report'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('picking_items')
        .select(`
          *,
          picking_sessions (created_by, reference, reason)
        `)
        .order('picked_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      return data;
    },
  });

  // Combine all movements
  const allMovements = useMemo((): UnifiedMovement[] => {
    const movements: UnifiedMovement[] = [];

    // Stock movements (manual entries/exits)
    stockMovements.forEach((m) => {
      movements.push({
        id: m.id,
        type: m.movement_type as 'entrada' | 'saida',
        source: 'manual',
        product_code: m.products?.code || '',
        product_name: m.products?.name || '',
        quantity: m.quantity,
        created_at: m.created_at,
        created_by: m.created_by,
        reference: m.reference,
        notes: m.notes,
      });
    });

    // Count logs (additions/removals)
    countLogs.forEach((c: any) => {
      const quantityChange = c.quantity_after - c.quantity_before;
      if (quantityChange !== 0) {
        movements.push({
          id: c.id,
          type: quantityChange > 0 ? 'adicao' : 'remocao',
          source: 'contagem',
          product_code: c.products?.code || '',
          product_name: c.products?.name || '',
          quantity: Math.abs(quantityChange),
          created_at: c.created_at,
          created_by: c.counted_by,
          notes: `Coli ${c.colis_number}`,
        });
      }
    });

    // Picking items (exits via picking)
    pickingItems.forEach((p: any) => {
      movements.push({
        id: p.id,
        type: 'saida',
        source: 'picking',
        product_code: p.product_code,
        product_name: p.product_name,
        quantity: p.quantity,
        created_at: p.picked_at,
        created_by: p.picking_sessions?.created_by || null,
        reference: p.picking_sessions?.reference,
        notes: p.picking_sessions?.reason,
      });
    });

    return movements;
  }, [stockMovements, countLogs, pickingItems]);

  // Fetch user names
  useEffect(() => {
    const fetchUserNames = async () => {
      const userIds = [...new Set(allMovements.filter(m => m.created_by).map(m => m.created_by!))];
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

    if (allMovements.length > 0) {
      fetchUserNames();
    }
  }, [allMovements]);

  // Unique employees for filter
  const uniqueEmployees = useMemo(() => {
    const employees = new Map<string, string>();
    allMovements.forEach(m => {
      if (m.created_by && userNames[m.created_by]) {
        employees.set(m.created_by, userNames[m.created_by]);
      }
    });
    return Array.from(employees.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allMovements, userNames]);

  const handleSort = (column: 'date' | 'product' | 'quantity' | 'user') => {
    if (sortColumn === column) {
      setSortDirection(d => d === 'desc' ? 'asc' : 'desc');
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
    let result = allMovements;

    // Filter by type
    if (filterType !== 'all') {
      result = result.filter(m => m.type === filterType);
    }

    // Filter by employee
    if (filterEmployee !== 'all') {
      result = result.filter(m => m.created_by === filterEmployee);
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(m => 
        m.product_code.toLowerCase().includes(term) ||
        m.product_name.toLowerCase().includes(term) ||
        m.reference?.toLowerCase().includes(term) ||
        (m.created_by && userNames[m.created_by]?.toLowerCase().includes(term))
      );
    }

    // Filter by date range
    if (dateRange.from || dateRange.to) {
      result = result.filter(m => {
        const movementDate = parseISO(m.created_at);
        if (dateRange.from && dateRange.to) {
          return isWithinInterval(movementDate, { start: dateRange.from, end: dateRange.to });
        }
        if (dateRange.from) return movementDate >= dateRange.from;
        if (dateRange.to) return movementDate <= dateRange.to;
        return true;
      });
    }

    // Sort
    result = [...result].sort((a, b) => {
      let comparison = 0;
      switch (sortColumn) {
        case 'date':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'product':
          comparison = a.product_name.localeCompare(b.product_name);
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

    return result;
  }, [allMovements, filterType, filterEmployee, searchTerm, dateRange, sortColumn, sortDirection, userNames]);

  // Statistics
  const stats = useMemo(() => {
    const entries = filteredMovements.filter(m => m.type === 'entrada' || m.type === 'adicao');
    const exits = filteredMovements.filter(m => m.type === 'saida' || m.type === 'remocao');
    
    const totalEntries = entries.reduce((sum, m) => sum + m.quantity, 0);
    const totalExits = exits.reduce((sum, m) => sum + m.quantity, 0);

    return {
      totalMovements: filteredMovements.length,
      entriesCount: entries.length,
      exitsCount: exits.length,
      totalEntries,
      totalExits,
      balance: totalEntries - totalExits,
    };
  }, [filteredMovements]);

  const clearFilters = () => {
    setSearchTerm('');
    setFilterType('all');
    setFilterEmployee('all');
    setDateRange({ from: undefined, to: undefined });
  };

  const hasActiveFilters = searchTerm || filterType !== 'all' || filterEmployee !== 'all' || dateRange.from || dateRange.to;

  const getTypeConfig = (type: UnifiedMovement['type']) => {
    switch (type) {
      case 'entrada':
        return { icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-100', label: 'Entrada' };
      case 'saida':
        return { icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-100', label: 'Saída' };
      case 'adicao':
        return { icon: Plus, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Adição' };
      case 'remocao':
        return { icon: Minus, color: 'text-orange-600', bg: 'bg-orange-100', label: 'Remoção' };
    }
  };

  const getSourceBadge = (source: UnifiedMovement['source']) => {
    switch (source) {
      case 'manual':
        return <Badge variant="outline" className="text-[10px]">Manual</Badge>;
      case 'contagem':
        return <Badge variant="secondary" className="text-[10px]">Contagem</Badge>;
      case 'picking':
        return <Badge className="text-[10px] bg-primary/20 text-primary">Picking</Badge>;
    }
  };

  const exportToCSV = () => {
    if (filteredMovements.length === 0) return;

    const headers = ['Data', 'Hora', 'Tipo', 'Origem', 'Código', 'Produto', 'Quantidade', 'Funcionário', 'Referência', 'Notas'];
    const rows = filteredMovements.map(m => {
      const typeConfig = getTypeConfig(m.type);
      const isPositive = m.type === 'entrada' || m.type === 'adicao';
      return [
        format(new Date(m.created_at), 'dd/MM/yyyy'),
        format(new Date(m.created_at), 'HH:mm'),
        typeConfig.label,
        m.source === 'manual' ? 'Manual' : m.source === 'contagem' ? 'Contagem' : 'Picking',
        m.product_code,
        m.product_name,
        isPositive ? `+${m.quantity}` : `-${m.quantity}`,
        m.created_by ? userNames[m.created_by] || 'Desconhecido' : 'Sistema',
        m.reference || '',
        m.notes || '',
      ];
    });

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `movimentos_unificados_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isLoading = stockLoading || countLogsLoading || pickingLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label>Pesquisar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Código, nome, referência..."
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
                  <SelectItem value="adicao">
                    <span className="flex items-center gap-2">
                      <Plus className="h-4 w-4 text-blue-600" />
                      Adições
                    </span>
                  </SelectItem>
                  <SelectItem value="remocao">
                    <span className="flex items-center gap-2">
                      <Minus className="h-4 w-4 text-orange-600" />
                      Remoções
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Funcionário</Label>
              <Select value={filterEmployee} onValueChange={setFilterEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {uniqueEmployees.map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      <span className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        {name}
                      </span>
                    </SelectItem>
                  ))}
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

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Limpar filtros
                </Button>
              )}
              <span className="text-sm text-muted-foreground">
                {filteredMovements.length} movimentos
              </span>
            </div>
            <Button onClick={exportToCSV} disabled={filteredMovements.length === 0}>
              <FileDown className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{stats.totalMovements}</p>
              <p className="text-sm text-muted-foreground">Total Movimentos</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-green-50 dark:bg-green-950/20">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-2xl font-bold text-green-700">+{stats.totalEntries}</p>
              <p className="text-sm text-muted-foreground">{stats.entriesCount} entradas/adições</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-red-50 dark:bg-red-950/20">
          <div className="flex items-center gap-3">
            <TrendingDown className="h-5 w-5 text-red-600" />
            <div>
              <p className="text-2xl font-bold text-red-700">-{stats.totalExits}</p>
              <p className="text-sm text-muted-foreground">{stats.exitsCount} saídas/remoções</p>
            </div>
          </div>
        </Card>
        <Card className={cn("p-4", stats.balance >= 0 ? "bg-blue-50 dark:bg-blue-950/20" : "bg-orange-50 dark:bg-orange-950/20")}>
          <div className="flex items-center gap-3">
            <Filter className={cn("h-5 w-5", stats.balance >= 0 ? "text-blue-600" : "text-orange-600")} />
            <div>
              <p className={cn("text-2xl font-bold", stats.balance >= 0 ? "text-blue-700" : "text-orange-700")}>
                {stats.balance > 0 ? '+' : ''}{stats.balance}
              </p>
              <p className="text-sm text-muted-foreground">Balanço</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border max-h-[500px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort('date')}
                  >
                    <span className="flex items-center">
                      Data/Hora
                      {getSortIcon('date')}
                    </span>
                  </TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Origem</TableHead>
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
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort('user')}
                  >
                    <span className="flex items-center">
                      Funcionário
                      {getSortIcon('user')}
                    </span>
                  </TableHead>
                  <TableHead>Referência</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMovements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum movimento encontrado com os filtros aplicados.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMovements.slice(0, 100).map((movement) => {
                    const typeConfig = getTypeConfig(movement.type);
                    const TypeIcon = typeConfig.icon;
                    const isPositive = movement.type === 'entrada' || movement.type === 'adicao';

                    return (
                      <TableRow key={`${movement.source}-${movement.id}`}>
                        <TableCell className="text-xs">
                          <div>{format(new Date(movement.created_at), 'dd/MM/yyyy')}</div>
                          <div className="text-muted-foreground">{format(new Date(movement.created_at), 'HH:mm')}</div>
                        </TableCell>
                        <TableCell>
                          <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md w-fit", typeConfig.bg)}>
                            <TypeIcon className={cn("h-3.5 w-3.5", typeConfig.color)} />
                            <span className={cn("text-xs font-medium", typeConfig.color)}>{typeConfig.label}</span>
                          </div>
                        </TableCell>
                        <TableCell>{getSourceBadge(movement.source)}</TableCell>
                        <TableCell>
                          <div className="text-xs">
                            <div className="font-mono">{movement.product_code}</div>
                            <div className="text-muted-foreground truncate max-w-[200px]">{movement.product_name}</div>
                          </div>
                        </TableCell>
                        <TableCell className={cn("text-right font-bold", isPositive ? "text-green-600" : "text-red-600")}>
                          {isPositive ? '+' : '-'}{movement.quantity}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-xs">
                            <User className="h-3 w-3 text-muted-foreground" />
                            {movement.created_by ? userNames[movement.created_by] || 'Desconhecido' : 'Sistema'}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                          {movement.reference || movement.notes || '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {filteredMovements.length > 100 && (
            <div className="p-2 text-center text-sm text-muted-foreground border-t">
              Mostrando 100 de {filteredMovements.length} movimentos. Use os filtros para refinar.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
