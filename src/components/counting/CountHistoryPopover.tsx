import { useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { useCountLogs, CountLog } from '@/hooks/useCountLogs';
import { supabase } from '@/integrations/supabase/client';
import { format, isSameDay, startOfDay, endOfDay } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Clock, Plus, Minus, User, Package, CalendarIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CountHistoryPopoverProps {
  productId: string;
  sessionId?: string;
  children: React.ReactNode;
}

export function CountHistoryPopover({ productId, sessionId, children }: CountHistoryPopoverProps) {
  const { logs, loading, fetchLogsForProduct } = useCountLogs();
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [showCalendar, setShowCalendar] = useState(false);

  useEffect(() => {
    if (open && productId) {
      fetchLogsForProduct(productId, sessionId);
    }
  }, [open, productId, sessionId, fetchLogsForProduct]);

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

  // Filter logs by selected date
  const filteredLogs = selectedDate
    ? logs.filter(log => isSameDay(new Date(log.created_at), selectedDate))
    : logs;

  // Get unique dates from logs for highlighting in calendar
  const logDates = logs.map(log => startOfDay(new Date(log.created_at)));

  const handleClearFilter = () => {
    setSelectedDate(undefined);
    setShowCalendar(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 border-b">
          <h4 className="font-medium text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Histórico de Contagens
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {sessionId ? 'Sessão atual' : 'Todas as sessões'}
          </p>
        </div>

        {/* Date filter */}
        <div className="p-2 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Popover open={showCalendar} onOpenChange={setShowCalendar}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "flex-1 justify-start text-left font-normal h-8",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="h-3.5 w-3.5 mr-2" />
                  {selectedDate ? format(selectedDate, "dd/MM/yyyy", { locale: pt }) : "Filtrar por data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start" side="bottom">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    setShowCalendar(false);
                  }}
                  locale={pt}
                  className={cn("p-3 pointer-events-auto")}
                  modifiers={{
                    hasLogs: logDates
                  }}
                  modifiersStyles={{
                    hasLogs: { fontWeight: 'bold', textDecoration: 'underline' }
                  }}
                />
              </PopoverContent>
            </Popover>
            {selectedDate && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={handleClearFilter}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {selectedDate && (
            <div className="mt-1.5 text-xs text-muted-foreground">
              {filteredLogs.length} registo{filteredLogs.length !== 1 ? 's' : ''} em {format(selectedDate, "dd/MM/yyyy")}
            </div>
          )}
        </div>

        <ScrollArea className="h-[220px]">
          {loading ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{selectedDate ? 'Sem registos nesta data' : 'Sem registos de contagem'}</p>
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="border rounded p-2 text-xs space-y-1.5 bg-muted/30"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {log.operation === 'increment' ? (
                        <Badge variant="default" className="bg-green-600 hover:bg-green-600 text-white px-1.5 py-0">
                          <Plus className="h-3 w-3 mr-0.5" />
                          +1
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="px-1.5 py-0">
                          <Minus className="h-3 w-3 mr-0.5" />
                          -1
                        </Badge>
                      )}
                      <span className="text-muted-foreground">
                        {format(new Date(log.created_at), "dd/MM/yy HH:mm:ss", { locale: pt })}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <Package className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">Coli {log.colis_number}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">{log.quantity_before}</span>
                      <span>→</span>
                      <span className={log.operation === 'increment' ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                        {log.quantity_after}
                      </span>
                    </div>
                  </div>
                  
                  {log.counted_by && userNames[log.counted_by] && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <User className="h-2.5 w-2.5" />
                      <span>{userNames[log.counted_by]}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
