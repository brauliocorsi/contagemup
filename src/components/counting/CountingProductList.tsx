import { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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

interface VirtualizedGridProps {
  products: ProductWithCounts[];
  sessionId?: string;
  categoryColisNamesMap: Record<string, Record<string, string> | null>;
  categoriesRequiringOrder: Record<string, boolean>;
  getDamagesForProduct: (productId: string) => Array<{ quantity: number }>;
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
  emptyMessage?: { icon: React.ReactNode; text: string };
}

function VirtualizedGrid({
  products,
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
  emptyMessage,
}: VirtualizedGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(3);
  
  // Handle resize to adjust columns
  const updateColumns = useCallback(() => {
    const width = parentRef.current?.clientWidth || window.innerWidth;
    if (width >= 1024) setColumns(3);
    else if (width >= 768) setColumns(2);
    else setColumns(1);
  }, []);

  useEffect(() => {
    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, [updateColumns]);
  
  // Group products into rows based on column count
  const rows = useMemo(() => {
    const result: ProductWithCounts[][] = [];
    for (let i = 0; i < products.length; i += columns) {
      result.push(products.slice(i, i + columns));
    }
    return result;
  }, [products, columns]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    // Fallback only; the real height is measured via `measureElement`.
    estimateSize: () => 360,
    overscan: 3,
  });

  if (products.length === 0 && emptyMessage) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {emptyMessage.icon}
        <p>{emptyMessage.text}</p>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="h-[calc(100vh-400px)] min-h-[400px] overflow-y-auto"
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const rowProducts = rows[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translate3d(0, ${virtualRow.start}px, 0)`,
                willChange: 'transform',
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pr-2">
                {rowProducts.map((product) => (
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
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
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
  const gridProps = {
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
  };

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
        <VirtualizedGrid products={filteredProducts} {...gridProps} />
      </TabsContent>

      <TabsContent value="incomplete" className="mt-4">
        <VirtualizedGrid 
          products={incompleteProducts} 
          {...gridProps}
          emptyMessage={{
            icon: <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />,
            text: "Nenhum produto incompleto!"
          }}
        />
      </TabsContent>

      <TabsContent value="complete" className="mt-4">
        <VirtualizedGrid 
          products={completeProducts} 
          {...gridProps}
          emptyMessage={{
            icon: <Package className="h-12 w-12 mx-auto mb-4" />,
            text: "Nenhum produto completo ainda"
          }}
        />
      </TabsContent>
    </Tabs>
  );
}
