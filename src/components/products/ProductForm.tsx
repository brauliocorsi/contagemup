import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Loader2 } from 'lucide-react';
import { useCategories } from '@/hooks/useCategories';

interface ProductFormProps {
  onSubmit: (product: { code: string; name: string; category: string; total_colis: number; description: string | null; min_stock?: number }) => Promise<boolean>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialCode?: string;
  initialName?: string;
  lockCode?: boolean;
  hideTrigger?: boolean;
  onCreated?: () => void;
}

export function ProductForm({
  onSubmit,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  initialCode,
  initialName,
  lockCode,
  hideTrigger,
  onCreated,
}: ProductFormProps) {
  const { categories, loading: categoriesLoading } = useCategories();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => {
    if (controlledOnOpenChange) controlledOnOpenChange(v);
    else setInternalOpen(v);
  };
  const [isLoading, setIsLoading] = useState(false);
  const [code, setCode] = useState(initialCode ?? '');
  const [name, setName] = useState(initialName ?? '');
  const [category, setCategory] = useState('Geral');
  const [totalColis, setTotalColis] = useState(1);
  const [description, setDescription] = useState('');
  const [minStock, setMinStock] = useState(5);

  // Sync initial values when dialog opens (e.g. pre-fill from external caller)
  useEffect(() => {
    if (open) {
      if (initialCode !== undefined) setCode(initialCode);
      if (initialName !== undefined) setName(initialName);
    }
  }, [open, initialCode, initialName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    const success = await onSubmit({
      code,
      name,
      category,
      total_colis: totalColis,
      description: description || null,
      min_stock: minStock
    });

    if (success) {
      setCode('');
      setName('');
      setCategory('Geral');
      setTotalColis(1);
      setDescription('');
      setMinStock(5);
      setOpen(false);
      onCreated?.();
    }
    
    setIsLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Produto
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Novo Produto</DialogTitle>
            <DialogDescription>
              Adicione um novo produto ao sistema
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="code">Código *</Label>
              <Input
                id="code"
                placeholder="Ex: CAMA001"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                readOnly={lockCode}
                disabled={lockCode}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                placeholder="Ex: Cama Oslo Queen"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Categoria *</Label>
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
              <Label htmlFor="colis">Número de Colis *</Label>
              <NumericInput
                id="colis"
                min={1}
                max={20}
                value={totalColis}
                onChange={setTotalColis}
              />
              <p className="text-xs text-muted-foreground">
                Quantas partes/colis compõem este produto
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="min-stock">Stock Mínimo</Label>
              <NumericInput
                id="min-stock"
                min={0}
                value={minStock}
                onChange={setMinStock}
              />
              <p className="text-xs text-muted-foreground">
                Alerta quando o stock ficar abaixo deste valor
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                placeholder="Descrição opcional"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading || !code || !name}>
              {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Criar produto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
