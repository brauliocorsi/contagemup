import { useState } from 'react';
import { Truck, Loader2, LogOut, MapPin, PackageCheck, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { LoginForm } from '@/components/auth/LoginForm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { DeliveryExecution } from '@/components/driver/DeliveryExecution';
import { useMyDeliveryAttempts, type DeliveryAttempt } from '@/hooks/useDeliveryAttempts';

function fmtDate(d: string | null) {
  if (!d) return 'Sem data';
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-PT');
}

/**
 * Área exclusiva do entregador. Só mostra as entregas atribuídas a quem entra —
 * o isolamento é garantido pelas regras do servidor, não por esconder menus.
 */
export default function DriverApp() {
  const { user, loading, signOut, profile } = useAuth();
  const { data: attempts = [], isLoading, refetch, isFetching } = useMyDeliveryAttempts();
  const [openId, setOpenId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <LoginForm />;

  const open: DeliveryAttempt | undefined = attempts.find((a) => a.id === openId);

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <Truck className="h-5 w-5 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Minhas entregas</p>
            <p className="truncate text-xs text-muted-foreground">{profile?.name ?? user.email}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Atualizar"
            onClick={() => void refetch()}
          >
            <RefreshCw className={isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Sair" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
        {open ? (
          <DeliveryExecution attempt={open} onBack={() => setOpenId(null)} />
        ) : isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : attempts.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            <PackageCheck className="mx-auto mb-2 h-6 w-6" />
            Não tem entregas atribuídas de momento.
          </div>
        ) : (
          <div className="space-y-2">
            {attempts.map((a) => (
              <Card key={a.id}>
                <CardContent className="p-0">
                  <button
                    className="w-full space-y-1 p-4 text-left"
                    onClick={() => setOpenId(a.id)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {a.client_name || 'Cliente'}
                      </span>
                      <Badge variant={a.status === 'in_transit' ? 'default' : 'secondary'}>
                        {a.status === 'in_transit' ? 'A caminho' : 'Por iniciar'}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      Encomenda {a.order_number} • {fmtDate(a.scheduled_date)}
                      {a.attempt_number > 1 ? ` • tentativa ${a.attempt_number}` : ''}
                    </p>
                    {a.address && (
                      <p className="flex items-start gap-1 text-xs text-muted-foreground">
                        <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                        <span className="truncate">{a.address}</span>
                      </p>
                    )}
                    {a.partial_load && (
                      <Badge variant="outline" className="border-warning/50 text-warning">
                        Carga incompleta do armazém
                      </Badge>
                    )}
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
