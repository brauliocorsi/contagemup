import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ProductData {
  id: string;
  category: string;
  location: string | null;
  completeSets: number;
  hasPartialProduct: boolean;
  status: string;
}

interface ReportsChartsProps {
  productsWithCounts: ProductData[];
  categoryStats: {
    category: string;
    total: number;
    complete: number;
    incomplete: number;
    totalSets: number;
    percentage: number;
  }[];
  locationStats: {
    location: string;
    total: number;
    complete: number;
    incomplete: number;
    totalSets: number;
    isComplete: boolean;
  }[];
}

const COLORS = {
  complete: 'hsl(142, 76%, 36%)',
  incomplete: 'hsl(0, 84%, 60%)',
  notCounted: 'hsl(220, 9%, 46%)',
  pending: 'hsl(45, 93%, 47%)'
};

const STATUS_COLORS = ['#22c55e', '#ef4444', '#6b7280', '#eab308'];

export function ReportsCharts({ productsWithCounts, categoryStats, locationStats }: ReportsChartsProps) {
  // Status distribution for pie chart
  const statusData = useMemo(() => {
    const complete = productsWithCounts.filter(p => p.completeSets > 0 && !p.hasPartialProduct).length;
    const pending = productsWithCounts.filter(p => p.completeSets > 0 && p.hasPartialProduct).length;
    const incomplete = productsWithCounts.filter(p => p.completeSets === 0 && p.status !== 'not_counted').length;
    const notCounted = productsWithCounts.filter(p => p.status === 'not_counted').length;

    return [
      { name: 'Completos', value: complete, color: COLORS.complete },
      { name: 'Com pendentes', value: pending, color: COLORS.pending },
      { name: 'Incompletos', value: incomplete, color: COLORS.incomplete },
      { name: 'Não contados', value: notCounted, color: COLORS.notCounted },
    ].filter(item => item.value > 0);
  }, [productsWithCounts]);

  // Category data for bar chart
  const categoryChartData = useMemo(() => {
    return categoryStats.slice(0, 10).map(cat => ({
      name: cat.category.length > 12 ? cat.category.substring(0, 12) + '...' : cat.category,
      fullName: cat.category,
      completos: cat.complete,
      incompletos: cat.incomplete,
      sets: cat.totalSets
    }));
  }, [categoryStats]);

  // Location data for bar chart
  const locationChartData = useMemo(() => {
    return locationStats.slice(0, 8).map(loc => ({
      name: loc.location.length > 10 ? loc.location.substring(0, 10) + '...' : loc.location,
      fullName: loc.location,
      completos: loc.complete,
      incompletos: loc.incomplete,
      sets: loc.totalSets
    }));
  }, [locationStats]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border rounded-lg shadow-lg p-3">
          <p className="font-medium text-sm">{data.fullName || label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const PieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded-lg shadow-lg p-3">
          <p className="font-medium text-sm">{payload[0].name}</p>
          <p className="text-sm">{payload[0].value} produtos</p>
          <p className="text-sm text-muted-foreground">
            {((payload[0].value / productsWithCounts.length) * 100).toFixed(1)}%
          </p>
        </div>
      );
    }
    return null;
  };

  if (productsWithCounts.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Status Distribution Pie Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Distribuição por Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  formatter={(value) => <span className="text-xs">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Category Bar Chart */}
      {categoryChartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Produtos por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryChartData} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" fontSize={11} />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    fontSize={10} 
                    width={70}
                    tick={{ fill: 'hsl(var(--foreground))' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="completos" fill="#22c55e" name="Completos" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="incompletos" fill="#ef4444" name="Incompletos" stackId="a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Location Bar Chart */}
      {locationChartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sets por Localização</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={locationChartData} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" fontSize={11} />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    fontSize={10} 
                    width={70}
                    tick={{ fill: 'hsl(var(--foreground))' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="sets" fill="hsl(var(--primary))" name="Sets Completos" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
