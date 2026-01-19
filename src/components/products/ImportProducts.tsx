import { useState, useRef, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, FileSpreadsheet, Loader2, Download, Plus, CheckCircle2, XCircle, AlertCircle, Settings2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as XLSX from 'xlsx';

interface ImportProductsProps {
  onImport: (products: Array<{ code: string; name: string; category?: string; total_colis: number; description?: string; location?: string; pallet_number?: string }>) => Promise<boolean>;
  existingCategories: string[];
  onCreateCategory: (name: string) => Promise<boolean>;
}

type ProductRow = { code: string; name: string; category: string; total_colis: number; description?: string; location?: string; pallet_number?: string };

type ColumnMapping = {
  code: string | null;
  name: string | null;
  category: string | null;
  total_colis: string | null;
  description: string | null;
  location: string | null;
  pallet_number: string | null;
};

// Extended column aliases for better detection
const COLUMN_ALIASES = {
  code: [
    'codigo', 'código', 'code', 'sku', 'ref', 'referencia', 'referência',
    'cod', 'cod_produto', 'codigo_produto', 'código_produto', 'product_code',
    'id_produto', 'item', 'item_code', 'artigo', 'cod_artigo', 'ean', 'barcode',
    'cod.', 'ref.', 'referencia_produto', 'cod_item'
  ],
  name: [
    'nome', 'name', 'produto', 'product', 'descricao_produto', 'descrição_produto',
    'nome_produto', 'product_name', 'designacao', 'designação', 'titulo', 'título',
    'item_name', 'descricao_item', 'nome_artigo', 'artigo_nome', 'desc', 'descrição'
  ],
  category: [
    'categoria', 'category', 'cat', 'grupo', 'group', 'tipo', 'type',
    'familia', 'família', 'family', 'classe', 'class', 'segmento', 'segment',
    'departamento', 'department', 'secao', 'seção', 'section', 'linha', 'line'
  ],
  total_colis: [
    'colis', 'total_colis', 'volumes', 'qtd_colis', 'quantidade_colis',
    'num_colis', 'número_colis', 'n_colis', 'pecas', 'peças', 'partes', 'parts',
    'qtd_volumes', 'quantidade_volumes', 'qt_colis', 'qt_volumes', 'qte', 'qty',
    'quantidade', 'unidades', 'units', 'pacotes', 'packages', 'boxes', 'caixas'
  ],
  description: [
    'descricao', 'descrição', 'description', 'obs', 'observacao', 'observação',
    'observacoes', 'observações', 'notes', 'notas', 'detalhes', 'details',
    'info', 'informacao', 'informação', 'comentario', 'comentário', 'comments'
  ],
  location: [
    'localizacao', 'localização', 'location', 'local', 'armazem', 'armazém',
    'warehouse', 'deposito', 'depósito', 'endereco', 'endereço', 'address',
    'posicao', 'posição', 'position', 'corredor', 'aisle', 'prateleira', 'shelf',
    'estante', 'rack', 'zona', 'zone', 'area', 'área', 'setor', 'sector'
  ],
  pallet_number: [
    'palete', 'pallet', 'pallet_number', 'num_palete', 'número_palete',
    'numero_palete', 'n_palete', 'pallet_id', 'id_palete', 'codigo_palete',
    'código_palete', 'lote', 'lot', 'batch', 'contentor', 'container'
  ]
};

const FIELD_LABELS: Record<keyof ColumnMapping, string> = {
  code: 'Código',
  name: 'Nome',
  category: 'Categoria',
  total_colis: 'Colis',
  description: 'Descrição',
  location: 'Localização',
  pallet_number: 'Palete'
};

const FIELD_ORDER: Array<keyof ColumnMapping> = ['code', 'name', 'category', 'total_colis', 'description', 'location', 'pallet_number'];

export function ImportProducts({ onImport, existingCategories, onCreateCategory }: ImportProductsProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<ProductRow[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
  const [allFileColumns, setAllFileColumns] = useState<string[]>([]);
  const [rawData, setRawData] = useState<Record<string, unknown>[]>([]);
  const [showManualMapping, setShowManualMapping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Helper to find matching column
  const findColumn = useCallback((columns: string[], aliases: string[]): string | null => {
    for (const alias of aliases) {
      const found = columns.find(col => 
        col.toLowerCase().trim().replace(/[_\s.-]/g, '') === alias.toLowerCase().replace(/[_\s.-]/g, '')
      );
      if (found) return found;
    }
    // Also try partial match
    for (const alias of aliases) {
      const found = columns.find(col => 
        col.toLowerCase().trim().includes(alias.toLowerCase()) ||
        alias.toLowerCase().includes(col.toLowerCase().trim())
      );
      if (found) return found;
    }
    return null;
  }, []);

  // Generate products from raw data and current mapping
  const generateProducts = useCallback((data: Record<string, unknown>[], mapping: ColumnMapping): ProductRow[] => {
    const products: ProductRow[] = [];
    
    for (const row of data) {
      const getValue = (columnName: string | null): string => {
        if (!columnName || row[columnName] === undefined || row[columnName] === '') return '';
        return String(row[columnName]).trim();
      };
      
      const code = getValue(mapping.code);
      const name = getValue(mapping.name);
      
      if (code && name) {
        products.push({
          code,
          name,
          category: getValue(mapping.category) || 'Geral',
          total_colis: parseInt(getValue(mapping.total_colis)) || 1,
          description: getValue(mapping.description) || undefined,
          location: getValue(mapping.location) || undefined,
          pallet_number: getValue(mapping.pallet_number) || undefined
        });
      }
    }
    
    return products;
  }, []);

  const parseCSV = (text: string): { data: Record<string, unknown>[]; mapping: ColumnMapping; columns: string[] } => {
    const lines = text.split('\n').filter(line => line.trim());
    
    // Get header columns
    const headerLine = lines[0] || '';
    const columns = headerLine.split(/[,;]/).map(v => v.trim().replace(/^"|"$/g, ''));
    
    // Detect column mappings using aliases
    const mapping: ColumnMapping = {
      code: findColumn(columns, COLUMN_ALIASES.code) || columns[0] || null,
      name: findColumn(columns, COLUMN_ALIASES.name) || columns[1] || null,
      category: findColumn(columns, COLUMN_ALIASES.category) || columns[2] || null,
      total_colis: findColumn(columns, COLUMN_ALIASES.total_colis) || columns[3] || null,
      description: findColumn(columns, COLUMN_ALIASES.description) || columns[4] || null,
      location: findColumn(columns, COLUMN_ALIASES.location) || columns[5] || null,
      pallet_number: findColumn(columns, COLUMN_ALIASES.pallet_number) || columns[6] || null
    };

    // Convert to JSON-like structure
    const data: Record<string, unknown>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(/[,;]/).map(v => v.trim().replace(/^"|"$/g, ''));
      const row: Record<string, unknown> = {};
      columns.forEach((col, idx) => {
        row[col] = values[idx] || '';
      });
      if (Object.values(row).some(v => v !== '')) {
        data.push(row);
      }
    }

    return { data, mapping, columns };
  };

  const parseXLSX = (data: ArrayBuffer): { data: Record<string, unknown>[]; mapping: ColumnMapping; columns: string[] } => {
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Convert to JSON with header row
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
    
    // Get all column names from the file
    const columns = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
    
    const mapping: ColumnMapping = {
      code: findColumn(columns, COLUMN_ALIASES.code),
      name: findColumn(columns, COLUMN_ALIASES.name),
      category: findColumn(columns, COLUMN_ALIASES.category),
      total_colis: findColumn(columns, COLUMN_ALIASES.total_colis),
      description: findColumn(columns, COLUMN_ALIASES.description),
      location: findColumn(columns, COLUMN_ALIASES.location),
      pallet_number: findColumn(columns, COLUMN_ALIASES.pallet_number)
    };
    
    return { data: jsonData, mapping, columns };
  };

  // Calculate new categories that will be created
  const newCategories = useMemo(() => {
    if (preview.length === 0) return [];
    const csvCategories = [...new Set(preview.map(p => p.category))];
    return csvCategories.filter(cat => !existingCategories.includes(cat));
  }, [preview, existingCategories]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          const { data, mapping, columns } = parseXLSX(arrayBuffer);
          setRawData(data);
          setColumnMapping(mapping);
          setAllFileColumns(columns);
          
          const products = generateProducts(data, mapping);
          setPreview(products);

          // Show manual mapping if required columns are missing
          if (!mapping.code || !mapping.name) {
            setShowManualMapping(true);
            toast({
              title: 'Mapeamento necessário',
              description: 'Selecione manualmente as colunas para código e nome.',
              variant: 'default'
            });
          } else {
            setShowManualMapping(false);
          }

          if (products.length === 0 && mapping.code && mapping.name) {
            toast({
              title: 'Nenhum produto encontrado',
              description: 'O ficheiro não contém dados válidos.',
              variant: 'destructive'
            });
          }
        } catch (error) {
          toast({
            title: 'Erro ao ler ficheiro',
            description: 'Não foi possível processar o ficheiro Excel',
            variant: 'destructive'
          });
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const { data, mapping, columns } = parseCSV(text);
        setRawData(data);
        setColumnMapping(mapping);
        setAllFileColumns(columns);
        
        const products = generateProducts(data, mapping);
        setPreview(products);

        if (!mapping.code || !mapping.name) {
          setShowManualMapping(true);
        } else {
          setShowManualMapping(false);
        }

        if (products.length === 0) {
          toast({
            title: 'Ficheiro vazio',
            description: 'Não foram encontrados produtos no ficheiro',
            variant: 'destructive'
          });
        }
      };
      reader.readAsText(file);
    }
  };

  const handleMappingChange = (field: keyof ColumnMapping, value: string) => {
    if (!columnMapping) return;
    
    const newMapping = {
      ...columnMapping,
      [field]: value === '__none__' ? null : value
    };
    setColumnMapping(newMapping);
    
    // Regenerate products with new mapping
    const products = generateProducts(rawData, newMapping);
    setPreview(products);
  };

  const handleImport = async () => {
    if (preview.length === 0) return;
    
    setIsLoading(true);
    
    // First create missing categories
    let categoriesCreated = 0;
    for (const categoryName of newCategories) {
      const success = await onCreateCategory(categoryName);
      if (success) categoriesCreated++;
    }
    
    // Then import products
    const success = await onImport(preview);
    
    if (success) {
      if (categoriesCreated > 0) {
        toast({
          title: 'Importação concluída',
          description: `${preview.length} produtos importados. ${categoriesCreated} categoria(s) nova(s) criada(s).`
        });
      }
      resetState();
      setOpen(false);
    }
    
    setIsLoading(false);
  };

  const resetState = () => {
    setPreview([]);
    setColumnMapping(null);
    setAllFileColumns([]);
    setRawData([]);
    setShowManualMapping(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const downloadTemplate = () => {
    const template = 'codigo;nome;categoria;colis;descricao;localizacao;palete\nCAMA001;Cama Oslo Queen;Camas;3;Cama de casal;Armazém A;PAL-001\nMESA001;Mesa de Jantar;Mesas;1;Mesa 6 lugares;Armazém B;PAL-002\nROUP001;Roupeiro Oslo;Roupeiros;4;Roupeiro 3 portas;Armazém A;PAL-003';
    const blob = new Blob(['\ufeff' + template], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_produtos.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const isNewCategory = (category: string) => newCategories.includes(category);

  const handleClose = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      resetState();
    }
  };

  const hasRequiredColumns = columnMapping?.code && columnMapping?.name;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4 mr-2" />
          Importar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Produtos</DialogTitle>
          <DialogDescription>
            Carregue um ficheiro CSV ou Excel (.xlsx) com os produtos a importar
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,.xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload">
              <Button variant="outline" asChild>
                <span className="cursor-pointer">Selecionar ficheiro (CSV ou Excel)</span>
              </Button>
            </label>
            <p className="text-sm text-muted-foreground mt-2">
              Colunas obrigatórias: código e nome. Opcionais: categoria, colis, descrição, localização, palete
            </p>
          </div>

          <Button variant="link" size="sm" onClick={downloadTemplate} className="p-0">
            <Download className="h-4 w-4 mr-1" />
            Descarregar template
          </Button>

          {/* Column Mapping Section */}
          {columnMapping && allFileColumns.length > 0 && (
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  Colunas do ficheiro: <span className="font-normal text-muted-foreground">{allFileColumns.length}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowManualMapping(!showManualMapping)}
                  className="gap-1"
                >
                  <Settings2 className="h-4 w-4" />
                  {showManualMapping ? 'Ocultar mapeamento' : 'Mapear manualmente'}
                </Button>
              </div>

              {/* Auto-detected status */}
              {!showManualMapping && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {FIELD_ORDER.map(field => {
                    const detected = columnMapping[field];
                    const isRequired = field === 'code' || field === 'name';
                    const isDetected = detected !== null;
                    
                    return (
                      <div 
                        key={field}
                        className={`flex items-center gap-2 text-sm p-2 rounded-md ${
                          isDetected 
                            ? 'bg-green-500/10 text-green-700 dark:text-green-400' 
                            : isRequired 
                              ? 'bg-destructive/10 text-destructive' 
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {isDetected ? (
                          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                        ) : isRequired ? (
                          <XCircle className="h-4 w-4 flex-shrink-0" />
                        ) : (
                          <div className="h-4 w-4 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="font-medium truncate">{FIELD_LABELS[field]}</div>
                          {isDetected && (
                            <div className="text-xs opacity-75 truncate">← {detected}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Manual Mapping UI */}
              {showManualMapping && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Selecione a coluna do ficheiro correspondente a cada campo:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {FIELD_ORDER.map(field => {
                      const isRequired = field === 'code' || field === 'name';
                      const currentValue = columnMapping[field];
                      
                      return (
                        <div key={field} className="flex items-center gap-2">
                          <div className="w-28 flex-shrink-0">
                            <span className={`text-sm font-medium ${isRequired ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {FIELD_LABELS[field]}
                              {isRequired && <span className="text-destructive ml-1">*</span>}
                            </span>
                          </div>
                          <Select
                            value={currentValue || '__none__'}
                            onValueChange={(value) => handleMappingChange(field, value)}
                          >
                            <SelectTrigger className={`flex-1 ${!currentValue && isRequired ? 'border-destructive' : ''}`}>
                              <SelectValue placeholder="Selecionar coluna..." />
                            </SelectTrigger>
                            <SelectContent className="bg-popover">
                              <SelectItem value="__none__">
                                <span className="text-muted-foreground">— Não mapear —</span>
                              </SelectItem>
                              {allFileColumns.map(col => (
                                <SelectItem key={col} value={col}>
                                  {col}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {!hasRequiredColumns && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <XCircle className="h-4 w-4" />
                  Colunas obrigatórias em falta. Utilize o mapeamento manual.
                </p>
              )}
            </div>
          )}

          {newCategories.length > 0 && (
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Categorias a criar: {newCategories.length} nova(s)
              </p>
              <div className="flex flex-wrap gap-1 mt-2">
                {newCategories.map(cat => (
                  <Badge key={cat} variant="secondary" className="bg-primary/20">
                    {cat}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {preview.length > 0 && (
            <div className="border rounded-lg max-h-64 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-2">Código</th>
                    <th className="text-left p-2">Nome</th>
                    <th className="text-left p-2">Categoria</th>
                    <th className="text-left p-2">Colis</th>
                    <th className="text-left p-2">Descrição</th>
                    <th className="text-left p-2">Localização</th>
                    <th className="text-left p-2">Palete</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 50).map((product, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{product.code}</td>
                      <td className="p-2">{product.name}</td>
                      <td className="p-2">
                        <span className="flex items-center gap-1">
                          {product.category}
                          {isNewCategory(product.category) && (
                            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                              NOVA
                            </Badge>
                          )}
                        </span>
                      </td>
                      <td className="p-2">{product.total_colis}</td>
                      <td className="p-2 text-muted-foreground">{product.description || '-'}</td>
                      <td className="p-2 text-muted-foreground">{product.location || '-'}</td>
                      <td className="p-2 text-muted-foreground">{product.pallet_number || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 50 && (
                <div className="p-2 text-center text-sm text-muted-foreground bg-muted">
                  Mostrando 50 de {preview.length} produtos
                </div>
              )}
            </div>
          )}

          {rawData.length > 0 && preview.length === 0 && hasRequiredColumns && (
            <div className="text-center py-4 text-muted-foreground">
              Nenhum produto válido encontrado com o mapeamento atual.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={isLoading || preview.length === 0 || !hasRequiredColumns}>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Importar {preview.length} produtos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
