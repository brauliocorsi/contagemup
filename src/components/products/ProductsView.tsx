import { useState } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { useCategories } from '@/hooks/useCategories';
import { useProductChanges } from '@/hooks/useProductChanges';
import { useLastCounts } from '@/hooks/useLastCounts';
import { ProductForm } from './ProductForm';
import { ProductEditForm } from './ProductEditForm';
import { ProductHistoryDialog } from './ProductHistoryDialog';
import { ImportProducts } from './ImportProducts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, Trash2, Edit, Package, MapPin, Box, History, ClipboardList } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Product } from '@/types/stock';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

export function ProductsView() {
  const { products, loading, createProduct, updateProduct, deleteProduct, importProducts } = useProducts();
  const { categories, createCategory, refetch: refetchCategories } = useCategories();
  const { logChange, logMultipleChanges } = useProductChanges();
  const { lastCounts } = useLastCounts();
  const [searchTerm, setSearchTerm] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);

  const existingCategoryNames = categories.map(c => c.name);

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.pallet_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateProduct = async (product: { code: string; name: string; category: string; total_colis: number; description: string | null; location: string | null; pallet_number: string | null }) => {
    const result = await createProduct(product);
    if (result) {
      await logChange(result.id, 'created');
    }
    return !!result;
  };

  const handleCreateCategory = async (name: string): Promise<boolean> => {
    const result = await createCategory(name);
    if (result) {
      await refetchCategories();
      return true;
    }
    return false;
  };

  const handleUpdateProduct = async (id: string, updates: Partial<Product>): Promise<boolean> => {
    // Find the original product to compare changes
    const originalProduct = products.find(p => p.id === id);
    
    const success = await updateProduct(id, updates);
    
    if (success && originalProduct) {
      // Log each changed field
      const changes: Array<{ field: string; oldValue: string | number | null; newValue: string | number | null }> = [];
      
      if (updates.code !== undefined && updates.code !== originalProduct.code) {
        changes.push({ field: 'code', oldValue: originalProduct.code, newValue: updates.code });
      }
      if (updates.name !== undefined && updates.name !== originalProduct.name) {
        changes.push({ field: 'name', oldValue: originalProduct.name, newValue: updates.name });
      }
      if (updates.category !== undefined && updates.category !== originalProduct.category) {
        changes.push({ field: 'category', oldValue: originalProduct.category, newValue: updates.category });
      }
      if (updates.total_colis !== undefined && updates.total_colis !== originalProduct.total_colis) {
        changes.push({ field: 'total_colis', oldValue: originalProduct.total_colis, newValue: updates.total_colis });
      }
      if (updates.description !== undefined && updates.description !== originalProduct.description) {
        changes.push({ field: 'description', oldValue: originalProduct.description, newValue: updates.description });
      }
      if (updates.location !== undefined && updates.location !== originalProduct.location) {
        changes.push({ field: 'location', oldValue: originalProduct.location, newValue: updates.location });
      }
      if (updates.pallet_number !== undefined && updates.pallet_number !== originalProduct.pallet_number) {
        changes.push({ field: 'pallet_number', oldValue: originalProduct.pallet_number, newValue: updates.pallet_number });
      }
      
      if (changes.length > 0) {
        await logMultipleChanges(id, changes);
      }
    }
    
    return success;
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Gestão de Produtos</h2>
          <p className="text-sm text-muted-foreground">
            {products.length} produtos cadastrados
          </p>
        </div>
        <div className="flex gap-2">
          <ImportProducts 
            onImport={importProducts} 
            existingCategories={existingCategoryNames}
            onCreateCategory={handleCreateCategory}
          />
          <ProductForm onSubmit={handleCreateProduct} />
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar por nome, código, localização ou palete..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Products table */}
      {products.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">Nenhum produto cadastrado</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Adicione produtos manualmente ou importe um ficheiro CSV
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Colis</TableHead>
                    <TableHead>Última Contagem</TableHead>
                    <TableHead>Localização</TableHead>
                    <TableHead>Palete</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                {filteredProducts.map(product => {
                    const lastCount = lastCounts[product.id];
                    return (
                    <TableRow key={product.id}>
                      <TableCell className="font-mono">{product.code}</TableCell>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{product.category}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{product.total_colis} colis</Badge>
                      </TableCell>
                      <TableCell>
                        {lastCount ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex items-center gap-1 cursor-help">
                                  <ClipboardList className="h-3 w-3 text-muted-foreground" />
                                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                    {lastCount.totalQuantity} un.
                                  </Badge>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="font-medium">{lastCount.sessionName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(lastCount.countedAt), "dd MMM yyyy 'às' HH:mm", { locale: pt })}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {product.location ? (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {product.location}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {product.pallet_number ? (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Box className="h-3 w-3" />
                            {product.pallet_number}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">
                        {product.description || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => setHistoryProduct(product)}
                            title="Ver histórico"
                          >
                            <History className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => setEditingProduct(product)}
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" title="Eliminar">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Eliminar produto?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação não pode ser revertida. O produto "{product.name}" será permanentemente eliminado.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteProduct(product.id)}>
                                  Eliminar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {filteredProducts.length === 0 && products.length > 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>Nenhum produto encontrado para "{searchTerm}"</p>
        </div>
      )}

      {/* Edit Product Dialog */}
      {editingProduct && (
        <ProductEditForm
          product={editingProduct}
          open={!!editingProduct}
          onOpenChange={(open) => !open && setEditingProduct(null)}
          onSubmit={handleUpdateProduct}
        />
      )}

      {/* Product History Dialog */}
      {historyProduct && (
        <ProductHistoryDialog
          productId={historyProduct.id}
          productName={historyProduct.name}
          open={!!historyProduct}
          onOpenChange={(open) => !open && setHistoryProduct(null)}
        />
      )}
    </div>
  );
}
