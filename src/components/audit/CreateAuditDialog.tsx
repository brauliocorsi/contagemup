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
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim() || selectedLocations.length === 0) return;

    const result = await createAudit.mutateAsync({
      name: name.trim(),
      locations: selectedLocations,
      notes: notes.trim() || undefined,
    });

    setName('');
    setNotes('');
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
