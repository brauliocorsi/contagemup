import { useMemo } from 'react';
import { format } from 'date-fns';
import { 
  CheckCircle2, 
  AlertTriangle, 
  FileDown,
  MapPin,
  Package
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { AuditWithItems } from '@/hooks/useLocationAudits';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

interface AuditResultsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audit: AuditWithItems;
}

export function AuditResultsDialog({ open, onOpenChange, audit }: AuditResultsDialogProps) {
  // Stats
  const stats = useMemo(() => {
    const items = audit.items;
    const correct = items.filter(i => i.difference === 0 || i.difference === null).length;
    const withDifference = items.filter(i => i.difference !== null && i.difference !== 0);
    const totalExpected = items.reduce((sum, i) => sum + i.expected_quantity, 0);
    const totalCounted = items.reduce((sum, i) => sum + (i.counted_quantity || 0), 0);
    const totalDifference = totalCounted - totalExpected;

    return {
      total: items.length,
      correct,
      withDifference: withDifference.length,
      totalExpected,
      totalCounted,
      totalDifference,
      items: withDifference,
    };
  }, [audit.items]);

  // Export to Excel
  const exportToExcel = () => {
    const data = audit.items.map(item => ({
      'Localização': item.location,
      'Palete': item.pallet_number || '-',
      'Código': item.product_code,
      'Produto': item.product_name,
      'Coli': item.colis_number || '-',
      'Esperado': item.expected_quantity,
      'Contado': item.counted_quantity ?? '-',
      'Diferença': item.difference ?? '-',
      'Status': item.difference === 0 ? 'OK' : item.difference && item.difference > 0 ? 'Excesso' : 'Falta',
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Resultados');
    XLSX.writeFile(workbook, `conferencia_${audit.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Resultados: {audit.name}
          </DialogTitle>
        </DialogHeader>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3">
            <p className="text-sm text-muted-foreground">Total Itens</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </Card>
          <Card className="p-3 bg-green-50 dark:bg-green-950/20">
            <p className="text-sm text-green-600">Correctos</p>
            <p className="text-2xl font-bold text-green-700">{stats.correct}</p>
          </Card>
          <Card className="p-3 bg-orange-50 dark:bg-orange-950/20">
            <p className="text-sm text-orange-600">Com Diferença</p>
            <p className="text-2xl font-bold text-orange-700">{stats.withDifference}</p>
          </Card>
          <Card className={cn(
            "p-3",
            stats.totalDifference === 0 
              ? "bg-blue-50 dark:bg-blue-950/20" 
              : stats.totalDifference > 0 
                ? "bg-green-50 dark:bg-green-950/20"
                : "bg-red-50 dark:bg-red-950/20"
          )}>
            <p className="text-sm text-muted-foreground">Balanço Total</p>
            <p className={cn(
              "text-2xl font-bold",
              stats.totalDifference === 0 ? "text-blue-600" : stats.totalDifference > 0 ? "text-green-600" : "text-red-600"
            )}>
              {stats.totalDifference > 0 ? '+' : ''}{stats.totalDifference}
            </p>
          </Card>
        </div>

        {/* Export button */}
        <div className="flex justify-end">
          <Button onClick={exportToExcel} variant="outline" size="sm">
            <FileDown className="h-4 w-4 mr-2" />
            Exportar Excel
          </Button>
        </div>

        {/* Results Table */}
        <div className="flex-1 overflow-auto border rounded-md">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Localização</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-center">Esperado</TableHead>
                <TableHead className="text-center">Contado</TableHead>
                <TableHead className="text-center">Diferença</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit.items.map(item => {
                const hasDifference = item.difference !== null && item.difference !== 0;
                
                return (
                  <TableRow 
                    key={item.id}
                    className={cn(hasDifference && "bg-orange-50/50 dark:bg-orange-950/10")}
                  >
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <span className="font-mono text-sm">{item.location}</span>
                      </div>
                      {item.pallet_number && (
                        <span className="text-xs text-muted-foreground">📦 {item.pallet_number}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Package className="h-3 w-3 text-muted-foreground" />
                        <div>
                          <span className="font-mono text-xs">{item.product_code}</span>
                          <p className="text-sm truncate max-w-[200px]">{item.product_name}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      {item.expected_quantity}
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      {item.counted_quantity ?? '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.difference !== null ? (
                        <span className={cn(
                          "font-bold",
                          item.difference === 0 
                            ? "text-muted-foreground" 
                            : item.difference > 0 
                              ? "text-green-600"
                              : "text-red-600"
                        )}>
                          {item.difference > 0 ? '+' : ''}{item.difference}
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      {item.difference === null || item.difference === undefined ? (
                        <Badge variant="outline" className="text-[10px]">Pendente</Badge>
                      ) : item.difference === 0 ? (
                        <Badge className="text-[10px] bg-green-100 text-green-700">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          OK
                        </Badge>
                      ) : item.difference > 0 ? (
                        <Badge className="text-[10px] bg-blue-100 text-blue-700">
                          Excesso
                        </Badge>
                      ) : (
                        <Badge className="text-[10px] bg-red-100 text-red-700">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Falta
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Footer info */}
        <div className="text-xs text-muted-foreground text-center">
          Conferência realizada em {audit.completed_at 
            ? format(new Date(audit.completed_at), 'dd/MM/yyyy HH:mm')
            : '-'
          }
        </div>
      </DialogContent>
    </Dialog>
  );
}
