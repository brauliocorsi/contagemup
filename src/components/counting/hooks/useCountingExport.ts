import { useCallback } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { ProductWithCounts } from './useCountingFilters';

interface ExportFilters {
  filterStatus: string;
  filterCategory: string;
  filterLocation: string;
  filterPallet: string;
  searchTerm: string;
}

const calcAvailable = (p: ProductWithCounts) =>
  Math.max(0, p.completeSets - (p.damaged_stock || 0));

export function useCountingExport(
  filteredProducts: ProductWithCounts[],
  filters: ExportFilters,
  productIdsWithDamages?: Set<string>
) {
  const { filterStatus, filterCategory, filterLocation, filterPallet, searchTerm } = filters;

  // Helper function to calculate missing colis for a product
  const getMissingColisInfo = useCallback((product: ProductWithCounts) => {
    if (product.total_colis <= 1) return '-';
    const colisQuantities: Record<number, number> = {};
    for (let i = 1; i <= product.total_colis; i++) colisQuantities[i] = 0;
    product.colisDetails.forEach(detail => {
      colisQuantities[detail.colis_number] = (colisQuantities[detail.colis_number] || 0) + detail.quantity;
    });
    const quantities = Object.values(colisQuantities);
    const minQty = Math.min(...quantities);
    const maxQty = Math.max(...quantities);
    if (minQty === maxQty) return '-';
    return Object.entries(colisQuantities)
      .filter(([_, qty]) => qty < maxQty)
      .map(([coliNum, qty]) => `Coli ${coliNum}: falta ${maxQty - qty}`)
      .join(', ') || '-';
  }, []);

  // Helper function to get colis distribution string
  const getColisDistribution = useCallback((product: ProductWithCounts) => {
    if (product.total_colis <= 1) {
      const totalQty = product.colisDetails.reduce((sum, d) => sum + d.quantity, 0);
      return totalQty > 0 ? `${totalQty} un.` : '0 un.';
    }
    const colisQuantities: Record<number, number> = {};
    for (let i = 1; i <= product.total_colis; i++) colisQuantities[i] = 0;
    product.colisDetails.forEach(detail => {
      colisQuantities[detail.colis_number] = (colisQuantities[detail.colis_number] || 0) + detail.quantity;
    });
    return Object.entries(colisQuantities)
      .map(([coliNum, qty]) => `C${coliNum}:${qty}`)
      .join(' | ');
  }, []);

  // Helper function to export to Excel
  const exportToExcel = useCallback((data: (string | number)[][], filename: string, sheetName: string = 'Relatório') => {
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const colWidths = data[0].map((_, colIndex) => {
      const maxLength = Math.max(...data.map(row => String(row[colIndex] || '').length));
      return { wch: Math.min(Math.max(maxLength + 2, 10), 50) };
    });
    worksheet['!cols'] = colWidths;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, filename);
  }, []);

  // Shared headers
  const fullHeaders = ['Código', 'Nome', 'Categoria', 'Localização', 'Palete', 'Colis/Set', 'Sets Completos', 'Avarias', 'Stock Disponível', 'Distribuição Colis', 'Status', 'Colis Faltantes'];
  const completeHeaders = ['Código', 'Nome', 'Categoria', 'Localização', 'Palete', 'Colis/Set', 'Sets Completos', 'Avarias', 'Stock Disponível', 'Distribuição Colis'];
  const incompleteHeaders = ['Código', 'Nome', 'Categoria', 'Localização', 'Palete', 'Colis/Set', 'Sets Completos', 'Avarias', 'Stock Disponível', 'Distribuição Colis', 'Colis Faltantes', 'Detalhes'];

  const getLocations = (p: ProductWithCounts) => p.uniqueLocations.length > 0 ? p.uniqueLocations.join(', ') : (p.location || '-');
  const getPallets = (p: ProductWithCounts) => p.uniquePallets.length > 0 ? p.uniquePallets.join(', ') : (p.pallet_number || '-');
  const getStatus = (p: ProductWithCounts) => p.completeSets > 0 ? (p.hasPartialProduct ? 'Completo + Pendente' : 'Completo') : (p.status === 'not_counted' ? 'Não Contado' : 'Incompleto');

  // --- CSV exports ---
  const exportFilteredReport = useCallback(() => {
    if (filteredProducts.length === 0) { toast.error('Nenhum produto para exportar'); return; }
    const rows = filteredProducts.map(p => [
      p.code, p.name, p.category, getLocations(p), getPallets(p),
      p.total_colis.toString(), p.completeSets.toString(),
      (p.damaged_stock || 0).toString(), calcAvailable(p).toString(),
      getColisDistribution(p), getStatus(p), getMissingColisInfo(p)
    ]);

    const totalComplete = filteredProducts.filter(p => p.completeSets > 0 && !p.hasPartialProduct).length;
    const totalIncomplete = filteredProducts.filter(p => p.hasPartialProduct || (p.completeSets === 0 && p.status !== 'not_counted')).length;
    const totalNotCounted = filteredProducts.filter(p => p.status === 'not_counted').length;
    const totalSets = filteredProducts.reduce((sum, p) => sum + p.completeSets, 0);
    const totalAvailable = filteredProducts.reduce((sum, p) => sum + calcAvailable(p), 0);

    const summaryRows = [
      [], ['RESUMO'],
      ['Total Produtos', filteredProducts.length.toString()],
      ['Produtos Completos', totalComplete.toString()],
      ['Produtos Incompletos', totalIncomplete.toString()],
      ['Não Contados', totalNotCounted.toString()],
      ['Total Sets Completos', totalSets.toString()],
      ['Total Stock Disponível', totalAvailable.toString()],
      [], ['Filtros Aplicados'],
      ['Status', filterStatus !== 'all' ? filterStatus : 'Todos'],
      ['Categoria', filterCategory !== 'all' ? filterCategory : 'Todas'],
      ['Localização', filterLocation !== 'all' ? (filterLocation === '__empty__' ? 'Sem localização' : filterLocation) : 'Todas'],
      ['Palete', filterPallet !== 'all' ? (filterPallet === '__empty__' ? 'Sem palete' : filterPallet) : 'Todos'],
      ['Pesquisa', searchTerm || '-']
    ];

    const csvContent = [
      fullHeaders.join(';'),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(';')),
      ...summaryRows.map(row => row.map(cell => `"${cell || ''}"`).join(';'))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_contagem_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success(`${filteredProducts.length} produtos exportados`);
  }, [filteredProducts, filterStatus, filterCategory, filterLocation, filterPallet, searchTerm, getColisDistribution, getMissingColisInfo]);

  const exportIncompleteReport = useCallback(() => {
    const incomplete = filteredProducts.filter(p => p.hasPartialProduct || (p.total_colis > 1 && p.colisDetails.length > 0));
    if (incomplete.length === 0) { toast.info('Nenhum produto incompleto para exportar'); return; }
    const rows = incomplete
      .filter(product => {
        if (product.total_colis <= 1) return false;
        const missingInfo = getMissingColisInfo(product);
        return missingInfo !== '-' || product.hasPartialProduct;
      })
      .map(p => {
        const missingInfo = getMissingColisInfo(p);
        const details = p.hasPartialProduct ? 'Tem pendências' : (missingInfo !== '-' ? 'Colis em falta' : '-');
        return [p.code, p.name, p.category, getLocations(p), getPallets(p),
          p.total_colis.toString(), p.completeSets.toString(),
          (p.damaged_stock || 0).toString(), calcAvailable(p).toString(),
          getColisDistribution(p), missingInfo, details];
      });
    if (rows.length === 0) { toast.info('Todos os produtos estão completos!'); return; }
    const csvContent = [incompleteHeaders.join(';'), ...rows.map(row => row.map(cell => `"${cell}"`).join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `produtos_incompletos_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success(`${rows.length} produtos incompletos exportados`);
  }, [filteredProducts, getColisDistribution, getMissingColisInfo]);

  const exportCompleteReport = useCallback(() => {
    const complete = filteredProducts.filter(p => p.completeSets > 0 && !p.hasPartialProduct);
    if (complete.length === 0) { toast.info('Nenhum produto 100% completo para exportar'); return; }
    const rows = complete.map(p => [
      p.code, p.name, p.category, getLocations(p), getPallets(p),
      p.total_colis.toString(), p.completeSets.toString(),
      (p.damaged_stock || 0).toString(), calcAvailable(p).toString(),
      getColisDistribution(p)
    ]);
    const totalSets = complete.reduce((sum, p) => sum + p.completeSets, 0);
    const totalAvailable = complete.reduce((sum, p) => sum + calcAvailable(p), 0);
    const csvContent = [
      completeHeaders.join(';'),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(';')),
      '',
      `"TOTAL";"";"";"";"";"${complete.length} produtos";"${totalSets} sets";"";"${totalAvailable} disponíveis";""`,
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `produtos_completos_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success(`${complete.length} produtos completos exportados`);
  }, [filteredProducts, getColisDistribution]);

  // --- Excel exports ---
  const exportFilteredReportExcel = useCallback(() => {
    if (filteredProducts.length === 0) { toast.error('Nenhum produto para exportar'); return; }
    const rows = filteredProducts.map(p => [
      p.code, p.name, p.category, getLocations(p), getPallets(p),
      p.total_colis, p.completeSets, p.damaged_stock || 0, calcAvailable(p),
      getColisDistribution(p), getStatus(p), getMissingColisInfo(p)
    ]);

    const totalComplete = filteredProducts.filter(p => p.completeSets > 0 && !p.hasPartialProduct).length;
    const totalIncomplete = filteredProducts.filter(p => p.hasPartialProduct || (p.completeSets === 0 && p.status !== 'not_counted')).length;
    const totalNotCounted = filteredProducts.filter(p => p.status === 'not_counted').length;
    const totalSets = filteredProducts.reduce((sum, p) => sum + p.completeSets, 0);
    const totalAvailable = filteredProducts.reduce((sum, p) => sum + calcAvailable(p), 0);

    const summaryRows: (string | number)[][] = [
      [], ['RESUMO'], ['Total Produtos', filteredProducts.length], ['Produtos Completos', totalComplete],
      ['Produtos Incompletos', totalIncomplete], ['Não Contados', totalNotCounted],
      ['Total Sets Completos', totalSets], ['Total Stock Disponível', totalAvailable],
      [], ['Filtros Aplicados'], ['Status', filterStatus !== 'all' ? filterStatus : 'Todos'],
      ['Categoria', filterCategory !== 'all' ? filterCategory : 'Todas'],
      ['Localização', filterLocation !== 'all' ? (filterLocation === '__empty__' ? 'Sem localização' : filterLocation) : 'Todas'],
      ['Palete', filterPallet !== 'all' ? (filterPallet === '__empty__' ? 'Sem palete' : filterPallet) : 'Todos'],
      ['Pesquisa', searchTerm || '-']
    ];

    exportToExcel([fullHeaders, ...rows, ...summaryRows], `relatorio_contagem_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`, 'Contagem');
    toast.success(`${filteredProducts.length} produtos exportados para Excel`);
  }, [filteredProducts, filterStatus, filterCategory, filterLocation, filterPallet, searchTerm, getColisDistribution, getMissingColisInfo, exportToExcel]);

  const exportIncompleteReportExcel = useCallback(() => {
    const incomplete = filteredProducts.filter(p => p.hasPartialProduct || (p.total_colis > 1 && p.colisDetails.length > 0));
    const rows = incomplete
      .filter(product => {
        if (product.total_colis <= 1) return false;
        const missingInfo = getMissingColisInfo(product);
        return missingInfo !== '-' || product.hasPartialProduct;
      })
      .map(p => {
        const missingInfo = getMissingColisInfo(p);
        const details = p.hasPartialProduct ? 'Tem pendências' : (missingInfo !== '-' ? 'Colis em falta' : '-');
        return [p.code, p.name, p.category, getLocations(p), getPallets(p),
          p.total_colis, p.completeSets, p.damaged_stock || 0, calcAvailable(p),
          getColisDistribution(p), missingInfo, details];
      });
    if (rows.length === 0) { toast.info('Todos os produtos estão completos!'); return; }
    exportToExcel([incompleteHeaders, ...rows], `produtos_incompletos_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`, 'Incompletos');
    toast.success(`${rows.length} produtos incompletos exportados para Excel`);
  }, [filteredProducts, getColisDistribution, getMissingColisInfo, exportToExcel]);

  const exportCompleteReportExcel = useCallback(() => {
    const complete = filteredProducts.filter(p => p.completeSets > 0 && !p.hasPartialProduct);
    if (complete.length === 0) { toast.info('Nenhum produto 100% completo para exportar'); return; }
    const rows = complete.map(p => [
      p.code, p.name, p.category, getLocations(p), getPallets(p),
      p.total_colis, p.completeSets, p.damaged_stock || 0, calcAvailable(p),
      getColisDistribution(p)
    ]);
    const totalSets = complete.reduce((sum, p) => sum + p.completeSets, 0);
    const totalAvailable = complete.reduce((sum, p) => sum + calcAvailable(p), 0);
    const summaryRow: (string | number)[] = ['TOTAL', '', '', '', '', complete.length + ' produtos', totalSets + ' sets', '', totalAvailable + ' disponíveis', ''];
    exportToExcel([completeHeaders, ...rows, [], summaryRow], `produtos_completos_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`, 'Completos');
    toast.success(`${complete.length} produtos completos exportados para Excel`);
  }, [filteredProducts, getColisDistribution, exportToExcel]);

  // Damage-based export helpers
  const getProductsWithDamages = useCallback(() => {
    if (!productIdsWithDamages) return [];
    return filteredProducts.filter(p => productIdsWithDamages.has(p.id));
  }, [filteredProducts, productIdsWithDamages]);

  const getProductsWithoutDamages = useCallback(() => {
    if (!productIdsWithDamages) return filteredProducts;
    return filteredProducts.filter(p => !productIdsWithDamages.has(p.id));
  }, [filteredProducts, productIdsWithDamages]);

  const buildRows = useCallback((products: ProductWithCounts[]) => {
    return products.map(p => [
      p.code, p.name, p.category, getLocations(p), getPallets(p),
      p.total_colis, p.completeSets, p.damaged_stock || 0, calcAvailable(p),
      getColisDistribution(p), getStatus(p), getMissingColisInfo(p)
    ]);
  }, [getColisDistribution, getMissingColisInfo]);

  const exportWithDamagesCSV = useCallback(() => {
    const products = getProductsWithDamages();
    if (products.length === 0) { toast.info('Nenhum produto com avarias para exportar'); return; }
    const rows = buildRows(products);
    const csvContent = [fullHeaders.join(';'), ...rows.map(row => row.map(cell => `"${cell}"`).join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `produtos_com_avarias_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success(`${products.length} produtos com avarias exportados`);
  }, [getProductsWithDamages, buildRows]);

  const exportWithoutDamagesCSV = useCallback(() => {
    const products = getProductsWithoutDamages();
    if (products.length === 0) { toast.info('Nenhum produto sem avarias para exportar'); return; }
    const rows = buildRows(products);
    const csvContent = [fullHeaders.join(';'), ...rows.map(row => row.map(cell => `"${cell}"`).join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `produtos_sem_avarias_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success(`${products.length} produtos sem avarias exportados`);
  }, [getProductsWithoutDamages, buildRows]);

  const exportWithDamagesExcel = useCallback(() => {
    const products = getProductsWithDamages();
    if (products.length === 0) { toast.info('Nenhum produto com avarias para exportar'); return; }
    const rows = buildRows(products);
    exportToExcel([fullHeaders, ...rows], `produtos_com_avarias_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`, 'Com Avarias');
    toast.success(`${products.length} produtos com avarias exportados para Excel`);
  }, [getProductsWithDamages, buildRows, exportToExcel]);

  const exportWithoutDamagesExcel = useCallback(() => {
    const products = getProductsWithoutDamages();
    if (products.length === 0) { toast.info('Nenhum produto sem avarias para exportar'); return; }
    const rows = buildRows(products);
    exportToExcel([fullHeaders, ...rows], `produtos_sem_avarias_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`, 'Sem Avarias');
    toast.success(`${products.length} produtos sem avarias exportados para Excel`);
  }, [getProductsWithoutDamages, buildRows, exportToExcel]);

  return {
    exportFilteredReport,
    exportIncompleteReport,
    exportCompleteReport,
    exportFilteredReportExcel,
    exportIncompleteReportExcel,
    exportCompleteReportExcel,
    exportWithDamagesCSV,
    exportWithoutDamagesCSV,
    exportWithDamagesExcel,
    exportWithoutDamagesExcel,
  };
}
