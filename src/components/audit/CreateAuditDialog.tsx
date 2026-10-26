import { useEffect, useState } from 'react';
import { useCategories } from '@/hooks/useCategories';
import { fetchGlobalAuditProducts } from '@/hooks/useLocationAudits';
import { MapPin, Plus, EyeOff, Tags } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
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
  /** 'global' = por categoria/palavra, sem localizações. */
  mode?: 'location' | 'global';
}

export function CreateAuditDialog({
  open,
  onOpenChange,
  selectedLocations,
  onSuccess,
  mode = 'location',
}: CreateAuditDialogProps) {
  const isGlobal = mode === 'global';
  const { categories } = useCategories();
  const [category, setCategory] = useState<string>('all');
  const [keyword, setKeyword] = useState('');
  const [preview, setPreview] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !isGlobal) return;
    if (category === 'all' && !keyword.trim()) { setPreview(null); return; }
    let cancel = false;
    const t = setTimeout(async () => {
      const list = await fetchGlobalAuditProducts({ category: category === 'all' ? null : category, keyword });
      if (!cancel) setPreview(list.length);
    }, 400);
    return () => { cancel = true; clearTimeout(t); };
  }, [open, isGlobal, category, keyword]);

  const canSubmit = isGlobal ? (category !== 'all' || !!keyword.trim()) && (preview ?? 0) > 0 : selectedLocations.length > 0;
  const { createAudit } = useLocationAudits();
  const { profiles } = useProfiles();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [assignedTo, setAssignedTo] = useState<string>('none');
  const [blindMode, setBlindMode] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim() || !canSubmit) return;

    const result = await createAudit.mutateAsync({
      name: name.trim(),
      locations: isGlobal ? ['TODAS'] : selectedLocations,
      global: isGlobal ? { category: category === 'all' ? null : category, keyword: keyword.trim() || null } : undefined,
      notes: notes.trim() || undefined,
      assignedTo: assignedTo === 'none' ? null : assignedTo,
      blindMode,
    });

    setName('');
    setNotes('');
    setAssignedTo('none');
    setBlindMode(false);
    setCategory('all');
    setKeyword('');
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
              {isGlobal ? <Tags className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
              {isGlobal ? 'Conferência por categoria / palavra' : 'Nova Conferência'}
            </DialogTitle>
            <DialogDescription>
              {isGlobal
                ? 'O operador pica só os produtos, em qualquer localização. No fim vê o total contado contra o stock total e onde o sistema tem cada produto.'
                : 'Crie uma conferência para verificar o stock nas localizações seleccionadas.'}
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

            {isGlobal ? (
              <>
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as categorias</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kw">Palavra no nome (opcional)</Label>
                  <Input id="kw" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Ex: cama" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {preview === null ? 'Escolha uma categoria ou escreva uma palavra.' : `${preview} produto(s) a contar.`}
                </p>
              </>
            ) : (
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
            )}

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
              disabled={!name.trim() || !canSubmit || createAudit.isPending}
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
