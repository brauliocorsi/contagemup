import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, MapPin, AlertTriangle } from 'lucide-react';
import { useCategories } from '@/hooks/useCategories';
import { useActiveProductCounts, ActiveCountInfo } from '@/hooks/useActiveProductCounts';
import { Product } from '@/types/stock';

interface ProductEditFormProps {
  product: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (id: string, updates: Partial<Product>) => Promise<boolean>;
}

export function ProductEditForm({ product, open, onOpenChange, onSubmit }: ProductEditFormProps) {
  const { categories, loading: categoriesLoading } = useCategories();
  const { checkActiveCountsForProduct } = useActiveProductCounts();
  const [isLoading, setIsLoading] = useState(false);
  const [code, setCode] = useState(product.code);
  const [name, setName] = useState(product.name);
  const [category, setCategory] = useState(product.category);
  const [totalColis, setTotalColis] = useState(product.total_colis);
  const [description, setDescription] = useState(product.description || '');
  const [location, setLocation] = useState(product.location || '');
  const [supplierCode, setSupplierCode] = useState(product.supplier_code || '');
  const [minStock, setMinStock] = useState(product.min_stock ?? 5);
  const [activeCounts, setActiveCounts] = useState<ActiveCountInfo[]>([]);
  const [showColisWarning, setShowColisWarning] = useState(false);

  // Reset form when product changes
  useEffect(() => {
    setCode(product.code);
    setName(product.name);
    setCategory(product.category);
    setTotalColis(product.total_colis);
    setDescription(product.description || '');
    setLocation(product.location || '');
    setSupplierCode(product.supplier_code || '');
    setMinStock(product.min_stock ?? 5);
    setShowColisWarning(false);
    setActiveCounts([]);
  }, [product]);

  // Check for active counts when dialog opens
  useEffect(() => {
    const checkCounts = async () => {
      if (open && product.id) {
        const counts = await checkActiveCountsForProduct(product.id);
        setActiveCounts(counts);
      }
    };
    checkCounts();
  }, [open, product.id, checkActiveCountsForProduct]);

  // Show warning when colis number changes and there are active counts
  useEffect(() => {
    if (totalColis !== product.total_colis && activeCounts.length > 0) {
      setShowColisWarning(true);
    } else {
      setShowColisWarning(false);
    }
  }, [totalColis, product.total_colis, activeCounts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    const success = await onSubmit(product.id, {
      code,
      name,
      category,
      total_colis: totalColis,
      description: description || null,
      location: location || null,
      min_stock: minStock
    });

    if (success) {
      onOpenChange(false);
    }
    
    setIsLoading(false);
  };

  const handleColisChange = (value: string) => {
    const num = parseInt(value) || 1;
    setTotalColis(Math.max(1, Math.min(20, num)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Editar Produto</DialogTitle>
            <DialogDescription>
              Altere os dados do produto
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-code">Código *</Label>
              <Input
                id="edit-code"
                placeholder="Ex: CAMA001"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome *</Label>
              <Input
                id="edit-name"
                placeholder="Ex: Cama Oslo Queen"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-category">Categoria *</Label>
              <Select value={category} onValueChange={setCategory} disabled={categoriesLoading}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-colis">Número de Colis *</Label>
              <Input
                id="edit-colis"
                type="number"
                min={1}
                max={20}
                value={totalColis}
                onChange={(e) => handleColisChange(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Quantas partes/colis compõem este produto (1-20)
              </p>
              
              {/* Warning about active counts */}
              {showColisWarning && (
                <Alert variant="destructive" className="mt-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Atenção!</strong> Este produto tem contagens ativas em {activeCounts.length} sessão(ões):
                    <ul className="list-disc list-inside mt-1 text-sm">
                      {activeCounts.map(ac => (
                        <li key={ac.sessionId}>
                          {ac.sessionName}: {ac.totalCounts} unidade(s) contada(s)
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-sm">
                      Alterar o número de colis pode afetar as contagens existentes.
                    </p>
                  </AlertDescription>
                </Alert>
              )}
              
              {/* Info about active counts even without change */}
              {activeCounts.length > 0 && !showColisWarning && (
                <div className="flex items-center gap-2 text-sm text-yellow-600 bg-yellow-50 p-2 rounded mt-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>Este produto tem contagens em {activeCounts.length} sessão(ões) ativa(s)</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-min-stock">Stock Mínimo</Label>
              <NumericInput
                id="edit-min-stock"
                min={0}
                value={minStock}
                onChange={setMinStock}
              />
              <p className="text-xs text-muted-foreground">
                Alerta quando o stock ficar abaixo deste valor
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Descrição</Label>
              <Textarea
                id="edit-description"
                placeholder="Descrição opcional"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-supplier-code" className="flex items-center gap-1">
                <ScanBarcode className="h-3 w-3" />
                Código do Fornecedor
              </Label>
              <div className="flex gap-2">
                <Input
                  id="edit-supplier-code"
                  placeholder="Código de barras do fornecedor"
                  value={supplierCode}
                  onChange={(e) => setSupplierCode(e.target.value)}
                />
                <Button type="button" variant="outline" onClick={() => setSupplierCode(code)}>
                  Igual ao interno
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-location" className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                Localização
              </Label>
              <Input
                id="edit-location"
                placeholder="Ex: Armazém A - C3"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading || !code || !name}>
              {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Guardar alterações
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}