import { useState, useMemo, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { AlertTriangle, Upload, TrendingUp, TrendingDown, FileSpreadsheet, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface CorrectionItem {
  productId: string;
  code: string;
  name: string;
  totalColis: number;
  currentStock: number;
  targetStock: number;
  difference: number;
  selected: boolean;
}

interface DiscrepancyItem {
  productId: string;
  code: string;
  name: string;
  totalColis: number;
  dbStock: number;
  calculatedStock: number;
  difference: number;
}

interface BulkStockCorrectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  discrepancies: DiscrepancyItem[];
  onSuccess: () => void;
}

export function BulkStockCorrectionDialog({
  open,
  onOpenChange,
  discrepancies,
  onSuccess,
}: BulkStockCorrectionDialogProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Initialize items from discrepancies
  const [items, setItems] = useState<CorrectionItem[]>(() => 
    discrepancies.map(d => ({
      productId: d.productId,
      code: d.code,
      name: d.name,
      totalColis: d.totalColis,
      currentStock: d.dbStock,
      targetStock: d.calculatedStock, // Default to calculated stock
      difference: d.calculatedStock - d.dbStock,
      selected: true,
    }))
  );
  
  const [importedItems, setImportedItems] = useState<CorrectionItem[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'discrepancies' | 'import'>('discrepancies');

  // Recalculate items when discrepancies change
  useMemo(() => {
    if (discrepancies.length > 0 && items.length === 0) {
      setItems(discrepancies.map(d => ({
        productId: d.productId,
        code: d.code,
        name: d.name,
        totalColis: d.totalColis,
        currentStock: d.dbStock,
        targetStock: d.calculatedStock,
        difference: d.calculatedStock - d.dbStock,
        selected: true,
      })));
    }
  }, [discrepancies]);

  const currentItems = activeTab === 'discrepancies' ? items : importedItems;
  const setCurrentItems = activeTab === 'discrepancies' ? setItems : setImportedItems;

  const selectedItems = currentItems.filter(item => item.selected && item.difference !== 0);
  const totalDifference = selectedItems.reduce((sum, item) => sum + item.difference, 0);

  const handleSelectAll = (checked: boolean) => {
    setCurrentItems(prev => prev.map(item => ({ ...item, selected: checked })));
  };

  const handleToggleItem = (productId: string) => {
    setCurrentItems(prev => 
      prev.map(item => 
        item.productId === productId 
          ? { ...item, selected: !item.selected }
          : item
      )
    );
  };

  const handleTargetStockChange = (productId: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setCurrentItems(prev =>
      prev.map(item =>
        item.productId === productId
          ? { 
              ...item, 
              targetStock: numValue, 
              difference: numValue - item.currentStock 
            }
          : item
      )
    );
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];

      // Fetch all products to match codes
      const { data: products, error } = await supabase
        .from('products')
        .select('id, code, name, total_colis, current_stock');
      
      if (error) throw error;

      const productMap = new Map(products.map(p => [p.code.toLowerCase(), p]));
      const newItems: CorrectionItem[] = [];
      const errors: string[] = [];

      jsonData.forEach((row, index) => {
        // Find code column (flexible matching)
        const codeValue = row['codigo'] || row['Codigo'] || row['CODIGO'] || 
                         row['code'] || row['Code'] || row['CODE'] ||
                         row['Código'] || row['código'];
        
        // Find stock column (flexible matching)
        const stockValue = row['stock'] || row['Stock'] || row['STOCK'] ||
                          row['quantidade'] || row['Quantidade'] || row['QUANTIDADE'] ||
                          row['qty'] || row['Qty'] || row['QTY'];

        if (!codeValue) {
          errors.push(`Linha ${index + 2}: Código não encontrado`);
          return;
        }

        const code = String(codeValue).trim().toLowerCase();
        const stock = parseInt(String(stockValue)) || 0;

        const product = productMap.get(code);
        if (!product) {
          errors.push(`Linha ${index + 2}: Produto "${codeValue}" não encontrado`);
          return;
        }

        newItems.push({
          productId: product.id,
          code: product.code,
          name: product.name,
          totalColis: product.total_colis,
          currentStock: product.current_stock,
          targetStock: stock,
          difference: stock - product.current_stock,
          selected: true,
        });
      });

      setImportedItems(newItems);
      setImportErrors(errors);
      setActiveTab('import');

      if (errors.length > 0) {
        toast.warning(`Importados ${newItems.length} produtos com ${errors.length} erros`);
      } else {
        toast.success(`Importados ${newItems.length} produtos`);
      }
    } catch (err) {
      toast.error('Erro ao ler ficheiro: ' + (err as Error).message);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDownloadTemplate = () => {
    const template = [
      { Codigo: 'PROD001', Stock: 100 },
      { Codigo: 'PROD002', Stock: 50 },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'template_correcao_stock.xlsx');
  };

  const correctionMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      for (const item of selectedItems) {
        if (item.difference === 0) continue;

        // 1. Create stock movement for audit
        const { error: movementError } = await supabase
          .from('stock_movements')
          .insert({
            product_id: item.productId,
            movement_type: item.difference > 0 ? 'entrada' : 'saida',
            quantity: Math.abs(item.difference),
            reason: 'Ajuste de inventário',
            notes: `Correcção em massa: ${item.currentStock} → ${item.targetStock}`,
            created_by: user?.id || null,
          });

        if (movementError) throw movementError;

        // 2. Update counts for all colis
        for (let colis = 1; colis <= item.totalColis; colis++) {
          // First try to find existing count without session
          const { data: existingCounts } = await supabase
            .from('counts')
            .select('id')
            .eq('product_id', item.productId)
            .eq('colis_number', colis)
            .is('session_id', null)
            .limit(1);

          if (existingCounts && existingCounts.length > 0) {
            // Update existing administrative count
            const { error: updateError } = await supabase
              .from('counts')
              .update({ 
                quantity: item.targetStock, 
                updated_at: new Date().toISOString() 
              })
              .eq('id', existingCounts[0].id);

            if (updateError) throw updateError;
          } else {
            // Insert new administrative count
            const { error: insertError } = await supabase
              .from('counts')
              .insert({
                product_id: item.productId,
                colis_number: colis,
                quantity: item.targetStock,
                session_id: null,
                location: null,
                pallet_number: null,
              });

            if (insertError) throw insertError;
          }
        }

        // 3. Create product change record for audit
        const { error: changeError } = await supabase
          .from('product_changes')
          .insert({
            product_id: item.productId,
            change_type: 'stock_correction',
            field_changed: 'current_stock',
            old_value: String(item.currentStock),
            new_value: String(item.targetStock),
            changed_by: user?.id || null,
          });

        if (changeError) throw changeError;
      }
    },
    onSuccess: () => {
      toast.success(`${selectedItems.length} produtos corrigidos com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ['stock-integrity'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['counts'] });
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error('Erro ao corrigir stock: ' + (error as Error).message);
    },
  });

  const allSelected = currentItems.length > 0 && currentItems.every(item => item.selected);
  const someSelected = currentItems.some(item => item.selected) && !allSelected;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            Correcção de Stock em Massa
          </DialogTitle>
          <DialogDescription>
            Corrija o stock de múltiplos produtos de uma vez. Todas as alterações ficam registadas para auditoria.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'discrepancies' | 'import')} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="discrepancies">
              Discrepâncias ({discrepancies.length})
            </TabsTrigger>
            <TabsTrigger value="import">
              Importar Ficheiro {importedItems.length > 0 && `(${importedItems.length})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="discrepancies" className="flex-1 flex flex-col overflow-hidden mt-4">
            {items.length > 0 ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <Checkbox
                    checked={allSelected}
                    ref={(el) => {
                      if (el) {
                        (el as HTMLButtonElement & { indeterminate?: boolean }).indeterminate = someSelected;
                      }
                    }}
                    onCheckedChange={handleSelectAll}
                  />
                  <span className="text-sm text-muted-foreground">
                    Seleccionar todos ({items.length} produtos)
                  </span>
                </div>
                <ScrollArea className="flex-1 border rounded-lg">
                  <div className="p-2 space-y-2">
                    {items.map((item) => (
                      <CorrectionItemRow
                        key={item.productId}
                        item={item}
                        onToggle={() => handleToggleItem(item.productId)}
                        onTargetChange={(value) => handleTargetStockChange(item.productId, value)}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                Nenhuma discrepância detectada
              </div>
            )}
          </TabsContent>

          <TabsContent value="import" className="flex-1 flex flex-col overflow-hidden mt-4">
            <div className="flex items-center gap-2 mb-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                Carregar Ficheiro
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownloadTemplate}
              >
                <Download className="h-4 w-4 mr-2" />
                Template
              </Button>
              <span className="text-sm text-muted-foreground">
                Formatos: XLSX, XLS, CSV
              </span>
            </div>

            {importErrors.length > 0 && (
              <div className="mb-3 p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-lg">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                  Erros na importação:
                </p>
                <ul className="text-sm text-yellow-700 dark:text-yellow-300 list-disc list-inside">
                  {importErrors.slice(0, 5).map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                  {importErrors.length > 5 && (
                    <li>... e mais {importErrors.length - 5} erros</li>
                  )}
                </ul>
              </div>
            )}

            {importedItems.length > 0 ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={handleSelectAll}
                  />
                  <span className="text-sm text-muted-foreground">
                    Seleccionar todos ({importedItems.length} produtos)
                  </span>
                </div>
                <ScrollArea className="flex-1 border rounded-lg">
                  <div className="p-2 space-y-2">
                    {importedItems.map((item) => (
                      <CorrectionItemRow
                        key={item.productId}
                        item={item}
                        onToggle={() => handleToggleItem(item.productId)}
                        onTargetChange={(value) => handleTargetStockChange(item.productId, value)}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-4">
                <FileSpreadsheet className="h-12 w-12" />
                <div className="text-center">
                  <p>Carregue um ficheiro com os códigos e quantidades</p>
                  <p className="text-sm">Colunas: Codigo, Stock</p>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Summary */}
        <div className="border-t pt-4 mt-4">
          <div className="flex items-center justify-between text-sm mb-4">
            <span>
              <strong>{selectedItems.length}</strong> produtos seleccionados
            </span>
            <span className={`font-bold ${
              totalDifference > 0 ? 'text-green-600' : 
              totalDifference < 0 ? 'text-red-600' : 'text-muted-foreground'
            }`}>
              Total: {totalDifference > 0 ? '+' : ''}{totalDifference} unidades
            </span>
          </div>

          <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-lg mb-4">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Esta acção irá criar movimentos de stock e actualizar as contagens. 
              Todas as alterações ficam registadas para auditoria.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => correctionMutation.mutate()}
            disabled={selectedItems.length === 0 || correctionMutation.isPending}
          >
            {correctionMutation.isPending ? 'A corrigir...' : `Confirmar Correcções (${selectedItems.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CorrectionItemRowProps {
  item: CorrectionItem;
  onToggle: () => void;
  onTargetChange: (value: string) => void;
}

function CorrectionItemRow({ item, onToggle, onTargetChange }: CorrectionItemRowProps) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border ${
        item.selected && item.difference !== 0
          ? item.difference > 0
            ? 'bg-green-50/50 border-green-200 dark:bg-green-950/20 dark:border-green-900'
            : 'bg-red-50/50 border-red-200 dark:bg-red-950/20 dark:border-red-900'
          : 'bg-muted/30 border-border'
      }`}
    >
      <Checkbox checked={item.selected} onCheckedChange={onToggle} />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium">{item.code}</span>
          {item.totalColis > 1 && (
            <Badge variant="outline" className="text-xs">
              {item.totalColis} colis
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">{item.name}</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Stock BD</p>
          <p className="font-medium">{item.currentStock}</p>
        </div>
        
        <span className="text-muted-foreground">→</span>
        
        <div>
          <p className="text-xs text-muted-foreground">Stock Correcto</p>
          <Input
            type="number"
            min="0"
            value={item.targetStock}
            onChange={(e) => onTargetChange(e.target.value)}
            className="w-20 h-8 text-center"
          />
        </div>

        <div className="w-16 text-right">
          {item.difference !== 0 && (
            <div className="flex items-center justify-end gap-1">
              {item.difference > 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
              <span className={`font-bold ${
                item.difference > 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {item.difference > 0 ? '+' : ''}{item.difference}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
