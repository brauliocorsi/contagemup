import { useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  Forklift,
  Footprints,
  MapPin,
  Package,
  FileDown,
  Printer,
  X,
  ClipboardList,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { MovementItem } from '@/hooks/useStockMovements';
import { optimizePickingRoute } from '@/hooks/usePickingHistory';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PickingItem extends MovementItem {
  location?: string;
  pallet_number?: string;
  requires_forklift?: boolean;
  level_name?: string;
  aisle_name?: string;
  position_in_aisle?: number;
}

interface PickingReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PickingItem[];
  reference?: string;
  reason?: string;
  notes?: string;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function PickingReportDialog({
  open,
  onOpenChange,
  items,
  reference,
  reason,
  notes,
  onConfirm,
  isLoading,
}: PickingReportDialogProps) {
  const reportRef = useRef<HTMLDivElement>(null);

  // Optimize and group items
  const { forkliftItems, footItems, totalItems, totalUnits } = useMemo(() => {
    const optimized = optimizePickingRoute(items);
    const forklift = optimized.filter(i => i.requires_forklift);
    const foot = optimized.filter(i => !i.requires_forklift);
    
    return {
      forkliftItems: forklift,
      footItems: foot,
      totalItems: items.length,
      totalUnits: items.reduce((sum, i) => sum + i.quantity, 0),
    };
  }, [items]);

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Relatório de Picking', pageWidth / 2, 20, { align: 'center' });
    
    // Subheader with date/time
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const now = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: pt });
    doc.text(`Gerado em: ${now}`, pageWidth / 2, 28, { align: 'center' });
    
    // Info box
    let yPos = 38;
    doc.setDrawColor(200);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, yPos, pageWidth - 28, reference || reason ? 28 : 18, 3, 3, 'FD');
    
    yPos += 8;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total: ${totalItems} produtos | ${totalUnits} unidades`, 20, yPos);
    
    if (reference || reason) {
      yPos += 8;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const infoText = [reference && `Ref: ${reference}`, reason && `Motivo: ${reason}`]
        .filter(Boolean)
        .join('  |  ');
      doc.text(infoText, 20, yPos);
    }
    
    yPos += reference || reason ? 18 : 12;
    
    // Forklift section
    if (forkliftItems.length > 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(220, 38, 38);
      doc.text(`🚜 EMPILHADOR (${forkliftItems.length} itens)`, 14, yPos);
      doc.setTextColor(0);
      yPos += 4;
      
      autoTable(doc, {
        startY: yPos,
        head: [['#', 'Código', 'Produto', 'Qtd', 'Localização', 'Palete', 'Nível']],
        body: forkliftItems.map((item, idx) => [
          (idx + 1).toString(),
          item.product_code,
          item.product_name.substring(0, 30) + (item.product_name.length > 30 ? '...' : ''),
          item.quantity.toString(),
          item.location || '-',
          item.pallet_number || '-',
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
          4: { cellWidth: 25 },
          5: { cellWidth: 20 },
          6: { cellWidth: 20 },
        },
        margin: { left: 14, right: 14 },
      });
      
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }
    
    // Foot section
    if (footItems.length > 0) {
      // Check if we need a new page
      if (yPos > doc.internal.pageSize.getHeight() - 60) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(22, 163, 74);
      doc.text(`👣 ACESSÍVEL A PÉ (${footItems.length} itens)`, 14, yPos);
      doc.setTextColor(0);
      yPos += 4;
      
      autoTable(doc, {
        startY: yPos,
        head: [['#', 'Código', 'Produto', 'Qtd', 'Localização', 'Palete', 'Nível']],
        body: footItems.map((item, idx) => [
          (idx + 1).toString(),
          item.product_code,
          item.product_name.substring(0, 30) + (item.product_name.length > 30 ? '...' : ''),
          item.quantity.toString(),
          item.location || '-',
          item.pallet_number || '-',
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
          4: { cellWidth: 25 },
          5: { cellWidth: 20 },
          6: { cellWidth: 20 },
        },
        margin: { left: 14, right: 14 },
      });
      
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }
    
    // Notes section
    if (notes) {
      if (yPos > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Notas:', 14, yPos);
      doc.setFont('helvetica', 'normal');
      yPos += 5;
      
      const splitNotes = doc.splitTextToSize(notes, pageWidth - 28);
      doc.text(splitNotes, 14, yPos);
      yPos += splitNotes.length * 5 + 10;
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
    const filename = `picking_${reference?.replace(/[^a-zA-Z0-9]/g, '_') || format(new Date(), 'yyyyMMdd_HHmm')}.pdf`;
    doc.save(filename);
  };

  const handlePrint = () => {
    handleExportPDF();
  };

  const renderItemGroup = (
    groupItems: PickingItem[],
    title: string,
    icon: React.ReactNode,
    colorClass: string
  ) => {
    if (groupItems.length === 0) return null;

    return (
      <div className="space-y-3">
        <div className={`flex items-center gap-2 ${colorClass}`}>
          {icon}
          <span className="font-semibold">{title}</span>
          <Badge variant="secondary" className="ml-auto">
            {groupItems.length} itens
          </Badge>
        </div>
        
        <div className="space-y-2">
          {groupItems.map((item, idx) => (
            <div
              key={`${item.product_id}-${idx}`}
              className="flex items-center gap-3 p-3 rounded-lg border bg-card"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-bold">
                {idx + 1}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold">{item.product_code}</span>
                  <Badge>{item.quantity} un.</Badge>
                </div>
                <p className="text-sm text-muted-foreground truncate">{item.product_name}</p>
              </div>
              
              <div className="flex flex-col items-end gap-1 text-sm">
                {item.location && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span className="font-mono">{item.location}</span>
                  </div>
                )}
                {item.pallet_number && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Package className="h-3 w-3" />
                    <span className="font-mono">{item.pallet_number}</span>
                  </div>
                )}
                {item.level_name && (
                  <Badge variant="outline" className="text-xs">
                    {item.level_name}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Relatório de Picking
          </DialogTitle>
          <DialogDescription>
            Revise os itens antes de confirmar a saída. Os produtos estão ordenados por rota otimizada.
          </DialogDescription>
        </DialogHeader>

        {/* Summary */}
        <div className="flex flex-wrap gap-4 p-4 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              <strong>{totalItems}</strong> produtos
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">
              <strong>{totalUnits}</strong> unidades
            </span>
          </div>
          {reference && (
            <Badge variant="outline">Ref: {reference}</Badge>
          )}
          {reason && (
            <Badge variant="secondary">{reason}</Badge>
          )}
        </div>

        {/* Items List */}
        <ScrollArea className="flex-1 max-h-[400px] pr-4">
          <div ref={reportRef} className="space-y-6">
            {renderItemGroup(
              forkliftItems,
              'Requer Empilhador',
              <Forklift className="h-5 w-5" />,
              'text-red-600'
            )}
            
            {forkliftItems.length > 0 && footItems.length > 0 && (
              <Separator />
            )}
            
            {renderItemGroup(
              footItems,
              'Acessível a Pé',
              <Footprints className="h-5 w-5" />,
              'text-green-600'
            )}

            {notes && (
              <>
                <Separator />
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-sm font-medium mb-1">Notas:</p>
                  <p className="text-sm text-muted-foreground">{notes}</p>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPDF}
              className="flex-1 sm:flex-none"
            >
              <FileDown className="h-4 w-4 mr-2" />
              Exportar PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="flex-1 sm:flex-none"
            >
              <Printer className="h-4 w-4 mr-2" />
              Imprimir
            </Button>
          </div>
          
          <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="flex-1 sm:flex-none"
            >
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirm}
              disabled={isLoading}
              className="flex-1 sm:flex-none"
            >
              {isLoading ? 'A processar...' : 'Confirmar Saídas'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
