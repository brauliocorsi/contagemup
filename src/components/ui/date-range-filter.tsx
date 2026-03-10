import { useState } from 'react';
import { format, startOfDay, endOfDay, subDays, startOfMonth, startOfWeek } from 'date-fns';
import { pt } from 'date-fns/locale';
import { CalendarIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';

interface DateRangeFilterProps {
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  onDateFromChange: (date: Date | undefined) => void;
  onDateToChange: (date: Date | undefined) => void;
  onClear?: () => void;
  className?: string;
}

export function DateRangeFilter({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onClear,
  className,
}: DateRangeFilterProps) {
  const hasFilter = dateFrom || dateTo;

  const presets = [
    { label: 'Hoje', action: () => { onDateFromChange(new Date()); onDateToChange(new Date()); } },
    { label: '7 dias', action: () => { onDateFromChange(subDays(new Date(), 7)); onDateToChange(new Date()); } },
    { label: '30 dias', action: () => { onDateFromChange(subDays(new Date(), 30)); onDateToChange(new Date()); } },
    { label: 'Este mês', action: () => { onDateFromChange(startOfMonth(new Date())); onDateToChange(new Date()); } },
  ];

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {/* Presets */}
      <div className="flex gap-1">
        {presets.map(p => (
          <Button key={p.label} variant="outline" size="sm" className="text-xs h-8 px-2" onClick={p.action}>
            {p.label}
          </Button>
        ))}
      </div>

      {/* Date From */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("h-8 justify-start text-left font-normal text-xs", !dateFrom && "text-muted-foreground")}>
            <CalendarIcon className="mr-1 h-3 w-3" />
            {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'De'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={dateFrom} onSelect={onDateFromChange} initialFocus className="p-3 pointer-events-auto" locale={pt} />
        </PopoverContent>
      </Popover>

      <span className="text-xs text-muted-foreground">—</span>

      {/* Date To */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("h-8 justify-start text-left font-normal text-xs", !dateTo && "text-muted-foreground")}>
            <CalendarIcon className="mr-1 h-3 w-3" />
            {dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Até'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={dateTo} onSelect={onDateToChange} initialFocus className="p-3 pointer-events-auto" locale={pt} />
        </PopoverContent>
      </Popover>

      {hasFilter && (
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => { onDateFromChange(undefined); onDateToChange(undefined); onClear?.(); }}>
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

// Helper to filter items by date range
export function filterByDateRange<T>(
  items: T[],
  dateFrom: Date | undefined,
  dateTo: Date | undefined,
  getDate: (item: T) => string
): T[] {
  if (!dateFrom && !dateTo) return items;
  
  return items.filter(item => {
    const itemDate = new Date(getDate(item));
    if (dateFrom && itemDate < startOfDay(dateFrom)) return false;
    if (dateTo && itemDate > endOfDay(dateTo)) return false;
    return true;
  });
}
