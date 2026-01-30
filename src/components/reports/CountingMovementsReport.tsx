import { useState, useMemo, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { Calendar as CalendarIcon, FileDown, Search, X, ClipboardList, User, ArrowUpDown, ArrowUp, ArrowDown, Plus, Minus, BarChart3, Trophy, AlertTriangle } from 'lucide-react';
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
import { ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessions } from '@/hooks/useSessions';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

interface CountingLog {
  id: string;
  product_id: string;
  session_id: string;
  colis_number: number;
  operation: string;
  quantity_before: number;
  quantity_after: number;
  counted_by: string | null;
  created_at: string;
  products?: {
    code: string;
    name: string;
    damaged_stock?: number;
  };
  counting_sessions?: {
    name: string;
  };
}

export function CountingMovementsReport() {
  const { sessions } = useSessions();
  const [isOpen, setIsOpen] = useState(true);
  const [logs, setLogs] = useState<CountingLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOperation, setFilterOperation] = useState<'all' | 'increment' | 'decrement'>('all');
  const [filterSession, setFilterSession] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [sortColumn, setSortColumn] = useState<'date' | 'product' | 'user' | null>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Fetch count logs
  useEffect(() => {
    const fetchLogs = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('count_logs')
          .select(`
            *,
            products (code, name, damaged_stock),
            counting_sessions (name)
          `)
          .order('created_at', { ascending: false })
          .limit(500);

        if (error) throw error;
        setLogs(data || []);
      } catch (error) {
        console.error('Error fetching count logs:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogs();
  }, []);

  // Fetch user names
  useEffect(() => {
    const fetchUserNames = async () => {
      const userIds = [...new Set(logs.filter(l => l.counted_by).map(l => l.counted_by!))];
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

    if (logs.length > 0) {
      fetchUserNames();
    }
  }, [logs]);

  const handleSort = (column: 'date' | 'product' | 'user') => {
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

  const getSortIcon = (column: 'date' | 'product' | 'user') => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 ml-1 text-primary" />
      : <ArrowDown className="h-4 w-4 ml-1 text-primary" />;
  };

  const filteredLogs = useMemo(() => {
    let result = logs;

    // Filter by operation type
    if (filterOperation !== 'all') {
      result = result.filter(l => l.operation === filterOperation);
    }

    // Filter by session
    if (filterSession !== 'all') {
      result = result.filter(l => l.session_id === filterSession);
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(l => 
        l.products?.code?.toLowerCase().includes(term) ||
        l.products?.name?.toLowerCase().includes(term) ||
        (l.counted_by && userNames[l.counted_by]?.toLowerCase().includes(term))
      );
    }

    // Filter by date range
    if (dateRange.from || dateRange.to) {
      result = result.filter(l => {
        const logDate = parseISO(l.created_at);
        if (dateRange.from && dateRange.to) {
          return isWithinInterval(logDate, { start: dateRange.from, end: dateRange.to });
        }
        if (dateRange.from) {
          return logDate >= dateRange.from;
        }
        if (dateRange.to) {
          return logDate <= dateRange.to;
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
          case 'user':
            const nameA = a.counted_by ? userNames[a.counted_by] || '' : '';
            const nameB = b.counted_by ? userNames[b.counted_by] || '' : '';
            comparison = nameA.localeCompare(nameB);
            break;
        }
        
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [logs, filterOperation, filterSession, searchTerm, dateRange, sortColumn, sortDirection, userNames]);

  // Statistics
  const stats = useMemo(() => {
    const increments = filteredLogs.filter(l => l.operation === 'increment');
    const decrements = filteredLogs.filter(l => l.operation === 'decrement');
    
    const totalIncrements = increments.reduce((sum, l) => sum + (l.quantity_after - l.quantity_before), 0);
    const totalDecrements = decrements.reduce((sum, l) => sum + Math.abs(l.quantity_after - l.quantity_before), 0);
    
    const uniqueUsers = [...new Set(filteredLogs.filter(l => l.counted_by).map(l => l.counted_by))].length;
    
    // Damage statistics from unique products in logs
    const uniqueProducts = new Map<string, { damaged_stock: number }>();
    filteredLogs.forEach(l => {
      if (l.products && !uniqueProducts.has(l.product_id)) {
        uniqueProducts.set(l.product_id, { damaged_stock: l.products.damaged_stock || 0 });
      }
    });
    const productsWithDamages = [...uniqueProducts.values()].filter(p => p.damaged_stock > 0).length;
    const totalDamagedUnits = [...uniqueProducts.values()].reduce((sum, p) => sum + p.damaged_stock, 0);

    return {
      totalOperations: filteredLogs.length,
      incrementsCount: increments.length,
      decrementsCount: decrements.length,
      totalIncrements,
      totalDecrements,
      balance: totalIncrements - totalDecrements,
      uniqueUsers,
      productsWithDamages,
      totalDamagedUnits,
    };
  }, [filteredLogs]);

  // Productivity data per user
  const productivityData = useMemo(() => {
    const userStats: Record<string, { operations: number; increments: number; decrements: number; volume: number }> = {};
    
    filteredLogs.forEach(log => {
      const userId = log.counted_by || 'system';
      if (!userStats[userId]) {
        userStats[userId] = { operations: 0, increments: 0, decrements: 0, volume: 0 };
      }
      userStats[userId].operations += 1;
      if (log.operation === 'increment') {
        userStats[userId].increments += 1;
        userStats[userId].volume += (log.quantity_after - log.quantity_before);
      } else {
        userStats[userId].decrements += 1;
        userStats[userId].volume += Math.abs(log.quantity_after - log.quantity_before);
      }
    });

    return Object.entries(userStats)
      .map(([userId, data]) => ({
        userId,
        name: userId === 'system' ? 'Sistema' : (userNames[userId] || 'Desconhecido'),
        ...data,
      }))
      .sort((a, b) => b.operations - a.operations);
  }, [filteredLogs, userNames]);

  // Top performers
  const topPerformers = useMemo(() => {
    return productivityData
      .filter(u => u.userId !== 'system')
      .slice(0, 3);
  }, [productivityData]);

  const [showChart, setShowChart] = useState(true);
  const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

  const clearFilters = () => {
    setSearchTerm('');
    setFilterOperation('all');
    setFilterSession('all');
    setDateRange({ from: undefined, to: undefined });
  };

  const hasActiveFilters = searchTerm || filterOperation !== 'all' || filterSession !== 'all' || dateRange.from || dateRange.to;

  const exportToCSV = () => {
    if (filteredLogs.length === 0) return;

    const headers = ['Data', 'Hora', 'Operação', 'Código', 'Produto', 'Coli', 'Antes', 'Depois', 'Alteração', 'Sessão', 'Funcionário'];
    const rows = filteredLogs.map(l => [
      format(new Date(l.created_at), 'dd/MM/yyyy'),
      format(new Date(l.created_at), 'HH:mm:ss'),
      l.operation === 'increment' ? 'Incremento' : 'Decremento',
      l.products?.code || '',
      l.products?.name || '',
      l.colis_number,
      l.quantity_before,
      l.quantity_after,
      l.operation === 'increment' ? `+${l.quantity_after - l.quantity_before}` : `-${Math.abs(l.quantity_after - l.quantity_before)}`,
      l.counting_sessions?.name || '',
      l.counted_by ? userNames[l.counted_by] || 'Desconhecido' : 'Sistema',
    ]);

    // Summary rows
    const summaryRows = [
      [],
      ['RESUMO'],
      ['Total de operações', stats.totalOperations],
      ['Incrementos', stats.incrementsCount],
      ['Decrementos', stats.decrementsCount],
      ['Total adicionado', `+${stats.totalIncrements}`],
      ['Total removido', `-${stats.totalDecrements}`],
      ['Balanço', stats.balance > 0 ? `+${stats.balance}` : stats.balance],
      ['Funcionários únicos', stats.uniqueUsers],
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
    a.download = `movimentos_contagem_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeSessions = sessions.filter(s => s.status === 'active' || s.status === 'completed');

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Relatório de Movimentos de Contagem
                <Badge variant="secondary">{logs.length} total</Badge>
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
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label>Pesquisar</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Código, produto, funcionário..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Operação</Label>
                <Select value={filterOperation} onValueChange={(v) => setFilterOperation(v as typeof filterOperation)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="increment">
                      <span className="flex items-center gap-2">
                        <Plus className="h-4 w-4 text-green-600" />
                        Incrementos
                      </span>
                    </SelectItem>
                    <SelectItem value="decrement">
                      <span className="flex items-center gap-2">
                        <Minus className="h-4 w-4 text-red-600" />
                        Decrementos
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Sessão</Label>
                <Select value={filterSession} onValueChange={setFilterSession}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {activeSessions.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
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
                  {filteredLogs.length} operações encontradas
                </span>
              </div>
              <Button onClick={exportToCSV} disabled={filteredLogs.length === 0}>
                <FileDown className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm text-muted-foreground">Total Operações</p>
                <p className="text-2xl font-bold">{stats.totalOperations}</p>
              </div>
              <div className="bg-green-50 dark:bg-green-950 rounded-lg p-3">
                <p className="text-sm text-green-600 dark:text-green-400">Incrementos</p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-300">+{stats.totalIncrements}</p>
                <p className="text-xs text-muted-foreground">{stats.incrementsCount} operações</p>
              </div>
              <div className="bg-red-50 dark:bg-red-950 rounded-lg p-3">
                <p className="text-sm text-red-600 dark:text-red-400">Decrementos</p>
                <p className="text-2xl font-bold text-red-700 dark:text-red-300">-{stats.totalDecrements}</p>
                <p className="text-xs text-muted-foreground">{stats.decrementsCount} operações</p>
              </div>
              <div className={`rounded-lg p-3 ${stats.balance >= 0 ? 'bg-blue-50 dark:bg-blue-950' : 'bg-orange-50 dark:bg-orange-950'}`}>
                <p className={`text-sm ${stats.balance >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'}`}>Balanço</p>
                <p className={`text-2xl font-bold ${stats.balance >= 0 ? 'text-blue-700 dark:text-blue-300' : 'text-orange-700 dark:text-orange-300'}`}>
                  {stats.balance > 0 ? '+' : ''}{stats.balance}
                </p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-950 rounded-lg p-3">
                <p className="text-sm text-purple-600 dark:text-purple-400">Funcionários</p>
                <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{stats.uniqueUsers}</p>
                <p className="text-xs text-muted-foreground">únicos</p>
              </div>
              <div className="bg-orange-50 dark:bg-orange-950 rounded-lg p-3">
                <p className="text-sm text-orange-600 dark:text-orange-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Prod. c/ Avarias
                </p>
                <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{stats.productsWithDamages}</p>
                {stats.totalDamagedUnits > 0 && (
                  <p className="text-xs text-muted-foreground">{stats.totalDamagedUnits} un. danificadas</p>
                )}
              </div>
            </div>

            {/* Productivity Chart Section */}
            {productivityData.length > 0 && (
              <Collapsible open={showChart} onOpenChange={setShowChart}>
                <div className="border rounded-lg">
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-primary" />
                        <span className="font-medium">Produtividade por Funcionário</span>
                        <Badge variant="outline">{productivityData.filter(u => u.userId !== 'system').length} funcionários</Badge>
                      </div>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        {showChart ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-4 pt-0 space-y-4">
                      {/* Top Performers */}
                      {topPerformers.length > 0 && (
                        <div className="flex flex-wrap gap-3">
                          {topPerformers.map((performer, index) => (
                            <div 
                              key={performer.userId}
                              className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-lg border",
                                index === 0 && "bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800",
                                index === 1 && "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700",
                                index === 2 && "bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800"
                              )}
                            >
                              <Trophy className={cn(
                                "h-4 w-4",
                                index === 0 && "text-yellow-500",
                                index === 1 && "text-slate-400",
                                index === 2 && "text-orange-500"
                              )} />
                              <div>
                                <p className="text-sm font-medium">{performer.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {performer.operations} ops • {performer.volume} unidades
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Charts */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Operations per User */}
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-muted-foreground">Operações por Funcionário</p>
                          <div className="h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart 
                                data={productivityData.filter(u => u.userId !== 'system').slice(0, 10)} 
                                layout="vertical"
                                margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis type="number" className="text-xs" />
                                <YAxis 
                                  type="category" 
                                  dataKey="name" 
                                  className="text-xs"
                                  width={75}
                                  tick={{ fontSize: 11 }}
                                />
                                <Tooltip 
                                  contentStyle={{ 
                                    backgroundColor: 'hsl(var(--background))',
                                    border: '1px solid hsl(var(--border))',
                                    borderRadius: '8px'
                                  }}
                                  formatter={(value: number, name: string) => {
                                    const labels: Record<string, string> = {
                                      increments: 'Incrementos',
                                      decrements: 'Decrementos'
                                    };
                                    return [value, labels[name] || name];
                                  }}
                                />
                                <Legend 
                                  formatter={(value) => {
                                    const labels: Record<string, string> = {
                                      increments: 'Incrementos',
                                      decrements: 'Decrementos'
                                    };
                                    return labels[value] || value;
                                  }}
                                />
                                <Bar dataKey="increments" stackId="a" fill="hsl(142, 76%, 36%)" name="increments" />
                                <Bar dataKey="decrements" stackId="a" fill="hsl(0, 84%, 60%)" name="decrements" />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* Volume per User */}
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-muted-foreground">Volume por Funcionário (unidades)</p>
                          <div className="h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart 
                                data={productivityData.filter(u => u.userId !== 'system').slice(0, 10)} 
                                layout="vertical"
                                margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis type="number" className="text-xs" />
                                <YAxis 
                                  type="category" 
                                  dataKey="name" 
                                  className="text-xs"
                                  width={75}
                                  tick={{ fontSize: 11 }}
                                />
                                <Tooltip 
                                  contentStyle={{ 
                                    backgroundColor: 'hsl(var(--background))',
                                    border: '1px solid hsl(var(--border))',
                                    borderRadius: '8px'
                                  }}
                                  formatter={(value: number) => [value, 'Volume']}
                                />
                                <Bar dataKey="volume" fill="hsl(var(--primary))">
                                  {productivityData.filter(u => u.userId !== 'system').slice(0, 10).map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>

                      {/* Detailed Table */}
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Funcionário</TableHead>
                              <TableHead className="text-right">Operações</TableHead>
                              <TableHead className="text-right">Incrementos</TableHead>
                              <TableHead className="text-right">Decrementos</TableHead>
                              <TableHead className="text-right">Volume Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {productivityData.filter(u => u.userId !== 'system').map((user) => (
                              <TableRow key={user.userId}>
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                    {user.name}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">{user.operations}</TableCell>
                                <TableCell className="text-right text-green-600">+{user.increments}</TableCell>
                                <TableCell className="text-right text-red-600">-{user.decrements}</TableCell>
                                <TableCell className="text-right font-medium">{user.volume}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )}

            {/* Table */}
            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">A carregar...</p>
            ) : filteredLogs.length === 0 ? (
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
                      <TableHead>Operação</TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort('product')}
                      >
                        <span className="flex items-center">
                          Produto
                          {getSortIcon('product')}
                        </span>
                      </TableHead>
                      <TableHead className="text-center">Coli</TableHead>
                      <TableHead className="text-right">Alteração</TableHead>
                      <TableHead>Sessão</TableHead>
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
                    {filteredLogs.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="whitespace-nowrap">
                          <div>
                            <p className="text-sm">{format(new Date(l.created_at), 'dd/MM/yy')}</p>
                            <p className="text-xs text-muted-foreground">{format(new Date(l.created_at), 'HH:mm:ss')}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {l.operation === 'increment' ? (
                            <Badge className="bg-green-600 gap-1">
                              <Plus className="h-3 w-3" />
                              Incremento
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1">
                              <Minus className="h-3 w-3" />
                              Decremento
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-mono text-sm">{l.products?.code || '-'}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                              {l.products?.name || '-'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">#{l.colis_number}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="text-sm">
                            <span className="text-muted-foreground">{l.quantity_before}</span>
                            <span className="mx-1">→</span>
                            <span className="font-medium">{l.quantity_after}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-muted-foreground truncate max-w-[100px]">
                            {l.counting_sessions?.name || '-'}
                          </p>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm">
                              {l.counted_by ? userNames[l.counted_by] || 'Carregando...' : 'Sistema'}
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
