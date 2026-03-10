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
    for (let i = 1; i <= product.total_colis; i++) {
      colisQuantities[i] = 0;
    }
    
    product.colisDetails.forEach(detail => {
      colisQuantities[detail.colis_number] = (colisQuantities[detail.colis_number] || 0) + detail.quantity;
    });
    
    const quantities = Object.values(colisQuantities);
    const minQty = Math.min(...quantities);
    const maxQty = Math.max(...quantities);
    if (minQty === maxQty) return '-';
    
    const missingColis = Object.entries(colisQuantities)
      .filter(([_, qty]) => qty < maxQty)
      .map(([coliNum, qty]) => `Coli ${coliNum}: falta ${maxQty - qty}`)
      .join(', ');
    
    return missingColis || '-';
  }, []);

  // Helper function to get colis distribution string
  const getColisDistribution = useCallback((product: ProductWithCounts) => {
    if (product.total_colis <= 1) {
      const totalQty = product.colisDetails.reduce((sum, d) => sum + d.quantity, 0);
      return totalQty > 0 ? `${totalQty} un.` : '0 un.';
    }
    
    const colisQuantities: Record<number, number> = {};
    for (let i = 1; i <= product.total_colis; i++) {
      colisQuantities[i] = 0;
    }
    
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

  // Export CSV functions
  const exportFilteredReport = useCallback(() => {
    if (filteredProducts.length === 0) {
      toast.error('Nenhum produto para exportar');
      return;
    }

    const headers = ['Código', 'Nome', 'Categoria', 'Localização', 'Palete', 'Colis/Set', 'Sets Completos', 'Distribuição Colis', 'Status', 'Colis Faltantes', 'Avarias'];

    const rows = filteredProducts.map(product => {
      const status = product.completeSets > 0
        ? (product.hasPartialProduct ? 'Completo + Pendente' : 'Completo')
        : (product.status === 'not_counted' ? 'Não Contado' : 'Incompleto');
      
      const locations = product.uniqueLocations.length > 0 
        ? product.uniqueLocations.join(', ') 
        : (product.location || '-');
      
      const pallets = product.uniquePallets.length > 0 
        ? product.uniquePallets.join(', ') 
        : (product.pallet_number || '-');

      return [
        product.code, product.name, product.category, locations, pallets,
        product.total_colis.toString(), product.completeSets.toString(),
        getColisDistribution(product), status, getMissingColisInfo(product),
        (product.damaged_stock || 0).toString()
      ];
    });

    const totalComplete = filteredProducts.filter(p => p.completeSets > 0 && !p.hasPartialProduct).length;
    const totalIncomplete = filteredProducts.filter(p => p.hasPartialProduct || (p.completeSets === 0 && p.status !== 'not_counted')).length;
    const totalNotCounted = filteredProducts.filter(p => p.status === 'not_counted').length;
    const totalSets = filteredProducts.reduce((sum, p) => sum + p.completeSets, 0);

    const summaryRows = [
      [], ['RESUMO'],
      ['Total Produtos', filteredProducts.length.toString()],
      ['Produtos Completos', totalComplete.toString()],
      ['Produtos Incompletos', totalIncomplete.toString()],
      ['Não Contados', totalNotCounted.toString()],
      ['Total Sets Completos', totalSets.toString()],
      [], ['Filtros Aplicados'],
      ['Status', filterStatus !== 'all' ? filterStatus : 'Todos'],
      ['Categoria', filterCategory !== 'all' ? filterCategory : 'Todas'],
      ['Localização', filterLocation !== 'all' ? (filterLocation === '__empty__' ? 'Sem localização' : filterLocation) : 'Todas'],
      ['Palete', filterPallet !== 'all' ? (filterPallet === '__empty__' ? 'Sem palete' : filterPallet) : 'Todos'],
      ['Pesquisa', searchTerm || '-']
    ];

    const csvContent = [
      headers.join(';'),
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
    
    if (incomplete.length === 0) {
      toast.info('Nenhum produto incompleto para exportar');
      return;
    }

    const headers = ['Código', 'Nome', 'Categoria', 'Localização', 'Palete', 'Colis/Set', 'Sets Completos', 'Distribuição Colis', 'Colis Faltantes', 'Detalhes', 'Avarias'];

    const rows = incomplete
      .filter(product => {
        if (product.total_colis <= 1) return false;
        const missingInfo = getMissingColisInfo(product);
        return missingInfo !== '-' || product.hasPartialProduct;
      })
      .map(product => {
        const locations = product.uniqueLocations.length > 0 ? product.uniqueLocations.join(', ') : (product.location || '-');
        const pallets = product.uniquePallets.length > 0 ? product.uniquePallets.join(', ') : (product.pallet_number || '-');
        const missingInfo = getMissingColisInfo(product);
        const details = product.hasPartialProduct ? 'Tem pendências' : (missingInfo !== '-' ? 'Colis em falta' : '-');

        return [product.code, product.name, product.category, locations, pallets,
          product.total_colis.toString(), product.completeSets.toString(),
          getColisDistribution(product), missingInfo, details, (product.damaged_stock || 0).toString()];
      });

    if (rows.length === 0) {
      toast.info('Todos os produtos estão completos!');
      return;
    }

    const csvContent = [headers.join(';'), ...rows.map(row => row.map(cell => `"${cell}"`).join(';'))].join('\n');
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
    
    if (complete.length === 0) {
      toast.info('Nenhum produto 100% completo para exportar');
      return;
    }

    const headers = ['Código', 'Nome', 'Categoria', 'Localização', 'Palete', 'Colis/Set', 'Sets Completos', 'Stock Atual', 'Distribuição Colis', 'Avarias'];

    const rows = complete.map(product => {
      const locations = product.uniqueLocations.length > 0 ? product.uniqueLocations.join(', ') : (product.location || '-');
      const pallets = product.uniquePallets.length > 0 ? product.uniquePallets.join(', ') : (product.pallet_number || '-');
      return [product.code, product.name, product.category, locations, pallets,
        product.total_colis.toString(), product.completeSets.toString(), (product.current_stock || 0).toString(), getColisDistribution(product), (product.damaged_stock || 0).toString()];
    });

    const totalSets = complete.reduce((sum, p) => sum + p.completeSets, 0);

    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(';')),
      '',
      `"TOTAL";"";"";"";"";"${complete.length} produtos";"${totalSets} sets";"";"";""`,
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `produtos_completos_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success(`${complete.length} produtos completos exportados`);
  }, [filteredProducts, getColisDistribution]);

  // Excel export functions
  const exportFilteredReportExcel = useCallback(() => {
    if (filteredProducts.length === 0) {
      toast.error('Nenhum produto para exportar');
      return;
    }

    const headers = ['Código', 'Nome', 'Categoria', 'Localização', 'Palete', 'Colis/Set', 'Sets Completos', 'Distribuição Colis', 'Status', 'Colis Faltantes', 'Avarias'];

    const rows = filteredProducts.map(product => {
      const status = product.completeSets > 0 ? (product.hasPartialProduct ? 'Completo + Pendente' : 'Completo') : (product.status === 'not_counted' ? 'Não Contado' : 'Incompleto');
      const locations = product.uniqueLocations.length > 0 ? product.uniqueLocations.join(', ') : (product.location || '-');
      const pallets = product.uniquePallets.length > 0 ? product.uniquePallets.join(', ') : (product.pallet_number || '-');
      return [product.code, product.name, product.category, locations, pallets, product.total_colis, product.completeSets, getColisDistribution(product), status, getMissingColisInfo(product), product.damaged_stock || 0];
    });

    const totalComplete = filteredProducts.filter(p => p.completeSets > 0 && !p.hasPartialProduct).length;
    const totalIncomplete = filteredProducts.filter(p => p.hasPartialProduct || (p.completeSets === 0 && p.status !== 'not_counted')).length;
    const totalNotCounted = filteredProducts.filter(p => p.status === 'not_counted').length;
    const totalSets = filteredProducts.reduce((sum, p) => sum + p.completeSets, 0);

    const summaryRows: (string | number)[][] = [
      [], ['RESUMO'], ['Total Produtos', filteredProducts.length], ['Produtos Completos', totalComplete],
      ['Produtos Incompletos', totalIncomplete], ['Não Contados', totalNotCounted], ['Total Sets Completos', totalSets],
      [], ['Filtros Aplicados'], ['Status', filterStatus !== 'all' ? filterStatus : 'Todos'],
      ['Categoria', filterCategory !== 'all' ? filterCategory : 'Todas'],
      ['Localização', filterLocation !== 'all' ? (filterLocation === '__empty__' ? 'Sem localização' : filterLocation) : 'Todas'],
      ['Palete', filterPallet !== 'all' ? (filterPallet === '__empty__' ? 'Sem palete' : filterPallet) : 'Todos'],
      ['Pesquisa', searchTerm || '-']
    ];

    exportToExcel([headers, ...rows, ...summaryRows], `relatorio_contagem_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`, 'Contagem');
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
      .map(product => {
        const locations = product.uniqueLocations.length > 0 ? product.uniqueLocations.join(', ') : (product.location || '-');
        const pallets = product.uniquePallets.length > 0 ? product.uniquePallets.join(', ') : (product.pallet_number || '-');
        const missingInfo = getMissingColisInfo(product);
        const details = product.hasPartialProduct ? 'Tem pendências' : (missingInfo !== '-' ? 'Colis em falta' : '-');
        return [product.code, product.name, product.category, locations, pallets, product.total_colis, product.completeSets, getColisDistribution(product), missingInfo, details, product.damaged_stock || 0];
      });

    if (rows.length === 0) {
      toast.info('Todos os produtos estão completos!');
      return;
    }

    const headers = ['Código', 'Nome', 'Categoria', 'Localização', 'Palete', 'Colis/Set', 'Sets Completos', 'Distribuição Colis', 'Colis Faltantes', 'Detalhes', 'Avarias'];
    exportToExcel([headers, ...rows], `produtos_incompletos_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`, 'Incompletos');
    toast.success(`${rows.length} produtos incompletos exportados para Excel`);
  }, [filteredProducts, getColisDistribution, getMissingColisInfo, exportToExcel]);

  const exportCompleteReportExcel = useCallback(() => {
    const complete = filteredProducts.filter(p => p.completeSets > 0 && !p.hasPartialProduct);
    
    if (complete.length === 0) {
      toast.info('Nenhum produto 100% completo para exportar');
      return;
    }

    const headers = ['Código', 'Nome', 'Categoria', 'Localização', 'Palete', 'Colis/Set', 'Sets Completos', 'Distribuição Colis', 'Avarias'];
    const rows = complete.map(product => {
      const locations = product.uniqueLocations.length > 0 ? product.uniqueLocations.join(', ') : (product.location || '-');
      const pallets = product.uniquePallets.length > 0 ? product.uniquePallets.join(', ') : (product.pallet_number || '-');
      return [product.code, product.name, product.category, locations, pallets, product.total_colis, product.completeSets, getColisDistribution(product), product.damaged_stock || 0];
    });

    const totalSets = complete.reduce((sum, p) => sum + p.completeSets, 0);
    const summaryRow: (string | number)[] = ['TOTAL', '', '', '', '', complete.length + ' produtos', totalSets + ' sets', '', ''];

    exportToExcel([headers, ...rows, [], summaryRow], `produtos_completos_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`, 'Completos');
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
    return products.map(product => {
      const status = product.completeSets > 0 ? (product.hasPartialProduct ? 'Completo + Pendente' : 'Completo') : (product.status === 'not_counted' ? 'Não Contado' : 'Incompleto');
      const locations = product.uniqueLocations.length > 0 ? product.uniqueLocations.join(', ') : (product.location || '-');
      const pallets = product.uniquePallets.length > 0 ? product.uniquePallets.join(', ') : (product.pallet_number || '-');
      return [product.code, product.name, product.category, locations, pallets, product.total_colis, product.completeSets, getColisDistribution(product), status, getMissingColisInfo(product), product.damaged_stock || 0];
    });
  }, [getColisDistribution, getMissingColisInfo]);

  const damageHeaders = ['Código', 'Nome', 'Categoria', 'Localização', 'Palete', 'Colis/Set', 'Sets Completos', 'Distribuição Colis', 'Status', 'Colis Faltantes', 'Avarias'];

  const exportWithDamagesCSV = useCallback(() => {
    const products = getProductsWithDamages();
    if (products.length === 0) { toast.info('Nenhum produto com avarias para exportar'); return; }
    const rows = buildRows(products);
    const csvContent = [damageHeaders.join(';'), ...rows.map(row => row.map(cell => `"${cell}"`).join(';'))].join('\n');
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
    const csvContent = [damageHeaders.join(';'), ...rows.map(row => row.map(cell => `"${cell}"`).join(';'))].join('\n');
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
    exportToExcel([damageHeaders, ...rows], `produtos_com_avarias_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`, 'Com Avarias');
    toast.success(`${products.length} produtos com avarias exportados para Excel`);
  }, [getProductsWithDamages, buildRows, exportToExcel]);

  const exportWithoutDamagesExcel = useCallback(() => {
    const products = getProductsWithoutDamages();
    if (products.length === 0) { toast.info('Nenhum produto sem avarias para exportar'); return; }
    const rows = buildRows(products);
    exportToExcel([damageHeaders, ...rows], `produtos_sem_avarias_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`, 'Sem Avarias');
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
