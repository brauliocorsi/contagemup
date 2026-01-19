import { useMemo } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { Product } from '@/types/stock';

export interface StockAlert {
  product: Product;
  type: 'out_of_stock' | 'low_stock';
  message: string;
}

export function useStockAlerts() {
  const { products, loading } = useProducts();

  const alerts = useMemo(() => {
    const alertList: StockAlert[] = [];

    products.forEach((product) => {
      if (product.current_stock <= 0) {
        alertList.push({
          product,
          type: 'out_of_stock',
          message: `${product.name} está esgotado`,
        });
      } else if (product.current_stock <= product.min_stock) {
        alertList.push({
          product,
          type: 'low_stock',
          message: `${product.name} tem stock baixo (${product.current_stock}/${product.min_stock})`,
        });
      }
    });

    // Sort: out of stock first, then low stock
    return alertList.sort((a, b) => {
      if (a.type === 'out_of_stock' && b.type !== 'out_of_stock') return -1;
      if (a.type !== 'out_of_stock' && b.type === 'out_of_stock') return 1;
      return a.product.name.localeCompare(b.product.name);
    });
  }, [products]);

  const outOfStockCount = alerts.filter(a => a.type === 'out_of_stock').length;
  const lowStockCount = alerts.filter(a => a.type === 'low_stock').length;
  const totalAlerts = alerts.length;

  return {
    alerts,
    outOfStockCount,
    lowStockCount,
    totalAlerts,
    loading,
  };
}
