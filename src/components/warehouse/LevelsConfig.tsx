import { useState } from 'react';
import { Plus, Pencil, Trash2, Forklift, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { useWarehouseLevels, WarehouseLevel } from '@/hooks/useWarehouseConfig';

const DEFAULT_COLORS = [
  '#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#7C3AED', 
  '#EC4899', '#06B6D4', '#84CC16'
];

export function LevelsConfig() {
  const { levels, isLoading, createLevel, updateLevel, deleteLevel } = useWarehouseLevels();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingLevel, setEditingLevel] = useState<WarehouseLevel | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WarehouseLevel | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    short_name: '',
    level_number: 0,
    requires_forklift: false,
    color: DEFAULT_COLORS[0],
  });

  const openCreateDialog = () => {
    setEditingLevel(null);
    const nextLevel = levels.length;
    setFormData({
      name: `Nível ${nextLevel}`,
      short_name: nextLevel === 0 ? 'CH' : `N${nextLevel}`,
      level_number: nextLevel,
      requires_forklift: nextLevel >= 2,
      color: DEFAULT_COLORS[nextLevel % DEFAULT_COLORS.length],
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (level: WarehouseLevel) => {
    setEditingLevel(level);
    setFormData({
      name: level.name,
      short_name: level.short_name,
      level_number: level.level_number,
      requires_forklift: level.requires_forklift,
      color: level.color || DEFAULT_COLORS[0],
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.short_name.trim()) return;

    if (editingLevel) {
      await updateLevel.mutateAsync({
        id: editingLevel.id,
        name: formData.name,
        short_name: formData.short_name,
        level_number: formData.level_number,
        requires_forklift: formData.requires_forklift,
        color: formData.color,
      });
    } else {
      await createLevel.mutateAsync({
        name: formData.name,
        short_name: formData.short_name,
        level_number: formData.level_number,
        requires_forklift: formData.requires_forklift,
        color: formData.color,
        display_order: levels.length,
      });
    }

    setIsDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteLevel.mutateAsync(deleteTarget.id);
    setIsDeleteDialogOpen(false);
    setDeleteTarget(null);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">Carregando...</div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Níveis / Andares</CardTitle>
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-1" />
          Adicionar Nível
        </Button>
      </CardHeader>
      <CardContent>
        {levels.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            Nenhum nível configurado. Adicione níveis para definir alturas do armazém.
          </p>
        ) : (
          <div className="space-y-2">
            {levels.map((level) => (
              <div
                key={level.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div
                  className="w-10 h-10 rounded-md flex items-center justify-center text-white font-bold text-xs"
                  style={{ backgroundColor: level.color }}
                >
                  {level.short_name}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{level.name}</p>
                    {level.requires_forklift ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                        <Forklift className="h-3 w-3" />
                        Empilhador
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        <User className="h-3 w-3" />
                        Manual
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Altura: {level.level_number}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditDialog(level)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setDeleteTarget(level);
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
              {editingLevel ? 'Editar Nível' : 'Novo Nível'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Chão, Nível 1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="short_name">Abreviação</Label>
                <Input
                  id="short_name"
                  value={formData.short_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, short_name: e.target.value }))}
                  placeholder="Ex: CH, N1, N2"
                  maxLength={4}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="level_number">Número do Nível (altura)</Label>
              <Input
                id="level_number"
                type="number"
                min={0}
                value={formData.level_number}
                onChange={(e) => setFormData(prev => ({ ...prev, level_number: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="forklift" className="text-base">Requer Empilhador</Label>
                <p className="text-sm text-muted-foreground">
                  Ativar se este nível precisa de empilhador para acesso
                </p>
              </div>
              <Switch
                id="forklift"
                checked={formData.requires_forklift}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, requires_forklift: checked }))}
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
              disabled={!formData.name.trim() || !formData.short_name.trim() || createLevel.isPending || updateLevel.isPending}
            >
              {editingLevel ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Nível</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o nível "{deleteTarget?.name}"? 
              As localizações associadas perderão a referência ao nível.
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
