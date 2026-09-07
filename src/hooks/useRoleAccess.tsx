import { useAuth } from '@/hooks/useAuth';

export type AppRole = 'master' | 'admin' | 'financeiro' | 'operator' | 'entregador' | 'warehouse_operator';

export const ROLE_LABELS: Record<AppRole, string> = {
  master: 'Master',
  admin: 'Admin',
  financeiro: 'Financeiro',
  operator: 'Operador',
  entregador: 'Entregador',
  warehouse_operator: 'Operador de armazém',
};

/**
 * Acesso por função. Nada aqui substitui as regras do servidor — serve apenas
 * para não mostrar o que a pessoa não pode fazer.
 *
 * Enquanto o perfil não estiver carregado nada é concedido: `ready` a falso.
 */
export function useRoleAccess() {
  const { user, profile, loading } = useAuth();
  const role = (profile?.role ?? null) as AppRole | null;
  const ready = !loading && (!user || !!profile);

  const isWarehouseOperator = role === 'warehouse_operator';
  const isDriver = role === 'entregador';

  return {
    user,
    loading,
    ready,
    role,
    isWarehouseOperator,
    isDriver,
    isMaster: role === 'master',
    /** Aplicação de escritório: dashboard, relatórios, finanças, rotas, definições. */
    canUseOfficeApp: ready && !!role && !isWarehouseOperator && !isDriver,
    /** Área do entregador. */
    canUseDriverApp: ready && (isDriver || role === 'master' || role === 'admin' || role === 'operator'),
    /** Scanner de armazém. */
    canUseScanner: ready && !!role && !isDriver,
  };
}
