import { useState } from 'react';
import { Plus, Pencil, Trash2, MapPin, Forklift, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  useWarehouseLocations, 
  useWarehouseAisles, 
  useWarehouseLevels,
  WarehouseLocation,
  type LocationType,
  LOCATION_TYPE_LABELS,
} from '@/hooks/useWarehouseConfig';

const LOCATION_TYPE_HINTS: Record<LocationType, string> = {
  stock: 'Localização de armazém. Pode ter rua/rack ou ser uma zona livre (ex: área de sofás) escolhendo "Sem rua" e "Sem nível".',
  pre_exit: 'Cais de carga: destino do picking antes do carregamento.',
  transport: 'Viatura (Carrinha X, Y...): stock carregado e a caminho do cliente.',
  quarantine: 'Zona de devoluções/quarentena.',
};

export function LocationsConfig() {
  const { locations, isLoading, createLocation, updateLocation, deleteLocation } = useWarehouseLocations();
  const { aisles } = useWarehouseAisles();
  const { levels } = useWarehouseLevels();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<WarehouseLocation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WarehouseLocation | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    code: '',
    aisle_id: '',
    level_id: '',
    position_in_aisle: 1,
    notes: '',
    location_type: 'stock' as LocationType,
  });

  const openCreateDialog = () => {
    setEditingLocation(null);
    setFormData({
      code: '',
      aisle_id: aisles[0]?.id || '',
      level_id: levels[0]?.id || '',
      position_in_aisle: 1,
      notes: '',
      location_type: 'stock',
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (location: WarehouseLocation) => {
    setEditingLocation(location);
    setFormData({
      code: location.code,
      aisle_id: location.aisle_id || '',
      level_id: location.level_id || '',
      position_in_aisle: location.position_in_aisle,
      notes: location.notes || '',
      location_type: (location.location_type ?? (location.is_staging ? 'pre_exit' : 'stock')) as LocationType,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.code.trim()) return;

    const isFree = formData.location_type !== 'stock';
    const payload = {
      code: formData.code,
      aisle_id: isFree ? null : (formData.aisle_id || null),
      level_id: isFree ? null : (formData.level_id || null),
      position_in_aisle: isFree ? 1 : formData.position_in_aisle,
      notes: formData.notes || null,
      is_staging: formData.location_type === 'pre_exit',
      location_type: formData.location_type,
    };

    if (editingLocation) {
      await updateLocation.mutateAsync({ id: editingLocation.id, ...payload });
    } else {
      await createLocation.mutateAsync(payload);
    }

    setIsDialogOpen(false);
  };


  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteLocation.mutateAsync(deleteTarget.id);
    setIsDeleteDialogOpen(false);
    setDeleteTarget(null);
  };

  const filteredLocations = locations.filter(loc => 
    loc.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    loc.aisle?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    loc.level?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">Carregando...</div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-lg">Localizações</CardTitle>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Pesquisar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-48"
          />
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-1" />
            Adicionar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {locations.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            Nenhuma localização configurada. Adicione localizações específicas do armazém.
          </p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {filteredLocations.map((location) => (
              <div
                key={location.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-muted">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-mono font-bold">{location.code}</p>
                    {(location.location_type ?? 'stock') !== 'stock' && (
                      <Badge variant="secondary">
                        {LOCATION_TYPE_LABELS[location.location_type as LocationType] ?? 'Zona livre'}
                      </Badge>
                    )}
                    {location.aisle && (
                      <span 
                        className="px-2 py-0.5 rounded text-xs text-white"
                        style={{ backgroundColor: location.aisle.color }}
                      >
                        {location.aisle.name}
                      </span>
                    )}
                    {location.level && (
                      <span 
                        className="px-2 py-0.5 rounded text-xs text-white"
                        style={{ backgroundColor: location.level.color }}
                      >
                        {location.level.short_name}
                      </span>
                    )}
                    {location.level?.requires_forklift ? (
                      <Forklift className="h-4 w-4 text-amber-500" />
                    ) : (
                      <User className="h-4 w-4 text-green-500" />
                    )}
                  </div>
                  {location.notes && (
                    <p className="text-sm text-muted-foreground truncate">{location.notes}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditDialog(location)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setDeleteTarget(location);
                      setIsDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingLocation ? 'Editar Localização' : 'Nova Localização'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="code">Código da Localização</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                placeholder="Ex: C12, A01, B05"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de localização</Label>
              <Select
                value={formData.location_type}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, location_type: value as LocationType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(LOCATION_TYPE_LABELS) as LocationType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {LOCATION_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {LOCATION_TYPE_HINTS[formData.location_type]}
              </p>
            </div>
            {formData.location_type === 'stock' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Rua</Label>
                    <Select
                      value={formData.aisle_id || 'none'}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, aisle_id: value === 'none' ? '' : value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar rua" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem rua</SelectItem>
                        {aisles.map((aisle) => (
                          <SelectItem key={aisle.id} value={aisle.id}>
                            <span className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: aisle.color }}
                              />
                              {aisle.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Nível</Label>
                    <Select
                      value={formData.level_id || 'none'}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, level_id: value === 'none' ? '' : value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar nível" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem nível</SelectItem>
                        {levels.map((level) => (
                          <SelectItem key={level.id} value={level.id}>
                            <span className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: level.color }}
                              />
                              {level.name}
                              {level.requires_forklift && (
                                <Forklift className="h-3 w-3 text-amber-500" />
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="position">Posição na Rua</Label>
                  <Input
                    id="position"
                    type="number"
                    min={1}
                    value={formData.position_in_aisle}
                    onChange={(e) => setFormData(prev => ({ ...prev, position_in_aisle: parseInt(e.target.value) || 1 }))}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Observações (opcional)</Label>
              <Input
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Ex: Próximo à saída, produtos frágeis"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!formData.code.trim() || createLocation.isPending || updateLocation.isPending}
            >
              {editingLocation ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Localização</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover a localização "{deleteTarget?.code}"? 
              Produtos nesta localização manterão o código mas perderão a referência estruturada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
