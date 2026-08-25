import { useState } from 'react';
import { MapPin, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLocationAudits } from '@/hooks/useLocationAudits';
import { useProfiles } from '@/hooks/useProfiles';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CreateAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedLocations: string[];
  onSuccess?: (auditId: string) => void;
}

export function CreateAuditDialog({
  open,
  onOpenChange,
  selectedLocations,
  onSuccess,
}: CreateAuditDialogProps) {
  const { createAudit } = useLocationAudits();
  const { profiles } = useProfiles();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [assignedTo, setAssignedTo] = useState<string>('none');
  const [blindMode, setBlindMode] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim() || selectedLocations.length === 0) return;

    const result = await createAudit.mutateAsync({
      name: name.trim(),
      locations: selectedLocations,
      notes: notes.trim() || undefined,
      assignedTo: assignedTo === 'none' ? null : assignedTo,
      blindMode,
    });

    setName('');
    setNotes('');
    setAssignedTo('none');
    setBlindMode(false);
    onOpenChange(false);
    
    if (onSuccess && result) {
      onSuccess(result.id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Nova Conferência
            </DialogTitle>
            <DialogDescription>
              Crie uma conferência para verificar o stock nas localizações seleccionadas.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Conferência</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Rua A - Fevereiro 2026"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>Localizações Seleccionadas ({selectedLocations.length})</Label>
              <div className="flex flex-wrap gap-1 p-2 bg-muted rounded-md max-h-24 overflow-auto">
                {selectedLocations.map(loc => (
                  <Badge key={loc} variant="secondary" className="text-xs">
                    {loc}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Responsável no scanner (opcional)</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Qualquer utilizador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Qualquer utilizador</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="blind-mode" className="flex items-center gap-2">
                  <EyeOff className="h-4 w-4" />
                  Conferência cega
                </Label>
                <p className="text-xs text-muted-foreground">
                  O operador não vê as unidades em sistema durante a contagem.
                </p>
              </div>
              <Switch id="blind-mode" checked={blindMode} onCheckedChange={setBlindMode} />
            </div>



            <div className="space-y-2">
              <Label htmlFor="notes">Notas (opcional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações adicionais..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={!name.trim() || selectedLocations.length === 0 || createAudit.isPending}
            >
              <Plus className="h-4 w-4 mr-2" />
              {createAudit.isPending ? 'A criar...' : 'Criar Conferência'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
