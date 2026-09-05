// MÓDULO EXPERIMENTAL REMOVÍVEL — cenários guiados com dados fictícios (sem API).
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FlaskConical, Check, X } from 'lucide-react';
import { computeNeeds } from '@/lib/purchase-needs-lab/engine';
import { FICTICIO_AVISO, guidedSteps } from '@/lib/purchase-needs-lab/fixtures';

export function GuidedSimulationPanel() {
  const [runIndex, setRunIndex] = useState(-1);

  const results = guidedSteps.map((step) => {
    const out = computeNeeds(step.input);
    return { step, out, ok: out.totals.faltaComprar === step.faltaEsperada };
  });

  return (
    <div className="space-y-4">
      <Alert>
        <FlaskConical className="h-4 w-4" />
        <AlertDescription>{FICTICIO_AVISO}</AlertDescription>
      </Alert>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setRunIndex(guidedSteps.length - 1)}>
          Correr todos os passos
        </Button>
        <Button size="sm" variant="outline" onClick={() => setRunIndex(-1)}>
          Recomeçar
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {results.map((r, i) => {
          const executado = i <= runIndex;
          return (
            <Card key={r.step.id} className={executado ? '' : 'opacity-70'}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>{r.step.titulo}</span>
                  {executado &&
                    (r.ok ? (
                      <Badge variant="secondary" className="gap-1">
                        <Check className="h-3 w-3" /> OK
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <X className="h-3 w-3" /> Divergente
                      </Badge>
                    ))}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>{r.step.descricao}</p>
                <p>
                  <span className="font-medium text-foreground">Esperado:</span> {r.step.esperado}
                </p>
                {executado && (
                  <p>
                    <span className="font-medium text-foreground">Calculado:</span> falta comprar{' '}
                    {r.out.totals.faltaComprar}
                    {r.out.totals.gruposIncompletos > 0 && ' · marcado como incompleto'}
                  </p>
                )}
                {!executado && (
                  <Button size="sm" variant="ghost" onClick={() => setRunIndex(i)}>
                    Correr até aqui
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
