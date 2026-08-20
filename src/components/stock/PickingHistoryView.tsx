import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  ClipboardList,
  Calendar,
  User,
  Search,
  ChevronDown,
  ChevronRight,
  Forklift,
  Footprints,
  MapPin,
  Package,
  Trash2,
  Download,
  AlertCircle,
  FileDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePickingHistory, PickingSession, PickingItem } from '@/hooks/usePickingHistory';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { loadPDF } from '@/lib/lazyPdf';
export function PickingHistoryView() {
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [operatorId, setOperatorId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [sessionItems, setSessionItems] = useState<Record<string, PickingItem[]>>({});
  const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());

  const filters = useMemo(() => ({
    startDate,
    endDate,
    operatorId: operatorId || undefined,
    search: search || undefined,
  }), [startDate, endDate, operatorId, search]);

  const { sessions, isLoading, fetchSessionItems, deleteSession } = usePickingHistory(filters);

  // Fetch operators for filter
  const { data: operators = [] } = useQuery({
    queryKey: ['operators'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, name')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const toggleSession = async (sessionId: string) => {
    const newExpanded = new Set(expandedSessions);
    
    if (newExpanded.has(sessionId)) {
      newExpanded.delete(sessionId);
    } else {
      newExpanded.add(sessionId);
      
      // Fetch items if not already loaded
      if (!sessionItems[sessionId]) {
        setLoadingItems(prev => new Set(prev).add(sessionId));
        try {
          const items = await fetchSessionItems(sessionId);
          setSessionItems(prev => ({ ...prev, [sessionId]: items }));
        } catch (error) {
          console.error('Error fetching items:', error);
        } finally {
          setLoadingItems(prev => {
            const next = new Set(prev);
            next.delete(sessionId);
            return next;
          });
        }
      }
    }
    
    setExpandedSessions(newExpanded);
  };

  const exportToCSV = () => {
    const headers = ['Data', 'Hora', 'Operador', 'Referência', 'Motivo', 'Total Produtos', 'Total Unidades'];
    const rows = sessions.map(s => [
      format(new Date(s.created_at), 'dd/MM/yyyy'),
      format(new Date(s.created_at), 'HH:mm'),
      s.operator_name || '',
      s.reference || '',
      s.reason || '',
      s.total_products.toString(),
      s.total_units.toString(),
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `historico-picking-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  const clearFilters = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setOperatorId('');
    setSearch('');
  };

  const hasFilters = startDate || endDate || operatorId || search;

  // Group items by forklift requirement
  const groupItemsByForklift = (items: PickingItem[]) => {
    const forkliftItems = items.filter(i => i.requires_forklift);
    const floorItems = items.filter(i => !i.requires_forklift && i.location);
    const noLocationItems = items.filter(i => !i.location);

    return { forkliftItems, floorItems, noLocationItems };
  };

  // Export session to PDF
  const exportSessionToPDF = async (session: PickingSession, items: PickingItem[]) => {
      const __PDF = await loadPDF(); const __PDFjsPDF = __PDF.jsPDF; const __PDFautoTable = __PDF.autoTable;
    const doc = new __PDFjsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const groups = groupItemsByForklift(items);
    
    // Header
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Relatório de Picking', pageWidth / 2, 20, { align: 'center' });
    
    // Subheader with date/time
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const sessionDate = format(new Date(session.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: pt });
    doc.text(`Data: ${sessionDate}`, pageWidth / 2, 28, { align: 'center' });
    
    // Info box
    let yPos = 38;
    doc.setDrawColor(200);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, yPos, pageWidth - 28, 28, 3, 3, 'FD');
    
    yPos += 8;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total: ${session.total_products} produtos | ${session.total_units} unidades`, 20, yPos);
    
    yPos += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const infoText = [
      session.reference && `Ref: ${session.reference}`,
      session.reason && `Motivo: ${session.reason}`,
      session.operator_name && `Operador: ${session.operator_name}`,
    ].filter(Boolean).join('  |  ');
    doc.text(infoText, 20, yPos);
    
    yPos += 18;
    
    // Forklift section
    if (groups.forkliftItems.length > 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(220, 38, 38);
      doc.text(`EMPILHADOR (${groups.forkliftItems.length} itens)`, 14, yPos);
      doc.setTextColor(0);
      yPos += 4;
      
      __PDFautoTable(doc, {
        startY: yPos,
        head: [['#', 'Código', 'Produto', 'Qtd', 'Localização', 'Nível']],
        body: groups.forkliftItems.map((item, idx) => [
          (idx + 1).toString(),
          item.product_code,
          item.product_name.substring(0, 30) + (item.product_name.length > 30 ? '...' : ''),
          item.quantity.toString(),
          item.location || '-',
          item.level_name || '-',
        ]),
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [254, 242, 242] },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 25, fontStyle: 'bold' },
          2: { cellWidth: 50 },
          3: { cellWidth: 15, halign: 'center' },
          4: { cellWidth: 30 },
          5: { cellWidth: 25 },
        },
        margin: { left: 14, right: 14 },
      });
      
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }
    
    // Floor section
    if (groups.floorItems.length > 0) {
      if (yPos > doc.internal.pageSize.getHeight() - 60) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(22, 163, 74);
      doc.text(`ACESSÍVEL A PÉ (${groups.floorItems.length} itens)`, 14, yPos);
      doc.setTextColor(0);
      yPos += 4;
      
      __PDFautoTable(doc, {
        startY: yPos,
        head: [['#', 'Código', 'Produto', 'Qtd', 'Localização', 'Nível']],
        body: groups.floorItems.map((item, idx) => [
          (idx + 1).toString(),
          item.product_code,
          item.product_name.substring(0, 30) + (item.product_name.length > 30 ? '...' : ''),
          item.quantity.toString(),
          item.location || '-',
          item.level_name || '-',
        ]),
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [240, 253, 244] },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 25, fontStyle: 'bold' },
          2: { cellWidth: 50 },
          3: { cellWidth: 15, halign: 'center' },
          4: { cellWidth: 30 },
          5: { cellWidth: 25 },
        },
        margin: { left: 14, right: 14 },
      });
      
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }
    
    // No location section
    if (groups.noLocationItems.length > 0) {
      if (yPos > doc.internal.pageSize.getHeight() - 60) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 100, 100);
      doc.text(`SEM LOCALIZAÇÃO (${groups.noLocationItems.length} itens)`, 14, yPos);
      doc.setTextColor(0);
      yPos += 4;
      
      __PDFautoTable(doc, {
        startY: yPos,
        head: [['#', 'Código', 'Produto', 'Qtd']],
        body: groups.noLocationItems.map((item, idx) => [
          (idx + 1).toString(),
          item.product_code,
          item.product_name.substring(0, 40) + (item.product_name.length > 40 ? '...' : ''),
          item.quantity.toString(),
        ]),
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [100, 100, 100], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 30, fontStyle: 'bold' },
          2: { cellWidth: 80 },
          3: { cellWidth: 20, halign: 'center' },
        },
        margin: { left: 14, right: 14 },
      });
      
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }
    
    // Notes section
    if (session.notes) {
      if (yPos > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Notas:', 14, yPos);
      doc.setFont('helvetica', 'normal');
      yPos += 5;
      
      const splitNotes = doc.splitTextToSize(session.notes, pageWidth - 28);
      doc.text(splitNotes, 14, yPos);
    }
    
    // Footer with signature line
    const footerY = doc.internal.pageSize.getHeight() - 25;
    doc.setDrawColor(200);
    doc.line(14, footerY, 80, footerY);
    doc.setFontSize(9);
    doc.text('Assinatura do Operador', 14, footerY + 5);
    
    doc.line(pageWidth - 80, footerY, pageWidth - 14, footerY);
    doc.text('Data/Hora', pageWidth - 80, footerY + 5);
    
    // Save
    const filename = `picking_${session.reference?.replace(/[^a-zA-Z0-9]/g, '_') || format(new Date(session.created_at), 'yyyyMMdd_HHmm')}.pdf`;
    doc.save(filename);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Histórico de Picking
          </h2>
          <p className="text-sm text-muted-foreground">
            Registo de todas as operações de picking realizadas
          </p>
        </div>
        <Button variant="outline" onClick={exportToCSV} disabled={sessions.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar referência ou motivo..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="min-w-[140px]">
                  <Calendar className="h-4 w-4 mr-2" />
                  {startDate ? format(startDate, 'dd/MM/yyyy') : 'Data início'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  locale={pt}
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="min-w-[140px]">
                  <Calendar className="h-4 w-4 mr-2" />
                  {endDate ? format(endDate, 'dd/MM/yyyy') : 'Data fim'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  locale={pt}
                />
              </PopoverContent>
            </Popover>

            <Select value={operatorId} onValueChange={setOperatorId}>
              <SelectTrigger className="w-[180px]">
                <User className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Operador" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {operators.map((op) => (
                  <SelectItem key={op.user_id} value={op.user_id}>
                    {op.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Limpar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sessions List */}
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-[200px]" />
                    <Skeleton className="h-3 w-[150px]" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : sessions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {hasFilters ? 'Nenhum resultado encontrado para os filtros aplicados' : 'Ainda não existem registos de picking'}
              </p>
            </CardContent>
          </Card>
        ) : (
          sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              isExpanded={expandedSessions.has(session.id)}
              isLoadingItems={loadingItems.has(session.id)}
              items={sessionItems[session.id]}
              onToggle={() => toggleSession(session.id)}
              onDelete={() => deleteSession.mutate(session.id)}
              onExportPDF={async () => {
                // Load items if not already loaded
                let itemsToExport = sessionItems[session.id];
                if (!itemsToExport) {
                  itemsToExport = await fetchSessionItems(session.id);
                  setSessionItems(prev => ({ ...prev, [session.id]: itemsToExport }));
                }
                exportSessionToPDF(session, itemsToExport);
              }}
              groupItemsByForklift={groupItemsByForklift}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface SessionCardProps {
  session: PickingSession;
  isExpanded: boolean;
  isLoadingItems: boolean;
  items?: PickingItem[];
  onToggle: () => void;
  onDelete: () => void;
  onExportPDF: () => void;
  groupItemsByForklift: (items: PickingItem[]) => {
    forkliftItems: PickingItem[];
    floorItems: PickingItem[];
    noLocationItems: PickingItem[];
  };
}

function SessionCard({
  session,
  isExpanded,
  isLoadingItems,
  items,
  onToggle,
  onDelete,
  onExportPDF,
  groupItemsByForklift,
}: SessionCardProps) {
  const groups = items ? groupItemsByForklift(items) : null;

  return (
    <Card>
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10">
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 text-primary" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-primary" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">
                    {format(new Date(session.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: pt })}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    <User className="h-3 w-3 mr-1" />
                    {session.operator_name}
                  </Badge>
                  {session.reference && (
                    <Badge variant="secondary" className="text-xs">
                      {session.reference}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                  {session.reason && <span>{session.reason}</span>}
                  <span>•</span>
                  <span>{session.total_products} produtos</span>
                  <span>•</span>
                  <span>{session.total_units} unidades</span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExportPDF();
                  }}
                  title="Exportar PDF"
                >
                  <FileDown className="h-4 w-4" />
                </Button>

                <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Eliminar registo de picking?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser revertida. O registo de picking será permanentemente eliminado.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={onDelete}>
                      Eliminar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 border-t">
            {isLoadingItems ? (
              <div className="space-y-2 py-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : groups ? (
              <div className="space-y-4 pt-4">
                {/* Forklift Items */}
                {groups.forkliftItems.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-amber-500 hover:bg-amber-600">
                        <Forklift className="h-3 w-3 mr-1" />
                        Requer Empilhador
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        ({groups.forkliftItems.length} itens)
                      </span>
                    </div>
                    <div className="space-y-1 pl-4">
                      {groups.forkliftItems.map((item) => (
                        <ItemRow key={item.id} item={item} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Floor Items */}
                {groups.floorItems.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-green-500 hover:bg-green-600">
                        <Footprints className="h-3 w-3 mr-1" />
                        Acessível a Pé
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        ({groups.floorItems.length} itens)
                      </span>
                    </div>
                    <div className="space-y-1 pl-4">
                      {groups.floorItems.map((item) => (
                        <ItemRow key={item.id} item={item} />
                      ))}
                    </div>
                  </div>
                )}

                {/* No Location Items */}
                {groups.noLocationItems.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Sem Localização
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        ({groups.noLocationItems.length} itens)
                      </span>
                    </div>
                    <div className="space-y-1 pl-4">
                      {groups.noLocationItems.map((item) => (
                        <ItemRow key={item.id} item={item} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {session.notes && (
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground">
                      <strong>Notas:</strong> {session.notes}
                    </p>
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function ItemRow({ item }: { item: PickingItem }) {
  return (
    <div className="flex items-center gap-3 py-1.5 text-sm">
      <div className="flex-1 min-w-0">
        <span className="font-medium">{item.product_code}</span>
        <span className="text-muted-foreground ml-2">{item.product_name}</span>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        {item.location && (
          <Badge variant="outline" className="text-xs font-normal">
            <MapPin className="h-3 w-3 mr-1" />
            {item.location}
            {item.level_name && ` • ${item.level_name}`}
          </Badge>
        )}
        <Badge variant="secondary" className="text-xs">
          {item.quantity} un.
        </Badge>
      </div>
    </div>
  );
}
