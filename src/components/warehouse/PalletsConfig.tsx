import { useState } from 'react';
import { Plus, Pencil, Trash2, Box, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { 
  useWarehousePallets, 
  useWarehouseLocations,
  WarehousePallet 
} from '@/hooks/useWarehouseConfig';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Ativo', color: 'bg-green-500' },
  { value: 'empty', label: 'Vazio', color: 'bg-gray-400' },
  { value: 'reserved', label: 'Reservado', color: 'bg-amber-500' },
  { value: 'maintenance', label: 'Manutenção', color: 'bg-red-500' },
];

export function PalletsConfig() {
  const { pallets, isLoading, createPallet, updatePallet, deletePallet } = useWarehousePallets();
  const { locations } = useWarehouseLocations();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingPallet, setEditingPallet] = useState<WarehousePallet | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WarehousePallet | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    code: '',
    current_location_id: '',
    status: 'active',
    notes: '',
  });

  const openCreateDialog = () => {
    setEditingPallet(null);
    const nextCode = `P-${String(pallets.length + 1).padStart(3, '0')}`;
    setFormData({
      code: nextCode,
      current_location_id: '',
      status: 'active',
      notes: '',
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (pallet: WarehousePallet) => {
    setEditingPallet(pallet);
    setFormData({
      code: pallet.code,
      current_location_id: pallet.current_location_id || '',
      status: pallet.status,
      notes: pallet.notes || '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.code.trim()) return;

    if (editingPallet) {
      await updatePallet.mutateAsync({
        id: editingPallet.id,
        code: formData.code,
        current_location_id: formData.current_location_id || null,
        status: formData.status,
        notes: formData.notes || null,
      });
    } else {
      await createPallet.mutateAsync({
        code: formData.code,
        current_location_id: formData.current_location_id || null,
        status: formData.status,
        notes: formData.notes || null,
      });
    }

    setIsDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deletePallet.mutateAsync(deleteTarget.id);
    setIsDeleteDialogOpen(false);
    setDeleteTarget(null);
  };

  const getStatusInfo = (status: string) => {
    return STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];
  };

  const filteredPallets = pallets.filter(pallet => 
    pallet.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pallet.location?.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">Carregando...</div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-lg">Paletes</CardTitle>
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
        {pallets.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            Nenhum palete configurado. Adicione paletes para rastrear no armazém.
          </p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {filteredPallets.map((pallet) => {
              const statusInfo = getStatusInfo(pallet.status);
              return (
                <div
                  key={pallet.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-md bg-muted">
                    <Box className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-mono font-bold">{pallet.code}</p>
                      <Badge variant="secondary" className="gap-1">
                        <span className={`w-2 h-2 rounded-full ${statusInfo.color}`} />
                        {statusInfo.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {pallet.location ? (
                        <span>
                          {pallet.location.code}
                          {pallet.location.aisle && ` (${pallet.location.aisle.name})`}
                        </span>
                      ) : (
                        <span className="italic">Sem localização</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(pallet)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setDeleteTarget(pallet);
                        setIsDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingPallet ? 'Editar Palete' : 'Novo Palete'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="code">Código do Palete</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                placeholder="Ex: P-001, PAL-A01"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Localização Atual</Label>
              <Select
                value={formData.current_location_id || "__none__"}
                onValueChange={(value) => setFormData(prev => ({ 
                  ...prev, 
                  current_location_id: value === "__none__" ? '' : value 
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar localização" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    <span className="text-muted-foreground italic">Nenhuma</span>
                  </SelectItem>
                  {locations.filter(loc => loc.code && loc.code.trim() !== '').map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      <span className="flex items-center gap-2">
                        <MapPin className="h-3 w-3" />
                        {location.code}
                        {location.aisle && (
                          <span className="text-muted-foreground">
                            ({location.aisle.name})
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      <span className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${status.color}`} />
                        {status.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Observações (opcional)</Label>
              <Input
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Ex: Palete danificado, uso temporário"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!formData.code.trim() || createPallet.isPending || updatePallet.isPending}
            >
              {editingPallet ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Palete</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o palete "{deleteTarget?.code}"?
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
