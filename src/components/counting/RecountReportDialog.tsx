import { useState, useCallback, useMemo } from 'react';
import { format, startOfDay, endOfDay } from 'date-fns';
import { pt } from 'date-fns/locale';
import { CalendarIcon, ClipboardList, Download, ArrowUpCircle, ArrowDownCircle, User, Clock, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

interface CountLogEntry {
  id: string;
  product_id: string;
  session_id: string;
  colis_number: number;
  operation: string;
  quantity_before: number;
  quantity_after: number;
  counted_by: string | null;
  created_at: string;
  product_code: string;
  product_name: string;
  user_name: string | null;
}

interface RecountReportDialogProps {
  sessionId: string;
}

export function RecountReportDialog({ sessionId }: RecountReportDialogProps) {
  const [open, setOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date>(new Date());
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [logs, setLogs] = useState<CountLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const from = startOfDay(dateFrom).toISOString();
      const to = endOfDay(dateTo).toISOString();

      const { data, error } = await supabase
        .from('count_logs')
        .select(`
          id,
          product_id,
          session_id,
          colis_number,
          operation,
          quantity_before,
          quantity_after,
          counted_by,
          created_at
        `)
        .eq('session_id', sessionId)
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch product details and user names
      const productIds = [...new Set((data || []).map(l => l.product_id))];
      const userIds = [...new Set((data || []).filter(l => l.counted_by).map(l => l.counted_by!))];

      const [productsRes, profilesRes] = await Promise.all([
        productIds.length > 0
          ? supabase.from('products').select('id, code, name').in('id', productIds)
          : Promise.resolve({ data: [] }),
        userIds.length > 0
          ? supabase.from('profiles').select('user_id, name').in('user_id', userIds)
          : Promise.resolve({ data: [] }),
      ]);

      const productMap: Record<string, { code: string; name: string }> = {};
      (productsRes.data || []).forEach(p => { productMap[p.id] = { code: p.code, name: p.name }; });

      const userMap: Record<string, string> = {};
      (profilesRes.data || []).forEach(p => { userMap[p.user_id] = p.name; });

      const enriched: CountLogEntry[] = (data || []).map(l => ({
        ...l,
        product_code: productMap[l.product_id]?.code || '—',
        product_name: productMap[l.product_id]?.name || '—',
        user_name: l.counted_by ? (userMap[l.counted_by] || 'Desconhecido') : null,
      }));

      setLogs(enriched);
      setFetched(true);
    } catch (err) {
      console.error('Error fetching recount report:', err);
      toast.error('Erro ao carregar relatório');
    } finally {
      setLoading(false);
    }
  }, [sessionId, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const uniqueProducts = new Set(logs.map(l => l.product_id));
    const increments = logs.filter(l => l.operation === 'increment');
    const decrements = logs.filter(l => l.operation === 'decrement');
    const uniqueUsers = new Set(logs.filter(l => l.counted_by).map(l => l.counted_by));
    return {
      totalOps: logs.length,
      products: uniqueProducts.size,
      increments: increments.length,
      decrements: decrements.length,
      users: uniqueUsers.size,
    };
  }, [logs]);

  const exportCSV = useCallback(() => {
    if (logs.length === 0) return;
    const header = 'Data;Hora;Código;Produto;Coli;Operação;Antes;Depois;Diferença;Utilizador';
    const rows = logs.map(l => {
      const d = new Date(l.created_at);
      const diff = l.quantity_after - l.quantity_before;
      return [
        format(d, 'dd/MM/yyyy'),
        format(d, 'HH:mm:ss'),
        l.product_code,
        `"${l.product_name}"`,
        l.colis_number,
        l.operation === 'increment' ? 'Incremento' : 'Decremento',
        l.quantity_before,
        l.quantity_after,
        diff > 0 ? `+${diff}` : diff,
        l.user_name || '—',
      ].join(';');
    });

    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recontagem_${format(dateFrom, 'yyyy-MM-dd')}_${format(dateTo, 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Relatório exportado');
  }, [logs, dateFrom, dateTo]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <ClipboardList className="h-4 w-4" />
          <span className="hidden sm:inline">Relatório Recontagem</span>
          <span className="sm:hidden">Relatório</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Relatório de Recontagem
          </DialogTitle>
        </DialogHeader>

        {/* Date range pickers */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">De</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                  {format(dateFrom, 'dd/MM/yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={(d) => d && setDateFrom(d)} initialFocus className="p-3 pointer-events-auto" locale={pt} />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Até</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                  {format(dateTo, 'dd/MM/yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={(d) => d && setDateTo(d)} initialFocus className="p-3 pointer-events-auto" locale={pt} />
              </PopoverContent>
            </Popover>
          </div>
          <Button size="sm" onClick={fetchReport} disabled={loading}>
            {loading ? 'A carregar...' : 'Gerar Relatório'}
          </Button>
          {logs.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5 ml-auto">
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
          )}
        </div>

        {/* Stats summary */}
        {fetched && !loading && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="bg-muted/50 rounded-lg p-2.5 text-center">
              <p className="text-lg font-bold">{stats.totalOps}</p>
              <p className="text-xs text-muted-foreground">Operações</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-2.5 text-center">
              <p className="text-lg font-bold">{stats.products}</p>
              <p className="text-xs text-muted-foreground">Produtos</p>
            </div>
            <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-2.5 text-center">
              <p className="text-lg font-bold text-green-700 dark:text-green-400">{stats.increments}</p>
              <p className="text-xs text-muted-foreground">Incrementos</p>
            </div>
            <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-2.5 text-center">
              <p className="text-lg font-bold text-red-700 dark:text-red-400">{stats.decrements}</p>
              <p className="text-xs text-muted-foreground">Decrementos</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-2.5 text-center">
              <p className="text-lg font-bold">{stats.users}</p>
              <p className="text-xs text-muted-foreground">Utilizadores</p>
            </div>
          </div>
        )}

        {/* Log entries */}
        <ScrollArea className="flex-1 min-h-0">
          {loading && (
            <div className="space-y-2 p-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          )}

          {fetched && !loading && logs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ClipboardList className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">Nenhuma operação encontrada neste período.</p>
            </div>
          )}

          {!loading && logs.length > 0 && (
            <div className="space-y-1.5 p-1">
              {logs.map(log => {
                const diff = log.quantity_after - log.quantity_before;
                const isIncrement = log.operation === 'increment';
                return (
                  <div
                    key={log.id}
                    className={cn(
                      "flex items-start gap-3 p-2.5 rounded-lg border text-sm",
                      isIncrement ? "border-green-200 dark:border-green-900/40 bg-green-50/50 dark:bg-green-950/20" : "border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20"
                    )}
                  >
                    {isIncrement ? (
                      <ArrowUpCircle className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />
                    ) : (
                      <ArrowDownCircle className="h-4 w-4 mt-0.5 text-red-600 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">{log.product_code}</span>
                        <span className="font-medium truncate">{log.product_name}</span>
                        <Badge variant="outline" className="text-xs">Coli {log.colis_number}</Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(log.created_at), "dd/MM HH:mm:ss", { locale: pt })}
                        </span>
                        <span>
                          {log.quantity_before} → {log.quantity_after}
                          <span className={cn("ml-1 font-semibold", isIncrement ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400")}>
                            ({diff > 0 ? `+${diff}` : diff})
                          </span>
                        </span>
                        {log.user_name && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {log.user_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
