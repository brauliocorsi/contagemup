

# Update Export Reports with Available Stock Column

## What the user wants
- Add a new column "Stock Disponível" (available stock) = `completeSets - damaged_stock` in all export reports
- Update headers to clearly show: Sets Completos, Avarias, Stock Disponível
- Example: CH2 with 9 complete sets and 4 damages = 5 available units

## Conceptual clarification
Damages represent complete products temporarily removed from stock. When resolved, they return to stock. The reports must reflect: `Stock Disponível = Sets Completos - Avarias`.

## Changes

### 1. `src/components/counting/hooks/useCountingExport.ts`
Update all export functions (CSV + Excel) across all report types:

- **Headers**: Change from `['...', 'Sets Completos', 'Stock Atual', '...', 'Avarias']` to `['...', 'Sets Completos', 'Avarias', 'Stock Disponível', '...']`
- **Row data**: Add calculated column `Math.max(0, product.completeSets - (product.damaged_stock || 0))` as "Stock Disponível"
- Apply to all 6 export functions: `exportFilteredReport`, `exportFilteredReportExcel`, `exportCompleteReport`, `exportCompleteReportExcel`, `exportIncompleteReport`, `exportIncompleteReportExcel`, and the damage-specific exports

The column order per row will be:
`Código | Nome | Categoria | Localização | Palete | Colis/Set | Sets Completos | Avarias | Stock Disponível | Distribuição Colis | Status | Colis Faltantes`

No database changes needed. No new files.

