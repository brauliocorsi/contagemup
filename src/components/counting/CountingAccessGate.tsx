import { useState } from 'react';
import { Lock, Unlock, ShieldCheck, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { LocationAudit, useMyLocationAudits, useLocationAudits } from '@/hooks/useLocationAudits';

export interface CountingUnlock {
  auditId: string;
  auditName: string;
  locations: string[];
}

interface Props {
  unlock: CountingUnlock | null;
  onUnlock: (u: CountingUnlock | null) => void;
}

export function CountingAccessGate({ unlock, onUnlock }: Props) {
  const { data: audits = [] } = useMyLocationAudits();
  const { startAudit } = useLocationAudits();
  const [open, setOpen] = useState(false);
  const [auditId, setAuditId] = useState<string>('');
  const [code, setCode] = useState('');

  const selected = audits.find(a => a.id === auditId) as LocationAudit | undefined;

  const handleConfirm = async () => {
    if (!selected) return;
    if ((selected.access_code || '').trim() !== code.trim()) {
      toast.error('Código de acesso incorreto');
      return;
    }
    if (selected.status === 'pending') {
      await startAudit.mutateAsync(selected.id);
    }
    onUnlock({ auditId: selected.id, auditName: selected.name, locations: selected.locations || [] });
    setOpen(false);
    setCode('');
    toast.success('Contagem desbloqueada para as localizações da conferência');
  };

  if (unlock) {
    return (
      <Card className="border-success/40 bg-success-soft/40">
        <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3 py-4">
          <Unlock className="h-5 w-5 text-success" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">A contar em: {unlock.auditName}</p>
            <div className="flex flex-wrap items-center gap-1 mt-1">
              {unlock.locations.map(l => (
                <Badge key={l} variant="secondary" className="text-[11px]">
                  <MapPin className="h-3 w-3 mr-1" />{l}
                </Badge>
              ))}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => onUnlock(null)}>
            Terminar contagem
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-border-subtle">
        <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3 py-4">
          <Lock className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-medium">Modo consulta</p>
            <p className="text-xs text-muted-foreground">
              Pode pesquisar e ver quantidades por coli e localização. Para alterar stock precisa de uma
              conferência aberta pelo administrador e do código de acesso.
            </p>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            <ShieldCheck className="h-4 w-4 mr-1" />
            Desbloquear contagem
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desbloquear contagem</DialogTitle>
            <DialogDescription>
              Escolha a conferência que lhe foi atribuída e introduza o código dado pelo administrador.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Conferência</Label>
              <Select value={auditId} onValueChange={setAuditId}>
                <SelectTrigger>
                  <SelectValue placeholder={audits.length ? 'Selecionar conferência' : 'Sem conferências abertas'} />
                </SelectTrigger>
                <SelectContent>
                  {audits.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} · {a.locations?.length || 0} localizações
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Código de acesso</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                placeholder="000000"
                maxLength={12}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirm} disabled={!selected || !code.trim()}>Entrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
