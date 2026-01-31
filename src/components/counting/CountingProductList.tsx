import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ProductCard } from './ProductCard';
import { ProductWithCounts, StockDistribution } from '@/types/stock';

interface CountingProductListProps {
  filteredProducts: ProductWithCounts[];
  incompleteProducts: ProductWithCounts[];
  completeProducts: ProductWithCounts[];
  sessionId?: string;
  categoryColisNamesMap: Record<string, Record<string, string> | null>;
  categoriesRequiringOrder: Record<string, boolean>;
  getDamagesForProduct: (productId: string) => Array<{ quantity: number }>;
  // Callbacks matching ProductCard props
  onIncrement: (productId: string, colisNumber: number) => void;
  onDecrement: (productId: string, colisNumber: number) => void;
  onIncrementAtLocation: (productId: string, colisNumber: number, countId: string) => void;
  onDecrementAtLocation: (productId: string, colisNumber: number, countId: string) => void;
  onLocationChange: (productId: string, location: string) => void;
  onPalletChange: (productId: string, palletNumber: string) => void;
  onColisLocationChange: (productId: string, colisNumber: number, location: string) => void;
  onColisPalletChange: (productId: string, colisNumber: number, pallet: string) => void;
  onAddColi: (productId: string, newTotalColis: number) => Promise<void>;
  onRemoveColi: (productId: string, newTotalColis: number) => Promise<void>;
  onCodeChange: (productId: string, newCode: string) => Promise<boolean>;
  onSplitStock: (productId: string, colisNumber: number, distributions: StockDistribution[]) => Promise<boolean>;
  onMergeStock: (productId: string, colisNumber: number, location: string, pallet: string) => Promise<boolean>;
  onReportDamage: (data: { product_id: string; quantity: number; colis_number?: number; damage_type: string; description?: string; location?: string; pallet_number?: string }) => Promise<unknown>;
}

export function CountingProductList({
  filteredProducts,
  incompleteProducts,
  completeProducts,
  sessionId,
  categoryColisNamesMap,
  categoriesRequiringOrder,
  getDamagesForProduct,
  onIncrement,
  onDecrement,
  onIncrementAtLocation,
  onDecrementAtLocation,
  onLocationChange,
  onPalletChange,
  onColisLocationChange,
  onColisPalletChange,
  onAddColi,
  onRemoveColi,
  onCodeChange,
  onSplitStock,
  onMergeStock,
  onReportDamage,
}: CountingProductListProps) {
  const renderProductCard = (product: ProductWithCounts) => (
    <ProductCard
      key={product.id}
      product={product}
      onIncrement={onIncrement}
      onDecrement={onDecrement}
      onIncrementAtLocation={onIncrementAtLocation}
      onDecrementAtLocation={onDecrementAtLocation}
      onLocationChange={onLocationChange}
      onPalletChange={onPalletChange}
      onColisLocationChange={onColisLocationChange}
      onColisPalletChange={onColisPalletChange}
      onAddColi={onAddColi}
      onRemoveColi={onRemoveColi}
      onCodeChange={onCodeChange}
      onSplitStock={onSplitStock}
      onMergeStock={onMergeStock}
      onReportDamage={onReportDamage}
      damagedStock={getDamagesForProduct(product.id).reduce((sum, d) => sum + d.quantity, 0)}
      colisNames={categoryColisNamesMap[product.category]}
      sessionId={sessionId}
      requiresOrderNumber={categoriesRequiringOrder[product.category]}
    />
  );

  return (
    <Tabs defaultValue="all" className="w-full">
      <TabsList className="w-full grid grid-cols-3">
        <TabsTrigger value="all" className="flex items-center gap-1">
          <Package className="h-4 w-4" />
          Todos ({filteredProducts.length})
        </TabsTrigger>
        <TabsTrigger value="incomplete" className="flex items-center gap-1">
          <AlertCircle className="h-4 w-4" />
          Incompletos ({incompleteProducts.length})
        </TabsTrigger>
        <TabsTrigger value="complete" className="flex items-center gap-1">
          <CheckCircle2 className="h-4 w-4" />
          Completos ({completeProducts.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="all" className="mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map(renderProductCard)}
        </div>
      </TabsContent>

      <TabsContent value="incomplete" className="mt-4">
        {incompleteProducts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
            <p>Nenhum produto incompleto!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {incompleteProducts.map(renderProductCard)}
          </div>
        )}
      </TabsContent>

      <TabsContent value="complete" className="mt-4">
        {completeProducts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4" />
            <p>Nenhum produto completo ainda</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {completeProducts.map(renderProductCard)}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
