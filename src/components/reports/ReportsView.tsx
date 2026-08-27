import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, Package, ClipboardCheck, BarChart3, Copy } from 'lucide-react';
import { UnifiedMovementsReport } from './UnifiedMovementsReport';
import { StockStatusReport } from './StockStatusReport';
import { AuditReportsView } from './AuditReportsView';
import { DuplicateProductsReport } from './DuplicateProductsReport';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';

interface ReportsViewProps {
  onStartAudit?: (auditId: string) => void;
}

export function ReportsView({ onStartAudit }: ReportsViewProps) {
  const [activeTab, setActiveTab] = useState('movements');

  return (
    <PageContainer>
      <PageHeader
        icon={<BarChart3 className="h-5 w-5" />}
        title="Relatórios"
        description="Movimentos, stock e conferências"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="movements" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Movimentos</span>
          </TabsTrigger>
          <TabsTrigger value="stock" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Stock</span>
          </TabsTrigger>
          <TabsTrigger value="audits" className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Conferência</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="movements" className="space-y-4">
          <UnifiedMovementsReport />
        </TabsContent>

        <TabsContent value="stock" className="space-y-4">
          <StockStatusReport />
        </TabsContent>

        <TabsContent value="audits" className="space-y-4">
          <AuditReportsView onStartAudit={onStartAudit} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

