import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ParsedCSVItem } from '@/hooks/useStockMovements';

interface StockUploadSectionProps {
  onFileParsed: (items: ParsedCSVItem[]) => void;
  parseFile: (file: File) => Promise<ParsedCSVItem[]>;
  isProcessing: boolean;
  movementType: 'entrada' | 'saida';
}

export function StockUploadSection({
  onFileParsed,
  parseFile,
  isProcessing,
  movementType,
}: StockUploadSectionProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setFileName(file.name);

    try {
      const items = await parseFile(file);
      onFileParsed(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar ficheiro');
      onFileParsed([]);
    }
  }, [parseFile, onFileParsed]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const clearFile = useCallback(() => {
    setFileName(null);
    setError(null);
    onFileParsed([]);
  }, [onFileParsed]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Upload CSV/Excel
        </CardTitle>
      </CardHeader>
      <CardContent>
        {fileName ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{fileName}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={clearFile}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
          </div>
        ) : (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
              border-2 border-dashed rounded-lg p-6 text-center transition-colors
              ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
              ${isProcessing ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:border-primary/50'}
            `}
          >
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
              id="stock-file-upload"
              disabled={isProcessing}
            />
            <label htmlFor="stock-file-upload" className="cursor-pointer">
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">
                {isProcessing ? 'A processar...' : 'Arraste um ficheiro ou clique para selecionar'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                CSV ou Excel com colunas: código, quantidade
              </p>
            </label>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ParsedItemsPreviewProps {
  items: ParsedCSVItem[];
  onClear: () => void;
}

export function ParsedItemsPreview({ items, onClear }: ParsedItemsPreviewProps) {
  const validItems = items.filter(i => i.valid);
  const invalidItems = items.filter(i => !i.valid);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Preview ({validItems.length} válidos, {invalidItems.length} erros)
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="h-4 w-4 mr-1" />
            Limpar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[200px]">
          <div className="space-y-2">
            {items.map((item, index) => (
              <div
                key={index}
                className={`flex items-center justify-between p-2 rounded-md text-sm ${
                  item.valid ? 'bg-muted' : 'bg-destructive/10'
                }`}
              >
                <div className="flex items-center gap-2">
                  {item.valid ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span className="font-mono">{item.code}</span>
                  {item.product_name && (
                    <span className="text-muted-foreground">- {item.product_name}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {item.valid ? (
                    <Badge variant="secondary">{item.quantity} un.</Badge>
                  ) : (
                    <span className="text-xs text-destructive">{item.error}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
