import { useMemo } from 'react';
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
  ChevronDown,
  AlertTriangle,
  Layers,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { PickingItemDetailed, PickingPDFRow, ColisPickingDetail } from '@/types/picking';
import { optimizeDetailedPickingRoute } from '@/hooks/useDetailedPickingData';
import { loadPDF } from '@/lib/lazyPdf';
interface PickingReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PickingItemDetailed[];
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
  // Optimize and group items
  const { forkliftItems, footItems, totalItems, totalUnits, allPDFRows } = useMemo(() => {
    const optimized = optimizeDetailedPickingRoute(items);
    
    // Group by forklift requirement
    const forklift = optimized.filter(i => i.hasForkliftRequired);
    const foot = optimized.filter(i => !i.hasForkliftRequired);
    
    // Prepare PDF rows - one per coli location
    const pdfRows: PickingPDFRow[] = [];
    let productIndex = 0;
    
    optimized.forEach(item => {
      productIndex++;
      const colisWithData = item.colisDetails.filter(c => c.quantity > 0 || c.location);
      
      if (colisWithData.length === 0) {
        // Product has no coli data, add placeholder
        pdfRows.push({
          productIndex,
          product_code: item.product_code,
          product_name: item.product_name,
          colis_label: `1/${item.total_colis}`,
          colis_name: null,
          quantity: item.quantity,
          location: null,
          pallet_number: null,
          level_name: null,
          aisle_name: null,
          requires_forklift: false,
        });
      } else {
        colisWithData.forEach(coli => {
          pdfRows.push({
            productIndex,
            product_code: item.product_code,
            product_name: item.product_name,
            colis_label: `${coli.colis_number}/${item.total_colis}`,
            colis_name: coli.colis_name,
            quantity: coli.quantity,
            location: coli.location,
            pallet_number: coli.pallet_number,
            level_name: coli.level_name,
            aisle_name: coli.aisle_name,
            requires_forklift: coli.requires_forklift,
          });
        });
      }
    });
    
    return {
      forkliftItems: forklift,
      footItems: foot,
      totalItems: items.length,
      totalUnits: items.reduce((sum, i) => sum + i.quantity, 0),
      allPDFRows: pdfRows,
    };
  }, [items]);

  const handleExportPDF = () => {
    const doc = new (await loadPDF()).jsPDF();
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
    const forkliftRows = allPDFRows.filter(r => r.requires_forklift);
    if (forkliftRows.length > 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(220, 38, 38);
      doc.text(`🚜 REQUER EMPILHADOR (${forkliftItems.length} produtos)`, 14, yPos);
      doc.setTextColor(0);
      yPos += 4;
      
      (await loadPDF()).autoTable(doc, {
        startY: yPos,
        head: [['☐', '#', 'Código', 'Produto', 'Coli', 'Nome Coli', 'Qtd', 'Local', 'Palete', 'Nível']],
        body: forkliftRows.map((row) => [
          '', // Checkbox
          row.productIndex.toString(),
          row.product_code,
          row.product_name.substring(0, 22) + (row.product_name.length > 22 ? '...' : ''),
          row.colis_label,
          row.colis_name || '-',
          row.quantity.toString(),
          row.location || '-',
          row.pallet_number || '-',
          row.level_name || '-',
        ]),
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [254, 242, 242] },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' }, // Checkbox
          1: { cellWidth: 8, halign: 'center' }, // #
          2: { cellWidth: 22, fontStyle: 'bold' }, // Código
          3: { cellWidth: 38 }, // Produto
          4: { cellWidth: 12, halign: 'center' }, // Coli
          5: { cellWidth: 28 }, // Nome Coli
          6: { cellWidth: 10, halign: 'center' }, // Qtd
          7: { cellWidth: 18 }, // Local
          8: { cellWidth: 15 }, // Palete
          9: { cellWidth: 18 }, // Nível
        },
        margin: { left: 14, right: 14 },
      });
      
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }
    
    // Foot section
    const footRows = allPDFRows.filter(r => !r.requires_forklift);
    if (footRows.length > 0) {
      if (yPos > doc.internal.pageSize.getHeight() - 60) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(22, 163, 74);
      doc.text(`👣 ACESSÍVEL A PÉ (${footItems.length} produtos)`, 14, yPos);
      doc.setTextColor(0);
      yPos += 4;
      
      (await loadPDF()).autoTable(doc, {
        startY: yPos,
        head: [['☐', '#', 'Código', 'Produto', 'Coli', 'Nome Coli', 'Qtd', 'Local', 'Palete', 'Nível']],
        body: footRows.map((row) => [
          '', // Checkbox
          row.productIndex.toString(),
          row.product_code,
          row.product_name.substring(0, 22) + (row.product_name.length > 22 ? '...' : ''),
          row.colis_label,
          row.colis_name || '-',
          row.quantity.toString(),
          row.location || '-',
          row.pallet_number || '-',
          row.level_name || '-',
        ]),
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [240, 253, 244] },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' }, // Checkbox
          1: { cellWidth: 8, halign: 'center' }, // #
          2: { cellWidth: 22, fontStyle: 'bold' }, // Código
          3: { cellWidth: 38 }, // Produto
          4: { cellWidth: 12, halign: 'center' }, // Coli
          5: { cellWidth: 28 }, // Nome Coli
          6: { cellWidth: 10, halign: 'center' }, // Qtd
          7: { cellWidth: 18 }, // Local
          8: { cellWidth: 15 }, // Palete
          9: { cellWidth: 18 }, // Nível
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

  const renderColisDetail = (coli: ColisPickingDetail, totalColis: number) => {
    const hasLocation = coli.location || coli.pallet_number;
    
    return (
      <div
        key={`${coli.colis_number}-${coli.location || 'no-loc'}`}
        className={`flex items-center gap-3 p-2 rounded border text-sm ${
          coli.requires_forklift 
            ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800' 
            : 'bg-muted/30 border-border'
        }`}
      >
        {/* Coli number and name */}
        <div className="flex items-center gap-2 min-w-[120px]">
          <Badge variant="outline" className="font-mono">
            {coli.colis_number}/{totalColis}
          </Badge>
          {coli.colis_name && (
            <span className="text-muted-foreground truncate" title={coli.colis_name}>
              {coli.colis_name}
            </span>
          )}
        </div>
        
        {/* Quantity */}
        <Badge className="shrink-0">{coli.quantity} un.</Badge>
        
        {/* Location info */}
        <div className="flex items-center gap-3 flex-1 justify-end">
          {hasLocation ? (
            <>
              {coli.location && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span className="font-mono">{coli.location}</span>
                </div>
              )}
              {coli.pallet_number && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Package className="h-3 w-3" />
                  <span className="font-mono">{coli.pallet_number}</span>
                </div>
              )}
              {coli.level_name && (
                <Badge variant="secondary" className="text-xs">
                  {coli.level_name}
                </Badge>
              )}
              {coli.requires_forklift && (
                <Forklift className="h-4 w-4 text-red-600" />
              )}
            </>
          ) : (
            <span className="text-muted-foreground italic text-xs">Sem localização</span>
          )}
        </div>
      </div>
    );
  };

  const renderProductCard = (item: PickingItemDetailed, index: number) => {
    const colisWithData = item.colisDetails.filter(c => c.quantity > 0 || c.location);
    
    return (
      <Collapsible key={item.product_id} defaultOpen>
        <div className="rounded-lg border bg-card overflow-hidden">
          {/* Product header */}
          <CollapsibleTrigger className="w-full p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-bold shrink-0">
              {index + 1}
            </div>
            
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-semibold">{item.product_code}</span>
                <Badge>{item.quantity} un.</Badge>
                <Badge variant="outline" className="text-xs">
                  {item.total_colis} coli{item.total_colis > 1 ? 's' : ''}
                </Badge>
                {item.hasMultipleLocations && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <AlertTriangle className="h-3 w-3" />
                    Disperso
                  </Badge>
                )}
                {item.hasForkliftRequired && (
                  <Badge variant="destructive" className="gap-1 text-xs">
                    <Forklift className="h-3 w-3" />
                    Empilhador
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate mt-0.5">{item.product_name}</p>
            </div>
            
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          
          {/* Colis details */}
          <CollapsibleContent>
            <div className="px-3 pb-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                <Layers className="h-3 w-3" />
                <span>Detalhes por Coli:</span>
              </div>
              
              {colisWithData.length > 0 ? (
                colisWithData.map(coli => renderColisDetail(coli, item.total_colis))
              ) : (
                <div className="text-sm text-muted-foreground italic p-2">
                  Sem dados de localização registados
                </div>
              )}
              
              {/* Location summary */}
              {(item.uniqueLocations.length > 0 || item.uniquePallets.length > 0) && (
                <div className="flex flex-wrap gap-2 pt-2 border-t mt-2">
                  {item.uniqueLocations.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Locais:</span> {item.uniqueLocations.join(', ')}
                    </div>
                  )}
                  {item.uniquePallets.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Paletes:</span> {item.uniquePallets.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    );
  };

  const renderItemGroup = (
    groupItems: PickingItemDetailed[],
    title: string,
    icon: React.ReactNode,
    colorClass: string,
    startIndex: number
  ) => {
    if (groupItems.length === 0) return null;

    return (
      <div className="space-y-3">
        <div className={`flex items-center gap-2 ${colorClass}`}>
          {icon}
          <span className="font-semibold">{title}</span>
          <Badge variant="secondary" className="ml-auto">
            {groupItems.length} produtos
          </Badge>
        </div>
        
        <div className="space-y-2">
          {groupItems.map((item, idx) => renderProductCard(item, startIndex + idx))}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Relatório de Picking
          </DialogTitle>
          <DialogDescription>
            Revise os detalhes de cada coli antes de confirmar. Expanda os produtos para ver localizações específicas.
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
          {forkliftItems.length > 0 && (
            <Badge variant="destructive" className="gap-1">
              <Forklift className="h-3 w-3" />
              {forkliftItems.length} c/ empilhador
            </Badge>
          )}
          {reference && (
            <Badge variant="outline">Ref: {reference}</Badge>
          )}
          {reason && (
            <Badge variant="secondary">{reason}</Badge>
          )}
        </div>

        {/* Items List */}
        <ScrollArea className="flex-1 max-h-[400px] pr-4">
          <div className="space-y-6">
            {renderItemGroup(
              forkliftItems,
              'Requer Empilhador',
              <Forklift className="h-5 w-5" />,
              'text-red-600',
              0
            )}
            
            {forkliftItems.length > 0 && footItems.length > 0 && (
              <Separator />
            )}
            
            {renderItemGroup(
              footItems,
              'Acessível a Pé',
              <Footprints className="h-5 w-5" />,
              'text-green-600',
              forkliftItems.length
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
              onClick={handleExportPDF}
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
