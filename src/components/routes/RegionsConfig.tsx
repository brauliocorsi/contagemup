import { useState } from 'react';
import { useDeliveryRegions, getWeekdayName } from '@/hooks/useDeliveryRegions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, Edit2, MapPin, ArrowLeft } from 'lucide-react';

interface RegionsConfigProps {
  onBack: () => void;
}

const WEEKDAYS = [
  { value: '1', label: 'Segunda-feira' },
  { value: '2', label: 'Terça-feira' },
  { value: '3', label: 'Quarta-feira' },
  { value: '4', label: 'Quinta-feira' },
  { value: '5', label: 'Sexta-feira' },
  { value: '6', label: 'Sábado' },
  { value: '0', label: 'Domingo' },
];

const COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

export function RegionsConfig({ onBack }: RegionsConfigProps) {
  const { regions, isLoading, createRegion, updateRegion, deleteRegion } = useDeliveryRegions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    postal_prefix_start: '',
    postal_prefix_end: '',
    default_weekday: null as number | null,
    color: '#3B82F6',
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', postal_prefix_start: '', postal_prefix_end: '', default_weekday: null, color: '#3B82F6' });
    setDialogOpen(true);
  };

  const openEdit = (region: any) => {
    setEditingId(region.id);
    setForm({
      name: region.name,
      postal_prefix_start: region.postal_prefix_start,
      postal_prefix_end: region.postal_prefix_end,
      default_weekday: region.default_weekday,
      color: region.color || '#3B82F6',
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name || !form.postal_prefix_start || !form.postal_prefix_end) return;
    if (editingId) {
      updateRegion.mutate({ id: editingId, ...form });
    } else {
      createRegion.mutate(form);
    }
    setDialogOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Regiões de Entrega</h1>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Nova Região
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {regions.map((region) => (
          <Card key={region.id} className="relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full" style={{ backgroundColor: region.color }} />
            <CardContent className="p-4 pl-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{region.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    Códigos: {region.postal_prefix_start} – {region.postal_prefix_end}
                  </p>
                  {region.default_weekday !== null && (
                    <Badge variant="secondary" className="mt-1 text-xs">
                      {getWeekdayName(region.default_weekday)}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(region)}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteRegion.mutate(region.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {regions.length === 0 && !isLoading && (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
              <MapPin className="h-12 w-12 mb-4 opacity-50" />
              <p>Nenhuma região configurada</p>
              <p className="text-sm">Crie regiões para organizar as entregas por zona geográfica</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Região' : 'Nova Região'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome da Região</Label>
              <Input
                placeholder="Ex: Porto, Minho, Lisboa Norte"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Prefixo Postal Início</Label>
                <Input
                  placeholder="4000"
                  value={form.postal_prefix_start}
                  onChange={(e) => setForm(f => ({ ...f, postal_prefix_start: e.target.value }))}
                />
              </div>
              <div>
                <Label>Prefixo Postal Fim</Label>
                <Input
                  placeholder="4999"
                  value={form.postal_prefix_end}
                  onChange={(e) => setForm(f => ({ ...f, postal_prefix_end: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Dia Preferencial de Entrega</Label>
              <Select
                value={form.default_weekday !== null ? String(form.default_weekday) : ''}
                onValueChange={(v) => setForm(f => ({ ...f, default_weekday: v ? parseInt(v) : null }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem preferência" />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map(d => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cor</Label>
              <div className="flex gap-2 mt-1">
                {COLORS.map(c => (
                  <button
                    key={c}
                    className={`w-8 h-8 rounded-full border-2 transition-transform ${form.color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setForm(f => ({ ...f, color: c }))}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.name || !form.postal_prefix_start || !form.postal_prefix_end}>
              {editingId ? 'Guardar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
