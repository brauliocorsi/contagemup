import { useState, useEffect, useCallback } from 'react';
import { Search, Package, MapPin, Layers, ArrowUpCircle, ArrowDownCircle, Clock, ChevronRight, Keyboard } from 'lucide-react';
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useProducts } from '@/hooks/useProducts';
import { ProductDetailPopup } from './ProductDetailPopup';

export function GlobalProductSearch() {
  const [open, setOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const { products } = useProducts();

  // Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleSelect = useCallback((productId: string) => {
    setOpen(false);
    setSelectedProductId(productId);
  }, []);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 text-muted-foreground hover:text-foreground"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Pesquisar...</span>
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Pesquisar produto por nome ou código..." />
        <CommandList>
          <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
          <CommandGroup heading="Produtos">
            {products?.map((product) => (
              <CommandItem
                key={product.id}
                value={`${product.code} ${product.name}`}
                onSelect={() => handleSelect(product.id)}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Package className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.code}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={product.current_stock <= product.min_stock ? 'destructive' : 'secondary'} className="text-xs">
                    {product.current_stock} un
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <ProductDetailPopup
        productId={selectedProductId}
        onClose={() => setSelectedProductId(null)}
      />
    </>
  );
}
