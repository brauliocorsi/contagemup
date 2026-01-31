import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@/components/ui/dropdown-menu';
import { Download, FileSpreadsheet, FileText, Package, CheckCircle2, AlertCircle } from 'lucide-react';

interface CountingExportMenuProps {
  totalFiltered: number;
  totalComplete: number;
  onExportFilteredCSV: () => void;
  onExportCompleteCSV: () => void;
  onExportIncompleteCSV: () => void;
  onExportFilteredExcel: () => void;
  onExportCompleteExcel: () => void;
  onExportIncompleteExcel: () => void;
}

export function CountingExportMenu({
  totalFiltered,
  totalComplete,
  onExportFilteredCSV,
  onExportCompleteCSV,
  onExportIncompleteCSV,
  onExportFilteredExcel,
  onExportCompleteExcel,
  onExportIncompleteExcel,
}: CountingExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="whitespace-nowrap">
          <Download className="h-4 w-4 mr-1" />
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 bg-background border shadow-lg z-50">
        {/* CSV Exports */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FileText className="h-4 w-4 mr-2" />
            Exportar CSV
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="bg-background border shadow-lg z-50">
            <DropdownMenuItem onClick={onExportFilteredCSV}>
              <Package className="h-4 w-4 mr-2" />
              Relatório Completo ({totalFiltered})
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExportCompleteCSV}>
              <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
              Só Completos ({totalComplete})
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExportIncompleteCSV}>
              <AlertCircle className="h-4 w-4 mr-2 text-amber-600" />
              Só Incompletos
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        
        <DropdownMenuSeparator />
        
        {/* Excel Exports */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FileSpreadsheet className="h-4 w-4 mr-2 text-green-600" />
            Exportar Excel
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="bg-background border shadow-lg z-50">
            <DropdownMenuItem onClick={onExportFilteredExcel}>
              <Package className="h-4 w-4 mr-2" />
              Relatório Completo ({totalFiltered})
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExportCompleteExcel}>
              <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
              Só Completos ({totalComplete})
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExportIncompleteExcel}>
              <AlertCircle className="h-4 w-4 mr-2 text-amber-600" />
              Só Incompletos
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
