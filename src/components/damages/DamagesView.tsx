import { useState, useCallback, useMemo } from 'react';
import { useDamages } from '@/hooks/useDamages';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DamagesTable } from './DamagesTable';
import { DateRangeFilter, filterByDateRange } from '@/components/ui/date-range-filter';
import { AlertOctagon, Package, Download, FileSpreadsheet, CheckCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

export function DamagesView() {
  const { damages, loading, resolveDamage, updateDamage, deleteDamage, isResolving, isUpdating, getStats } = useDamages();
  const [activeTab, setActiveTab] = useState('active');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const stats = getStats();

  // Filter damages by date range
  const filteredDamages = useMemo(
    () => filterByDateRange(damages, dateFrom, dateTo, d => d.created_at),
    [damages, dateFrom, dateTo]
  );

  // Export to CSV
  const exportToCSV = useCallback(() => {
    const activeDamages = filteredDamages.filter(d => d.status === 'active');
    
    if (activeDamages.length === 0) return;

    const headers = ['Produto', 'Código', 'Tipo de Dano', 'Quantidade', 'Coli', 'Localização', 'Palete', 'Data', 'Descrição'];
    const rows = activeDamages.map(d => [
      d.product?.name || '',
      d.product?.code || '',
      d.damage_type,
      d.quantity.toString(),
      d.colis_number?.toString() || '',
      d.location || '',
      d.pallet_number || '',
      format(new Date(d.created_at), 'dd/MM/yyyy HH:mm', { locale: pt }),
      d.description || ''
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `avarias_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  }, [damages]);

  // Export to Excel
  const exportToExcel = useCallback(() => {
    const activeDamages = damages.filter(d => d.status === 'active');
    
    if (activeDamages.length === 0) return;

    const data = [
      ['Relatório de Avarias', '', '', '', '', '', '', '', ''],
      [`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: pt })}`, '', '', '', '', '', '', '', ''],
      [''],
      ['Produto', 'Código', 'Tipo de Dano', 'Quantidade', 'Coli', 'Localização', 'Palete', 'Data', 'Descrição'],
      ...activeDamages.map(d => [
        d.product?.name || '',
        d.product?.code || '',
        d.damage_type,
        d.quantity,
        d.colis_number || '',
        d.location || '',
        d.pallet_number || '',
        format(new Date(d.created_at), 'dd/MM/yyyy HH:mm', { locale: pt }),
        d.description || ''
      ]),
      [''],
      [`Total de Avarias: ${activeDamages.length}`, '', '', '', '', '', '', '', ''],
      [`Total de Unidades: ${stats.totalDamagedUnits}`, '', '', '', '', '', '', '', '']
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    
    // Auto-size columns
    const colWidths = data[3].map((_, colIndex) => {
      const maxLength = Math.max(...data.slice(3).map(row => String(row[colIndex] || '').length));
      return { wch: Math.min(Math.max(maxLength + 2, 10), 40) };
    });
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Avarias');
    XLSX.writeFile(workbook, `avarias_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  }, [damages, stats.totalDamagedUnits]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">A carregar avarias...</div>
      </div>
    );
  }

  const activeDamages = damages.filter(d => d.status === 'active');
  const resolvedDamages = damages.filter(d => d.status === 'resolved');

  // Get top damaged products
  const topDamagedProducts = Object.entries(stats.byProduct)
    .sort((a, b) => b[1].units - a[1].units)
    .slice(0, 5);

  // Get damage type distribution
  const damageTypeEntries = Object.entries(stats.byType)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avarias Ativas</CardTitle>
            <AlertOctagon className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalActiveDamages}</div>
            <p className="text-xs text-muted-foreground">
              registos pendentes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unidades Danificadas</CardTitle>
            <Package className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.totalDamagedUnits}</div>
            <p className="text-xs text-muted-foreground">
              unidades em avaria
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolvidas</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.totalResolvedDamages}</div>
            <p className="text-xs text-muted-foreground">
              avarias resolvidas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Produtos Afetados</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(stats.byProduct).length}</div>
            <p className="text-xs text-muted-foreground">
              produtos diferentes
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats */}
      {(topDamagedProducts.length > 0 || damageTypeEntries.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {topDamagedProducts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Produtos Mais Afetados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {topDamagedProducts.map(([productId, data]) => (
                    <div key={productId} className="flex items-center justify-between">
                      <span className="text-sm truncate flex-1">{data.name}</span>
                      <Badge variant="destructive">{data.units} un.</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {damageTypeEntries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tipos de Dano</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {damageTypeEntries.map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between">
                      <span className="text-sm">{type}</span>
                      <Badge variant="secondary">{count} un.</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Tabs with Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Lista de Avarias</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportToCSV} disabled={activeDamages.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportToExcel} disabled={activeDamages.length === 0}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="active">
                Ativas
                {activeDamages.length > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {activeDamages.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="resolved">
                Resolvidas
                {resolvedDamages.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {resolvedDamages.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="all">Todas</TabsTrigger>
            </TabsList>

            <TabsContent value="active">
              <DamagesTable
                damages={activeDamages}
                onResolve={resolveDamage}
                onUpdate={updateDamage}
                onDelete={deleteDamage}
                isResolving={isResolving}
                isUpdating={isUpdating}
              />
            </TabsContent>

            <TabsContent value="resolved">
              <DamagesTable
                damages={resolvedDamages}
                onResolve={resolveDamage}
                onUpdate={updateDamage}
                onDelete={deleteDamage}
                isResolving={isResolving}
                isUpdating={isUpdating}
                showResolved
              />
            </TabsContent>

            <TabsContent value="all">
              <DamagesTable
                damages={damages}
                onResolve={resolveDamage}
                onUpdate={updateDamage}
                onDelete={deleteDamage}
                isResolving={isResolving}
                isUpdating={isUpdating}
                showResolved
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
