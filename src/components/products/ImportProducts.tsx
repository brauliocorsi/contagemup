import { useState, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, FileSpreadsheet, Loader2, Download, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

interface ImportProductsProps {
  onImport: (products: Array<{ code: string; name: string; category?: string; total_colis: number; description?: string; location?: string; pallet_number?: string }>) => Promise<boolean>;
  existingCategories: string[];
  onCreateCategory: (name: string) => Promise<boolean>;
}

export function ImportProducts({ onImport, existingCategories, onCreateCategory }: ImportProductsProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<Array<{ code: string; name: string; category: string; total_colis: number; description?: string; location?: string; pallet_number?: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const parseCSV = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim());
    const products: Array<{ code: string; name: string; category: string; total_colis: number; description?: string; location?: string; pallet_number?: string }> = [];

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(/[,;]/).map(v => v.trim().replace(/^"|"$/g, ''));
      if (values.length >= 3) {
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

    return products;
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

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const products = parseCSV(text);
      setPreview(products);

      if (products.length === 0) {
        toast({
          title: 'Ficheiro vazio',
          description: 'Não foram encontrados produtos no ficheiro',
          variant: 'destructive'
        });
      }
    };
    reader.readAsText(file);
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4 mr-2" />
          Importar CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar Produtos</DialogTitle>
          <DialogDescription>
            Carregue um ficheiro CSV com os produtos a importar
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload">
              <Button variant="outline" asChild>
                <span className="cursor-pointer">Selecionar ficheiro CSV</span>
              </Button>
            </label>
            <p className="text-sm text-muted-foreground mt-2">
              Formato: codigo;nome;categoria;colis;descricao;localizacao;palete
            </p>
          </div>

          <Button variant="link" size="sm" onClick={downloadTemplate} className="p-0">
            <Download className="h-4 w-4 mr-1" />
            Descarregar template
          </Button>

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
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
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
