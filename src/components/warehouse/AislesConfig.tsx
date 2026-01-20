import { useState } from 'react';
import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react';
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
import { useWarehouseAisles, WarehouseAisle } from '@/hooks/useWarehouseConfig';

const DEFAULT_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', 
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

export function AislesConfig() {
  const { aisles, isLoading, createAisle, updateAisle, deleteAisle } = useWarehouseAisles();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingAisle, setEditingAisle] = useState<WarehouseAisle | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WarehouseAisle | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: DEFAULT_COLORS[0],
  });

  const openCreateDialog = () => {
    setEditingAisle(null);
    setFormData({
      name: '',
      description: '',
      color: DEFAULT_COLORS[aisles.length % DEFAULT_COLORS.length],
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (aisle: WarehouseAisle) => {
    setEditingAisle(aisle);
    setFormData({
      name: aisle.name,
      description: aisle.description || '',
      color: aisle.color || DEFAULT_COLORS[0],
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) return;

    if (editingAisle) {
      await updateAisle.mutateAsync({
        id: editingAisle.id,
        name: formData.name,
        description: formData.description || null,
        color: formData.color,
      });
    } else {
      await createAisle.mutateAsync({
        name: formData.name,
        description: formData.description || null,
        color: formData.color,
        display_order: aisles.length,
      });
    }

    setIsDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteAisle.mutateAsync(deleteTarget.id);
    setIsDeleteDialogOpen(false);
    setDeleteTarget(null);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">Carregando...</div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Ruas / Corredores</CardTitle>
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-1" />
          Adicionar Rua
        </Button>
      </CardHeader>
      <CardContent>
        {aisles.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            Nenhuma rua configurada. Adicione ruas para organizar o armazém.
          </p>
        ) : (
          <div className="space-y-2">
            {aisles.map((aisle) => (
              <div
                key={aisle.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                <div
                  className="w-8 h-8 rounded-md flex items-center justify-center text-white font-bold text-sm"
                  style={{ backgroundColor: aisle.color }}
                >
                  {aisle.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="font-medium">{aisle.name}</p>
                  {aisle.description && (
                    <p className="text-sm text-muted-foreground">{aisle.description}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditDialog(aisle)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setDeleteTarget(aisle);
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
              {editingAisle ? 'Editar Rua' : 'Nova Rua'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Rua A, Corredor 1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrição (opcional)</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Ex: Estantes altas, produtos pesados"
              />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex gap-2 flex-wrap">
                {DEFAULT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-8 h-8 rounded-md border-2 transition-all ${
                      formData.color === color ? 'border-foreground scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setFormData(prev => ({ ...prev, color }))}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!formData.name.trim() || createAisle.isPending || updateAisle.isPending}
            >
              {editingAisle ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Rua</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover a rua "{deleteTarget?.name}"? 
              As localizações associadas perderão a referência à rua.
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
