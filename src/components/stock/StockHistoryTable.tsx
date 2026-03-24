import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { Search } from 'lucide-react';
import { pt } from 'date-fns/locale';
import { ArrowUpCircle, ArrowDownCircle, Trash2, Download, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { DateRangeFilter, filterByDateRange } from '@/components/ui/date-range-filter';
import { StockMovement } from '@/hooks/useStockMovements';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface StockHistoryTableProps {
  movements: StockMovement[];
  isLoading: boolean;
  onDelete?: (movement: StockMovement) => void;
  movementType: 'entrada' | 'saida';
}

export function StockHistoryTable({
  movements,
  isLoading,
  onDelete,
  movementType,
}: StockHistoryTableProps) {
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredMovements = useMemo(() => {
    let filtered = filterByDateRange(movements, dateFrom, dateTo, m => m.created_at);
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(m =>
        (m.products?.name || '').toLowerCase().includes(term) ||
        (m.products?.code || '').toLowerCase().includes(term)
      );
    }
    return filtered;
  }, [movements, dateFrom, dateTo, searchTerm]);

  const typeLabel = movementType === 'entrada' ? 'Entradas' : 'Saídas';

  const exportCSV = useCallback(() => {
    if (filteredMovements.length === 0) return;
    const headers = ['Data', 'Hora', 'Código', 'Produto', 'Quantidade', 'Motivo', 'Referência', 'Notas'];
    const rows = filteredMovements.map(m => {
      const d = new Date(m.created_at);
      return [
        format(d, 'dd/MM/yyyy'),
        format(d, 'HH:mm:ss'),
        m.products?.code || '-',
        m.products?.name || '-',
        m.quantity.toString(),
        m.reason || '-',
        m.reference || '-',
        m.notes || '-',
      ];
    });
    const totalUnits = filteredMovements.reduce((s, m) => s + m.quantity, 0);
    const summaryRows = [[], ['RESUMO'], ['Total Movimentos', filteredMovements.length.toString()], ['Total Unidades', totalUnits.toString()]];
    if (dateFrom || dateTo) {
      summaryRows.push(['Período', `${dateFrom ? format(dateFrom, 'dd/MM/yyyy') : '...'} - ${dateTo ? format(dateTo, 'dd/MM/yyyy') : '...'}`]);
    }
    const csv = [headers.join(';'), ...rows.map(r => r.map(c => `"${c}"`).join(';')), ...summaryRows.map(r => r.map(c => `"${c || ''}"`).join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${movementType === 'entrada' ? 'entradas' : 'saidas'}_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success(`${filteredMovements.length} movimentos exportados`);
  }, [filteredMovements, movementType, dateFrom, dateTo]);

  const exportExcel = useCallback(() => {
    if (filteredMovements.length === 0) return;
    const headers = ['Data', 'Hora', 'Código', 'Produto', 'Quantidade', 'Motivo', 'Referência', 'Notas'];
    const rows = filteredMovements.map(m => {
      const d = new Date(m.created_at);
      return [
        format(d, 'dd/MM/yyyy'),
        format(d, 'HH:mm:ss'),
        m.products?.code || '-',
        m.products?.name || '-',
        m.quantity,
        m.reason || '-',
        m.reference || '-',
        m.notes || '-',
      ];
    });
    const totalUnits = filteredMovements.reduce((s, m) => s + m.quantity, 0);
    const data: (string | number)[][] = [
      [`Relatório de ${typeLabel}`, '', '', '', '', '', '', ''],
      [`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: pt })}`, '', '', '', '', '', '', ''],
      ...(dateFrom || dateTo ? [[`Período: ${dateFrom ? format(dateFrom, 'dd/MM/yyyy') : '...'} - ${dateTo ? format(dateTo, 'dd/MM/yyyy') : '...'}`] as (string | number)[]] : []),
      [],
      headers,
      ...rows,
      [],
      ['Total Movimentos', filteredMovements.length, '', '', '', '', '', ''],
      ['Total Unidades', totalUnits, '', '', '', '', '', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = headers.map((_, i) => ({ wch: Math.min(Math.max(...data.map(r => String(r[i] || '').length) , 10) + 2, 40) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, typeLabel);
    XLSX.writeFile(wb, `${movementType === 'entrada' ? 'entradas' : 'saidas'}_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`);
    toast.success(`${filteredMovements.length} movimentos exportados para Excel`);
  }, [filteredMovements, movementType, typeLabel, dateFrom, dateTo]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">A carregar...</p></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            {movementType === 'entrada' ? (
              <ArrowUpCircle className="h-4 w-4 text-green-600" />
            ) : (
              <ArrowDownCircle className="h-4 w-4 text-red-600" />
            )}
            Histórico de {typeLabel}
            <Badge variant="secondary">{filteredMovements.length}</Badge>
          </CardTitle>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={filteredMovements.length === 0} className="h-8 text-xs">
              <Download className="h-3.5 w-3.5 mr-1" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportExcel} disabled={filteredMovements.length === 0} className="h-8 text-xs">
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Excel
            </Button>
          </div>
        </div>
        {movements.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por produto ou código..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={setDateFrom} onDateToChange={setDateTo} />
          </div>
        )}
      </CardHeader>
      <CardContent>
        {filteredMovements.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {movements.length === 0 ? `Nenhum movimento de ${movementType} registado.` : 'Nenhum movimento neste período.'}
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Referência</TableHead>
                  {onDelete && <TableHead className="w-[50px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMovements.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell className="text-sm">
                      {format(new Date(movement.created_at), "dd/MM/yy HH:mm", { locale: pt })}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{movement.products?.code || '-'}</TableCell>
                    <TableCell className="text-sm max-w-[150px] truncate">{movement.products?.name || '-'}</TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={movement.movement_type === 'entrada' ? 'default' : 'destructive'}
                        className={movement.movement_type === 'entrada' ? 'bg-green-600' : ''}
                      >
                        {movement.movement_type === 'entrada' ? '+' : '-'}{movement.quantity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">{movement.reason || '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">{movement.reference || '-'}</TableCell>
                    {onDelete && (
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Anular movimento?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação irá anular o movimento e reverter o stock do produto. Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => onDelete(movement)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Anular
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
