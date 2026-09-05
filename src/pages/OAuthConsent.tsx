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
  const { user, loading: authLoading } = useAuth();
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Pedido inválido: falta o identificador de autorização.");
        return;
      }
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
    })();
    return () => {
      active = false;
    };
  }, [authorizationId, user, authLoading]);

  async function decide(approve: boolean) {
    setBusy(true);
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
                Esta ligação permite que {details.client?.name ?? "a aplicação"} consulte o
                Contagem Stock UP com as suas permissões.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-3">
              <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Autorizar"}
              </Button>
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
