import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { 
  ClipboardCheck, 
  Play, 
  CheckCircle2, 
  Clock, 
  Trash2, 
  Eye,
  AlertTriangle,
  FileDown,
  MapPin
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocationAudits, LocationAudit } from '@/hooks/useLocationAudits';
import { AuditResultsDialog } from '@/components/audit/AuditResultsDialog';
import { loadXLSX } from '@/lib/lazyXlsx';
interface AuditReportsViewProps {
  onStartAudit?: (auditId: string) => void;
}

export function AuditReportsView({ onStartAudit }: AuditReportsViewProps) {
  const { audits, isLoading, deleteAudit, useAuditWithItems } = useLocationAudits();
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [resultsDialogOpen, setResultsDialogOpen] = useState(false);

  const { data: selectedAudit } = useAuditWithItems(selectedAuditId);

  const getStatusConfig = (status: LocationAudit['status']) => {
    switch (status) {
      case 'pending':
        return { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-100', label: 'Pendente' };
      case 'in_progress':
        return { icon: Play, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Em Progresso' };
      case 'completed':
        return { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100', label: 'Concluída' };
    }
  };

  const handleViewResults = (auditId: string) => {
    setSelectedAuditId(auditId);
    setResultsDialogOpen(true);
  };

  const handleDeleteAudit = async (auditId: string) => {
    await deleteAudit.mutateAsync(auditId);
  };

  // Stats
  const stats = useMemo(() => {
    const pending = audits.filter(a => a.status === 'pending').length;
    const inProgress = audits.filter(a => a.status === 'in_progress').length;
    const completed = audits.filter(a => a.status === 'completed').length;
    return { pending, inProgress, completed, total: audits.length };
  }, [audits]);

  // Export all audits summary
  const exportSummary = async () => {
      const XLSX = await loadXLSX();
    const data = audits.map(a => ({
      'Nome': a.name,
      'Status': getStatusConfig(a.status).label,
      'Localizações': a.locations.join(', '),
      'Criada em': format(new Date(a.created_at), 'dd/MM/yyyy HH:mm'),
      'Iniciada em': a.started_at ? format(new Date(a.started_at), 'dd/MM/yyyy HH:mm') : '-',
      'Concluída em': a.completed_at ? format(new Date(a.completed_at), 'dd/MM/yyyy HH:mm') : '-',
      'Notas': a.notes || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Conferências');
    XLSX.writeFile(workbook, `conferencias_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-yellow-50 dark:bg-yellow-950/20">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="text-2xl font-bold text-yellow-700">{stats.pending}</p>
              <p className="text-sm text-muted-foreground">Pendentes</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-blue-50 dark:bg-blue-950/20">
          <div className="flex items-center gap-3">
            <Play className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-2xl font-bold text-blue-700">{stats.inProgress}</p>
              <p className="text-sm text-muted-foreground">Em Progresso</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-green-50 dark:bg-green-950/20">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-2xl font-bold text-green-700">{stats.completed}</p>
              <p className="text-sm text-muted-foreground">Concluídas</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex justify-end">
        <Button onClick={exportSummary} variant="outline" disabled={audits.length === 0}>
          <FileDown className="h-4 w-4 mr-2" />
          Exportar Resumo
        </Button>
      </div>

      {/* Audits Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Histórico de Conferências
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border max-h-[400px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Localizações</TableHead>
                  <TableHead>Criada em</TableHead>
                  <TableHead>Concluída em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      Nenhuma conferência registada.
                      <br />
                      <span className="text-sm">Crie uma conferência no mapa do armazém.</span>
                    </TableCell>
                  </TableRow>
                ) : (
                  audits.map(audit => {
                    const statusConfig = getStatusConfig(audit.status);
                    const StatusIcon = statusConfig.icon;

                    return (
                      <TableRow key={audit.id}>
                        <TableCell className="font-medium">{audit.name}</TableCell>
                        <TableCell>
                          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md w-fit ${statusConfig.bg}`}>
                            <StatusIcon className={`h-3.5 w-3.5 ${statusConfig.color}`} />
                            <span className={`text-xs font-medium ${statusConfig.color}`}>
                              {statusConfig.label}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            {audit.locations.length} localização(ões)
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(audit.created_at), 'dd/MM/yyyy HH:mm')}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {audit.completed_at 
                            ? format(new Date(audit.completed_at), 'dd/MM/yyyy HH:mm')
                            : '-'
                          }
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {audit.status === 'pending' && onStartAudit && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onStartAudit(audit.id)}
                              >
                                <Play className="h-3.5 w-3.5 mr-1" />
                                Iniciar
                              </Button>
                            )}
                            {audit.status === 'in_progress' && onStartAudit && (
                              <Button
                                size="sm"
                                onClick={() => onStartAudit(audit.id)}
                              >
                                <Play className="h-3.5 w-3.5 mr-1" />
                                Continuar
                              </Button>
                            )}
                            {audit.status === 'completed' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleViewResults(audit.id)}
                              >
                                <Eye className="h-3.5 w-3.5 mr-1" />
                                Ver
                              </Button>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" className="text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Eliminar conferência?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta acção não pode ser revertida. Todos os dados desta conferência serão eliminados.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteAudit(audit.id)}
                                    className="bg-destructive text-destructive-foreground"
                                  >
                                    Eliminar
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Results Dialog */}
      {selectedAudit && (
        <AuditResultsDialog
          open={resultsDialogOpen}
          onOpenChange={setResultsDialogOpen}
          audit={selectedAudit}
        />
      )}
    </div>
  );
}
