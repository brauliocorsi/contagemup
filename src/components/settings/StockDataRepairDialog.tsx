import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Search, Wrench } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface DiagnosticResult {
  totalSuspect: number;
  affectedProducts: number;
}

interface RepairResult {
  movementsDeleted: number;
  stockRecalculated: boolean;
}

type Phase = 'idle' | 'diagnosing' | 'diagnosed' | 'confirming' | 'repairing' | 'done';

interface StockDataRepairDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StockDataRepairDialog({ open, onOpenChange }: StockDataRepairDialogProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const [repairResult, setRepairResult] = useState<RepairResult | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const handleDiagnose = async () => {
    setPhase('diagnosing');
    setProgress(30);

    try {
      const { data, error } = await supabase.rpc('count_false_movements');

      if (error) throw error;

      const result = data?.[0] || { total_suspect: 0, affected_products: 0 };
      setDiagnostic({
        totalSuspect: Number(result.total_suspect),
        affectedProducts: Number(result.affected_products),
      });
      setProgress(100);
      setPhase('diagnosed');
    } catch (error: any) {
      toast({
        title: 'Erro no diagnóstico',
        description: error.message,
        variant: 'destructive',
      });
      setPhase('idle');
      setProgress(0);
    }
  };

  const handleRepair = async () => {
    if (confirmText !== 'CORRIGIR') return;

    setPhase('repairing');
    setProgress(20);

    try {
      // Phase 1: Delete false movements
      const { data: deleted, error: deleteError } = await supabase.rpc('cleanup_false_movements');
      if (deleteError) throw deleteError;

      setProgress(60);

      // Phase 2: Recalculate all stock
      const { error: recalcError } = await supabase.rpc('recalculate_all_stock');
      if (recalcError) throw recalcError;

      setProgress(100);
      setRepairResult({
        movementsDeleted: Number(deleted) || 0,
        stockRecalculated: true,
      });
      setPhase('done');

      toast({
        title: 'Correcção concluída',
        description: `${deleted} movimentos falsos removidos e stock recalculado`,
      });
    } catch (error: any) {
      toast({
        title: 'Erro na correcção',
        description: error.message,
        variant: 'destructive',
      });
      setPhase('diagnosed');
      setProgress(100);
    }
  };

  const handleClose = () => {
    setPhase('idle');
    setDiagnostic(null);
    setRepairResult(null);
    setConfirmText('');
    setProgress(0);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-amber-500" />
            Corrigir Dados Históricos
          </DialogTitle>
          <DialogDescription>
            Remove movimentos falsos criados pelo bug pré-v1.2.0 e recalcula o stock de todos os produtos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Progress bar */}
          {phase !== 'idle' && phase !== 'done' && (
            <Progress value={progress} className="h-2" />
          )}

          {/* Idle state */}
          {phase === 'idle' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                O bug anterior à v1.2.0 criava registos falsos de entrada/saída no histórico de movimentos cada vez que um coli individual era ajustado na contagem. Esta ferramenta identifica e remove esses registos, depois recalcula o stock correcto.
              </p>
              <Button onClick={handleDiagnose} className="w-full">
                <Search className="h-4 w-4 mr-2" />
                Diagnosticar
              </Button>
            </div>
          )}

          {/* Diagnosing */}
          {phase === 'diagnosing' && (
            <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              A analisar movimentos...
            </div>
          )}

          {/* Diagnosed */}
          {phase === 'diagnosed' && diagnostic && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-2">
                <h4 className="font-medium text-sm">Resultado do Diagnóstico</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
                    <p className="text-2xl font-bold text-amber-600">{diagnostic.totalSuspect}</p>
                    <p className="text-xs text-muted-foreground">Movimentos suspeitos</p>
                  </div>
                  <div className="text-center p-3 rounded-md bg-blue-500/10 border border-blue-500/20">
                    <p className="text-2xl font-bold text-blue-600">{diagnostic.affectedProducts}</p>
                    <p className="text-xs text-muted-foreground">Produtos afectados</p>
                  </div>
                </div>
              </div>

              {diagnostic.totalSuspect === 0 ? (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Nenhum movimento falso encontrado. Os dados estão limpos!
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      Esta acção vai apagar {diagnostic.totalSuspect} movimentos falsos e recalcular o stock de todos os produtos. Escreva <strong>CORRIGIR</strong> para confirmar.
                    </span>
                  </div>
                  <Input
                    placeholder='Escreva "CORRIGIR" para confirmar'
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                  />
                  <Button
                    onClick={handleRepair}
                    disabled={confirmText !== 'CORRIGIR'}
                    variant="destructive"
                    className="w-full"
                  >
                    <Wrench className="h-4 w-4 mr-2" />
                    Aplicar Correcções
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Repairing */}
          {phase === 'repairing' && (
            <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              A corrigir dados...
            </div>
          )}

          {/* Done */}
          {phase === 'done' && repairResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Correcção concluída com sucesso!</span>
              </div>
              <div className="rounded-lg border p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Movimentos falsos removidos</span>
                  <span className="font-medium">{repairResult.movementsDeleted}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stock recalculado</span>
                  <span className="font-medium text-green-600">✓</span>
                </div>
              </div>
              <Button onClick={handleClose} className="w-full">
                Fechar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
