import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LoginForm } from "@/components/auth/LoginForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};

const oauth = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const { user, loading: authLoading, signOut } = useAuth();
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDetails(null);
    setError(null);
    if (authLoading || !user) return;
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Pedido inválido: falta o identificador de autorização.");
        return;
      }
      try {
      const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
      if (!data?.client) setError('Pedido inválido ou expirado. Inicie novamente a ligação no agente.');
      } catch {
        if (active) setError('Não foi possível consultar o pedido. Inicie novamente a ligação no agente.');
      }
    })();
    return () => {
      active = false;
    };
  }, [authorizationId, user, authLoading]);

  async function decide(approve: boolean) {
    if (busy) return;
    setBusy(true);
    try {
    const api = oauth();
    const { data, error } = approve
      ? await api.approveAuthorization(authorizationId)
      : await api.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("O servidor de autorização não devolveu um endereço de retorno.");
      return;
    }
    window.location.href = target;
    } catch {
      setError('Não foi possível guardar a decisão. Tente novamente a ligação no agente.');
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <LoginForm />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        {error ? (
          <>
            <CardHeader>
              <CardTitle>Não foi possível continuar</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </>
        ) : !details ? (
          <CardContent className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <CardTitle>
                Ligar {details.client?.name ?? "uma aplicação"} à sua conta
              </CardTitle>
              <CardDescription>
                Esta ligação permite que {details.client?.name ?? "a aplicação"} consulte dados
                e edite nomes e descrições de produtos com as suas permissões.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm break-words">
                <p>Conta: {user.email}</p>
                <p>Destino: {details.redirect_uri ?? details.client?.redirect_uri ?? 'Indicado pela aplicação'}</p>
                <p>Permissões de identidade: {String(details.scope ?? details.scopes ?? 'Perfil e email')}</p>
                <p>As permissões do Contagem continuam a limitar o acesso. Esta ligação não permite alterar stock, pagamentos ou contas.</p>
                <Button variant="link" className="px-0" onClick={() => void signOut()}>Trocar de conta</Button>
              </div>
              <div className="flex gap-3">
              <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Autorizar"}
              </Button>
              </div>
              <Button className="flex-1" variant="outline" disabled={busy} onClick={() => decide(false)}>
                Recusar
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
