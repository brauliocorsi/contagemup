import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KeyRound, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { PasswordStrengthMeter, evaluatePassword } from './PasswordStrengthMeter';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  userName: string | null;
}

export function ChangeUserPasswordDialog({ open, onOpenChange, userId, userName }: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const close = () => {
    setPassword('');
    setConfirm('');
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    if (password.length < 8) {
      toast({ title: 'Erro', description: 'A senha deve ter pelo menos 8 caracteres', variant: 'destructive' });
      return;
    }
    if (evaluatePassword(password).score === 0) {
      toast({
        title: 'Senha demasiado fraca',
        description: 'Escolha uma senha mais forte (letras, números e símbolos).',
        variant: 'destructive',
      });
      return;
    }
    if (password !== confirm) {
      toast({ title: 'Erro', description: 'As senhas não coincidem', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-set-password', {
        body: { user_id: userId, new_password: password },
      });
      if (error) {
        let message = error.message || 'A função recusou o pedido';
        const context = (error as { context?: unknown }).context;
        if (context instanceof Response) {
          try {
            const payload = await context.clone().json() as { error?: string };
            if (payload.error) message = payload.error;
          } catch {
            // Keep the original function error when the response has no JSON body.
          }
        }
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);

      toast({ title: 'Senha alterada', description: `A senha de ${userName ?? 'utilizador'} foi atualizada` });
      close();
    } catch (err) {
      toast({
        title: 'Erro ao alterar senha',
        description: err instanceof Error ? err.message : 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Alterar senha
          </DialogTitle>
          <DialogDescription>
            Definir uma nova senha para <span className="font-medium">{userName}</span>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">Nova senha</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              minLength={8}
              required
            />
            <PasswordStrengthMeter password={password} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmar senha</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repita a nova senha"
              minLength={8}
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Evite senhas comuns (ex.: "123456", "password", nome da empresa). Senhas que aparecem em
            fugas de dados conhecidas são recusadas. Sugestão: misture letras, números e símbolos.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <KeyRound className="h-4 w-4 mr-2" />}
              Guardar senha
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
