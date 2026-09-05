import { ClipboardCheck } from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { LocationAuditView } from '@/components/warehouse/LocationAuditView';

/**
 * Área ADM de gestão de conferências.
 * Aqui não se conta: cria-se, atribui-se, acompanha-se e fecha-se com os ajustes.
 * A contagem em si é feita no scanner, pelo operador a quem a conferência foi atribuída.
 */
export function AuditManagementView() {
  return (
    <PageContainer className="p-4">
      <PageHeader
        icon={<ClipboardCheck className="h-5 w-5" />}
        title="Conferências"
        description="Criar, atribuir e fechar conferências de stock. A contagem é feita no scanner pelo operador."
      />
      <LocationAuditView />
    </PageContainer>
  );
}
