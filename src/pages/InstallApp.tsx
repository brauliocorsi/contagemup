import { usePWAInstall } from '@/hooks/usePWAInstall';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Smartphone, Monitor, Apple, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function InstallApp() {
  const { canInstall, isInstalled, isIOS, install } = usePWAInstall();
  const navigate = useNavigate();

  const handleInstall = async () => {
    await install();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-6">
        <Button variant="ghost" onClick={() => navigate('/')} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Download className="h-10 w-10 text-primary" />
            </div>
            <CardTitle className="text-2xl">Instalar UP Móveis</CardTitle>
            <CardDescription>
              Instale a aplicação no seu dispositivo para acesso rápido e uso offline.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isInstalled ? (
              <div className="text-center p-4 rounded-lg bg-primary/10 text-primary font-medium">
                ✅ A aplicação já está instalada no seu dispositivo!
              </div>
            ) : canInstall ? (
              <Button onClick={handleInstall} className="w-full" size="lg">
                <Download className="mr-2 h-5 w-5" />
                Instalar Agora
              </Button>
            ) : null}

            <div className="space-y-3 pt-4">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Como instalar
              </h3>

              <div className="space-y-3">
                <div className="flex gap-3 p-3 rounded-lg border">
                  <Monitor className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Windows / Mac / Linux</p>
                    <p className="text-xs text-muted-foreground">
                      No Chrome, clique no ícone de instalação na barra de endereço ou use o menu ⋮ → "Instalar aplicação"
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 p-3 rounded-lg border">
                  <Smartphone className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Android</p>
                    <p className="text-xs text-muted-foreground">
                      No Chrome, toque no menu ⋮ → "Adicionar ao ecrã inicial" ou aceite o banner de instalação
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 p-3 rounded-lg border">
                  <Apple className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">iPhone / iPad</p>
                    <p className="text-xs text-muted-foreground">
                      No Safari, toque no botão Partilhar (□↑) → "Adicionar ao ecrã inicial"
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
