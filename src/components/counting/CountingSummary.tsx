import { ProductWithCounts } from '@/types/stock';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, CheckCircle2, AlertCircle, AlertTriangle, ClipboardList } from 'lucide-react';

interface CountingSummaryProps {
  products: ProductWithCounts[];
}

export function CountingSummary({ products }: CountingSummaryProps) {
  const totalProducts = products.length;
  const complete = products.filter(p => p.status === 'complete' && !p.hasPartialProduct).length;
  const withPartial = products.filter(p => p.hasPartialProduct).length;
  const notCounted = products.filter(p => p.status === 'not_counted').length;

  const totalCompleteSets = products.reduce((sum, p) => sum + p.completeSets, 0);
  const totalPartialProducts = products.filter(p => p.hasPartialProduct).length;
  
  // Damage statistics
  const productsWithDamages = products.filter(p => (p.damaged_stock || 0) > 0).length;
  const totalDamagedUnits = products.reduce((sum, p) => sum + (p.damaged_stock || 0), 0);

  const stats = [
    {
      label: 'Total Produtos',
      value: totalProducts,
      icon: Package,
      color: 'text-primary bg-primary/10'
    },
    {
      label: 'Sets Completos',
      value: totalCompleteSets,
      icon: CheckCircle2,
      color: 'text-green-600 bg-green-100'
    },
    {
      label: 'Produtos 100% OK',
      value: complete,
      icon: CheckCircle2,
      color: 'text-green-600 bg-green-100'
    },
    {
      label: 'Com Pendências',
      value: withPartial,
      icon: AlertTriangle,
      color: 'text-yellow-600 bg-yellow-100'
    },
    {
      label: 'Não Contados',
      value: notCounted,
      icon: ClipboardList,
      color: 'text-muted-foreground bg-muted'
    },
    {
      label: 'Com Avarias',
      value: productsWithDamages,
      subValue: totalDamagedUnits > 0 ? `${totalDamagedUnits} un.` : undefined,
      icon: AlertTriangle,
      color: 'text-red-600 bg-red-100'
    }
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Resumo da Contagem</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex items-center gap-3 p-3 rounded-lg bg-muted/30"
            >
              <div className={`p-2 rounded-full ${stat.color}`}>
                <stat.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                {'subValue' in stat && stat.subValue && (
                  <p className="text-xs text-muted-foreground">{stat.subValue}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
