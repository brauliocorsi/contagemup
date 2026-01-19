import { useState, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, FileSpreadsheet, Loader2, Download, Plus, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
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

export function ImportProducts({ onImport, existingCategories, onCreateCategory }: ImportProductsProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<ProductRow[]>([]);
  const [detectedColumns, setDetectedColumns] = useState<ColumnMapping | null>(null);
  const [allFileColumns, setAllFileColumns] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const parseCSV = (text: string): { products: ProductRow[]; mapping: ColumnMapping; columns: string[] } => {
    const lines = text.split('\n').filter(line => line.trim());
    const products: ProductRow[] = [];
    
    // Get header columns
    const headerLine = lines[0] || '';
    const columns = headerLine.split(/[,;]/).map(v => v.trim().replace(/^"|"$/g, ''));
    
    // For CSV, we use positional mapping
    const mapping: ColumnMapping = {
      code: columns[0] || null,
      name: columns[1] || null,
      category: columns[2] || null,
      total_colis: columns[3] || null,
      description: columns[4] || null,
      location: columns[5] || null,
      pallet_number: columns[6] || null
    };

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(/[,;]/).map(v => v.trim().replace(/^"|"$/g, ''));
      if (values.length >= 2 && values[0] && values[1]) {
        products.push({
          code: values[0],
          name: values[1],
          category: values[2] || 'Geral',
          total_colis: parseInt(values[3]) || 1,
          description: values[4] || undefined,
          location: values[5] || undefined,
          pallet_number: values[6] || undefined
        });
      }
    }

    return { products, mapping, columns };
  };

  const parseXLSX = (data: ArrayBuffer): { products: ProductRow[]; mapping: ColumnMapping; columns: string[] } => {
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Convert to JSON with header row
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
    
    // Get all column names from the file
    const columns = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
    
    const products: ProductRow[] = [];
    const mapping: ColumnMapping = {
      code: null,
      name: null,
      category: null,
      total_colis: null,
      description: null,
      location: null,
      pallet_number: null
    };
    
    // Helper to find matching column
    const findColumn = (aliases: string[]): string | null => {
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
    };
    
    // Detect column mappings
    mapping.code = findColumn(COLUMN_ALIASES.code);
    mapping.name = findColumn(COLUMN_ALIASES.name);
    mapping.category = findColumn(COLUMN_ALIASES.category);
    mapping.total_colis = findColumn(COLUMN_ALIASES.total_colis);
    mapping.description = findColumn(COLUMN_ALIASES.description);
    mapping.location = findColumn(COLUMN_ALIASES.location);
    mapping.pallet_number = findColumn(COLUMN_ALIASES.pallet_number);
    
    for (const row of jsonData) {
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
    
    return { products, mapping, columns };
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
          const data = event.target?.result as ArrayBuffer;
          const { products, mapping, columns } = parseXLSX(data);
          setPreview(products);
          setDetectedColumns(mapping);
          setAllFileColumns(columns);

          if (products.length === 0) {
            toast({
              title: 'Nenhum produto encontrado',
              description: `Colunas detectadas: ${columns.join(', ')}. Verifique se existem colunas para código e nome.`,
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
        const { products, mapping, columns } = parseCSV(text);
        setPreview(products);
        setDetectedColumns(mapping);
        setAllFileColumns(columns);

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
      setPreview([]);
      setDetectedColumns(null);
      setAllFileColumns([]);
      setOpen(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
    
    setIsLoading(false);
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
      setPreview([]);
      setDetectedColumns(null);
      setAllFileColumns([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

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

          {/* Column Detection Display */}
          {detectedColumns && allFileColumns.length > 0 && (
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                Colunas do ficheiro: <span className="font-normal text-muted-foreground">{allFileColumns.join(', ')}</span>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {(Object.keys(detectedColumns) as Array<keyof ColumnMapping>).map(field => {
                  const detected = detectedColumns[field];
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
              
              {(!detectedColumns.code || !detectedColumns.name) && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <XCircle className="h-4 w-4" />
                  Colunas obrigatórias em falta. Verifique o nome das colunas no ficheiro.
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
                  {preview.map((product, i) => (
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
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={isLoading || preview.length === 0}>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Importar {preview.length} produtos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
