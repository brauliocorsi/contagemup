import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { LoginForm } from '@/components/auth/LoginForm';
import Dashboard from './Dashboard';
import { Loader2 } from 'lucide-react';

export default function Index() {
  const { user, loading } = useAuth();
  const { ready, isDriver, isWarehouseOperator, canUseOfficeApp } = useRoleAccess();

  if (loading || (user && !ready)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  // Entregadores só têm a sua área de entregas.
  if (isDriver) {
    return <Navigate to="/entregador" replace />;
  }

  // Operadores de armazém trabalham apenas no scanner.
  if (isWarehouseOperator) {
    return <Navigate to="/scanner" replace />;
  }

  if (!canUseOfficeApp) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
        A sua conta não tem acesso a esta área. Fale com o responsável.
      </div>
    );
  }

  return <Dashboard />;
}
