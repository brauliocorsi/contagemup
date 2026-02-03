import { useState } from 'react';
import { AlertTriangle, Loader2, Trash2, Database } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface ResetStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ResetStockDialog({ open, onOpenChange }: ResetStockDialogProps) {
  const [confirmText, setConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [progress, setProgress] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isConfirmed = confirmText === 'CONFIRMAR';

  const handleReset = async () => {
    if (!isConfirmed) return;

    setIsResetting(true);

    try {
      // Passo 1: Apagar tabelas dependentes
      setProgress('A apagar itens de picking...');
      await supabase.from('picking_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      setProgress('A apagar logs de contagem...');
      await supabase.from('count_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      setProgress('A apagar itens de reconciliação...');
      await supabase.from('reconciliation_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      setProgress('A apagar itens de auditoria...');
      await supabase.from('location_audit_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      // Passo 2: Apagar tabelas principais
      setProgress('A apagar contagens...');
      await supabase.from('counts').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      setProgress('A apagar movimentos de stock...');
      await supabase.from('stock_movements').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      setProgress('A apagar sessões de picking...');
      await supabase.from('picking_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      setProgress('A apagar sessões de contagem...');
      await supabase.from('counting_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      setProgress('A apagar reconciliações...');
      await supabase.from('reconciliations').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      setProgress('A apagar auditorias...');
      await supabase.from('location_audits').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      setProgress('A apagar histórico de alterações...');
      await supabase.from('product_changes').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      setProgress('A apagar relatórios de danos...');
      await supabase.from('product_damages').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      // Passo 3: Zerar stock nos produtos
      setProgress('A zerar stock dos produtos...');
      const { error: updateError } = await supabase
        .from('products')
        .update({ 
          current_stock: 0, 
          damaged_stock: 0,
          updated_at: new Date().toISOString()
        })
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (updateError) throw updateError;

      // Invalidar todas as queries relevantes
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['counts'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['counting-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['picking-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliations'] });
      queryClient.invalidateQueries({ queryKey: ['location-audits'] });
      queryClient.invalidateQueries({ queryKey: ['product-damages'] });
      queryClient.invalidateQueries({ queryKey: ['last-counts'] });

      toast({
        title: 'Reset concluído',
        description: 'Todos os dados de stock foram zerados. O sistema está pronto para nova contagem.',
      });

      setConfirmText('');
      onOpenChange(false);
    } catch (error: any) {
      console.error('Erro no reset:', error);
      toast({
        title: 'Erro no reset',
        description: error.message || 'Ocorreu um erro ao fazer reset dos dados',
        variant: 'destructive',
      });
    } finally {
      setIsResetting(false);
      setProgress('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Reset de Stock
          </DialogTitle>
          <DialogDescription>
            Esta operação é <strong>irreversível</strong>. Todos os dados de stock serão apagados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* O que será mantido */}
          <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950 p-4">
            <h4 className="font-medium text-green-800 dark:text-green-200 mb-2 flex items-center gap-2">
              <Database className="h-4 w-4" />
              Será mantido
            </h4>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 border-green-300">Produtos</Badge>
              <Badge variant="outline" className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 border-green-300">Localizações</Badge>
              <Badge variant="outline" className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 border-green-300">Paletes</Badge>
              <Badge variant="outline" className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 border-green-300">Nº de Colis</Badge>
              <Badge variant="outline" className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 border-green-300">Categorias</Badge>
              <Badge variant="outline" className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 border-green-300">Utilizadores</Badge>
            </div>
          </div>

          {/* O que será apagado */}
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <h4 className="font-medium text-destructive mb-2 flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              Será apagado
            </h4>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Contagens</Badge>
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Movimentos</Badge>
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Sessões</Badge>
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Picking</Badge>
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Reconciliações</Badge>
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Auditorias</Badge>
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Histórico</Badge>
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Danos</Badge>
            </div>
          </div>

          <Separator />

          {/* Campo de confirmação */}
          <div className="space-y-2">
            <Label htmlFor="confirm" className="text-sm font-medium">
              Escreva <strong>CONFIRMAR</strong> para continuar:
            </Label>
            <Input
              id="confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
              placeholder="CONFIRMAR"
              disabled={isResetting}
              className={isConfirmed ? 'border-green-500' : ''}
            />
          </div>

          {/* Progresso */}
          {isResetting && progress && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
              <Loader2 className="h-4 w-4 animate-spin" />
              {progress}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isResetting}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleReset}
            disabled={!isConfirmed || isResetting}
          >
            {isResetting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                A processar...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Fazer Reset
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
