import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AuditWithItems } from '@/hooks/useLocationAudits';
import { cn } from '@/lib/utils';
import { loadXLSX } from '@/lib/lazyXlsx';
interface AuditResultsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audit: AuditWithItems;
}

export function AuditResultsDialog({ open, onOpenChange, audit }: AuditResultsDialogProps) {
  const { data: misplaced = [] } = useQuery({
    queryKey: ['audit-misplaced', audit.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('location_audit_misplaced')
        .select('*')
        .eq('audit_id', audit.id)
        .order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
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
  const exportToExcel = async () => {
      const XLSX = await loadXLSX();
    const data = audit.items.map(item => ({
      'Localização': item.location,
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

  const pendingItems = audit.items.filter(i => i.difference === null || i.difference === undefined);
  const missing = stats.items.filter(i => (i.difference ?? 0) < 0);
  const excess = stats.items.filter(i => (i.difference ?? 0) > 0);

  const statusBadge = (item: typeof audit.items[number]) =>
    item.difference === null || item.difference === undefined ? (
      <Badge variant="outline">Pendente</Badge>
    ) : item.difference === 0 ? (
      <Badge variant="secondary"><CheckCircle2 className="h-3 w-3 mr-1" />OK</Badge>
    ) : item.difference > 0 ? (
      <Badge variant="default">Excesso</Badge>
    ) : (
      <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Falta</Badge>
    );

  const ItemsTable = ({ items, empty }: { items: typeof audit.items; empty: string }) => (
    <div className="h-full overflow-auto border rounded-md">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted">
          <TableRow>
            <TableHead className="w-[110px]">Localização</TableHead>
            <TableHead className="w-[160px]">Código</TableHead>
            <TableHead>Produto</TableHead>
            <TableHead className="w-[70px] text-center">Volume</TableHead>
            <TableHead className="w-[90px] text-center">Esperado</TableHead>
            <TableHead className="w-[90px] text-center">Contado</TableHead>
            <TableHead className="w-[90px] text-center">Diferença</TableHead>
            <TableHead className="w-[110px]">Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">{empty}</TableCell>
            </TableRow>
          ) : items.map(item => (
            <TableRow key={item.id}>
              <TableCell>
                <span className="inline-flex items-center gap-1 font-mono text-sm font-semibold">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />{item.location}
                </span>
              </TableCell>
              <TableCell className="font-mono text-xs break-all">{item.product_code}</TableCell>
              <TableCell className="text-sm whitespace-normal break-words">{item.product_name}</TableCell>
              <TableCell className="text-center text-sm">{item.colis_number ? `C${item.colis_number}` : '-'}</TableCell>
              <TableCell className="text-center font-medium">{item.expected_quantity}</TableCell>
              <TableCell className="text-center font-medium">{item.counted_quantity ?? '-'}</TableCell>
              <TableCell className="text-center">
                {item.difference !== null ? (
                  <span className={cn('font-bold', item.difference === 0 ? 'text-muted-foreground' : item.difference > 0 ? 'text-primary' : 'text-destructive')}>
                    {item.difference > 0 ? '+' : ''}{item.difference}
                  </span>
                ) : '-'}
              </TableCell>
              <TableCell>{statusBadge(item)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] overflow-hidden flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Resultados: {audit.name}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {audit.locations.length} localização(ões) · Concluída em{' '}
            {audit.completed_at ? format(new Date(audit.completed_at), 'dd/MM/yyyy HH:mm') : '-'}
          </p>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {[
            { label: 'Total itens', value: stats.total },
            { label: 'Correctos', value: stats.correct },
            { label: 'Com diferença', value: stats.withDifference },
            { label: 'Pendentes', value: pendingItems.length },
            { label: 'Balanço', value: `${stats.totalDifference > 0 ? '+' : ''}${stats.totalDifference}` },
          ].map(c => (
            <Card key={c.label} className="p-3">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="text-xl font-bold">{c.value}</p>
            </Card>
          ))}
        </div>

        <Tabs defaultValue={stats.withDifference > 0 ? 'divergencias' : 'todos'} className="flex-1 min-h-0 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="todos">Todos ({stats.total})</TabsTrigger>
              <TabsTrigger value="divergencias">Divergências ({stats.withDifference})</TabsTrigger>
              <TabsTrigger value="pendentes">Pendentes ({pendingItems.length})</TabsTrigger>
              <TabsTrigger value="local">Local errado ({misplaced.length})</TabsTrigger>
            </TabsList>
            <Button onClick={exportToExcel} variant="outline" size="sm">
              <FileDown className="h-4 w-4 mr-2" />Exportar Excel
            </Button>
          </div>

          <TabsContent value="todos" className="flex-1 min-h-0 mt-3">
            <ItemsTable items={audit.items} empty="Sem itens nesta conferência." />
          </TabsContent>

          <TabsContent value="divergencias" className="flex-1 min-h-0 mt-3 flex flex-col gap-2">
            <div className="flex gap-2 text-xs">
              <Badge variant="destructive">Faltas: {missing.length}</Badge>
              <Badge variant="default">Excessos: {excess.length}</Badge>
            </div>
            <div className="flex-1 min-h-0">
              <ItemsTable items={[...missing, ...excess]} empty="Nenhuma divergência — tudo bate certo." />
            </div>
          </TabsContent>

          <TabsContent value="pendentes" className="flex-1 min-h-0 mt-3">
            <ItemsTable items={pendingItems} empty="Nenhum item ficou por contar." />
          </TabsContent>

          <TabsContent value="local" className="flex-1 min-h-0 mt-3 flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">Só corrigir localização — estas leituras não entram no ajuste de stock.</p>
            <div className="flex-1 min-h-0 overflow-auto border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted">
                  <TableRow>
                    <TableHead className="w-[170px]">Código</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="w-[70px] text-center">Volume</TableHead>
                    <TableHead className="w-[130px]">Lido em</TableHead>
                    <TableHead className="w-[200px]">No sistema está em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {misplaced.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Nenhum produto lido no local errado.</TableCell>
                    </TableRow>
                  ) : misplaced.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono text-xs break-all">{m.product_code}</TableCell>
                      <TableCell className="text-sm whitespace-normal break-words">
                        <span className="inline-flex items-center gap-1"><Package className="h-3.5 w-3.5 text-muted-foreground" />{m.product_name ?? '-'}</span>
                      </TableCell>
                      <TableCell className="text-center text-sm">{m.colis_number ? `C${m.colis_number}` : '-'}</TableCell>
                      <TableCell><Badge variant="destructive" className="font-mono">{m.scanned_location}</Badge></TableCell>
                      <TableCell className="font-mono text-sm">
                        {m.system_locations.length ? m.system_locations.join(', ') : 'sem localização'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
