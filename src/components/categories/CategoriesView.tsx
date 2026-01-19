import { useState } from 'react';
import { useCategories, Category } from '@/hooks/useCategories';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Pencil, Trash2, Tags, X } from 'lucide-react';

interface ColisNameEntry {
  colisNumber: string;
  name: string;
}

function ColisNamesEditor({ 
  colisNames, 
  onChange 
}: { 
  colisNames: ColisNameEntry[]; 
  onChange: (names: ColisNameEntry[]) => void;
}) {
  const addEntry = () => {
    const nextNumber = colisNames.length > 0 
      ? Math.max(...colisNames.map(c => parseInt(c.colisNumber) || 0)) + 1 
      : 1;
    onChange([...colisNames, { colisNumber: nextNumber.toString(), name: '' }]);
  };

  const updateEntry = (index: number, field: 'colisNumber' | 'name', value: string) => {
    const updated = [...colisNames];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const removeEntry = (index: number) => {
    onChange(colisNames.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {colisNames.map((entry, index) => (
        <div key={index} className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">Cóli nº</span>
            <Input
              type="number"
              min="1"
              value={entry.colisNumber}
              onChange={(e) => updateEntry(index, 'colisNumber', e.target.value)}
              className="w-16 h-8"
            />
          </div>
          <span className="text-muted-foreground">→</span>
          <Input
            value={entry.name}
            onChange={(e) => updateEntry(index, 'name', e.target.value)}
            placeholder="Nome do cóli (ex: Cabeceiras)"
            className="flex-1 h-8"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => removeEntry(index)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addEntry}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Adicionar cóli
      </Button>
    </div>
  );
}

function convertToColisNames(record: Record<string, string> | null): ColisNameEntry[] {
  if (!record) return [];
  return Object.entries(record)
    .map(([colisNumber, name]) => ({ colisNumber, name }))
    .sort((a, b) => parseInt(a.colisNumber) - parseInt(b.colisNumber));
}

function convertToRecord(entries: ColisNameEntry[]): Record<string, string> | null {
  const filtered = entries.filter(e => e.colisNumber && e.name.trim());
  if (filtered.length === 0) return null;
  return Object.fromEntries(filtered.map(e => [e.colisNumber, e.name.trim()]));
}

export function CategoriesView() {
  const { categories, loading, createCategory, updateCategory, deleteCategory } = useCategories();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{
    id: string;
    name: string;
    description: string;
    enableColisNames: boolean;
    colisNames: ColisNameEntry[];
  } | null>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [enableNewColisNames, setEnableNewColisNames] = useState(false);
  const [newColisNames, setNewColisNames] = useState<ColisNameEntry[]>([]);

  const resetCreateForm = () => {
    setNewName('');
    setNewDescription('');
    setEnableNewColisNames(false);
    setNewColisNames([]);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const colisNamesRecord = enableNewColisNames ? convertToRecord(newColisNames) : null;
    const result = await createCategory(newName, newDescription, colisNamesRecord);
    if (result) {
      resetCreateForm();
      setIsCreateOpen(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingCategory || !editingCategory.name.trim()) return;
    const colisNamesRecord = editingCategory.enableColisNames 
      ? convertToRecord(editingCategory.colisNames) 
      : null;
    const result = await updateCategory(
      editingCategory.id, 
      editingCategory.name, 
      editingCategory.description,
      colisNamesRecord
    );
    if (result) {
      setEditingCategory(null);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteCategory(id);
  };

  const openEditDialog = (category: Category) => {
    const colisNames = convertToColisNames(category.colis_names);
    setEditingCategory({
      id: category.id,
      name: category.name,
      description: category.description || '',
      enableColisNames: colisNames.length > 0,
      colisNames: colisNames.length > 0 ? colisNames : []
    });
  };

  const getColisNamesDisplay = (category: Category) => {
    if (!category.colis_names) return null;
    const entries = Object.entries(category.colis_names);
    if (entries.length === 0) return null;
    return entries
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .map(([num, name]) => `${num}: ${name}`)
      .join(', ');
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Tags className="h-5 w-5" />
            Categorias
          </h2>
          <p className="text-sm text-muted-foreground">
            Gerencie as categorias dos produtos
          </p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) resetCreateForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nova Categoria
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nova Categoria</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nome da categoria"
                  maxLength={50}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição (opcional)</Label>
                <Textarea
                  id="description"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Descrição da categoria"
                  maxLength={200}
                />
              </div>
              
              <div className="border-t pt-4">
                <div className="flex items-center space-x-2 mb-3">
                  <Checkbox
                    id="enable-colis-names"
                    checked={enableNewColisNames}
                    onCheckedChange={(checked) => {
                      setEnableNewColisNames(checked === true);
                      if (checked && newColisNames.length === 0) {
                        setNewColisNames([{ colisNumber: '1', name: '' }]);
                      }
                    }}
                  />
                  <Label htmlFor="enable-colis-names" className="text-sm font-medium cursor-pointer">
                    Definir nomes dos cólis
                  </Label>
                </div>
                {enableNewColisNames && (
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-3">
                      Defina nomes para cada número de cóli. Isso será visível durante a contagem.
                    </p>
                    <ColisNamesEditor
                      colisNames={newColisNames}
                      onChange={setNewColisNames}
                    />
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={!newName.trim()}>
                Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista de Categorias</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Nomes dos Cólis</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Nenhuma categoria cadastrada
                  </TableCell>
                </TableRow>
              ) : (
                categories.map(category => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium">{category.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {category.description || '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {getColisNamesDisplay(category) || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Dialog 
                          open={editingCategory?.id === category.id} 
                          onOpenChange={(open) => !open && setEditingCategory(null)}
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(category)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader>
                              <DialogTitle>Editar Categoria</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label htmlFor="edit-name">Nome</Label>
                                <Input
                                  id="edit-name"
                                  value={editingCategory?.name || ''}
                                  onChange={(e) => setEditingCategory(prev => 
                                    prev ? { ...prev, name: e.target.value } : null
                                  )}
                                  placeholder="Nome da categoria"
                                  maxLength={50}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="edit-description">Descrição (opcional)</Label>
                                <Textarea
                                  id="edit-description"
                                  value={editingCategory?.description || ''}
                                  onChange={(e) => setEditingCategory(prev => 
                                    prev ? { ...prev, description: e.target.value } : null
                                  )}
                                  placeholder="Descrição da categoria"
                                  maxLength={200}
                                />
                              </div>
                              
                              <div className="border-t pt-4">
                                <div className="flex items-center space-x-2 mb-3">
                                  <Checkbox
                                    id="edit-enable-colis-names"
                                    checked={editingCategory?.enableColisNames || false}
                                    onCheckedChange={(checked) => {
                                      setEditingCategory(prev => {
                                        if (!prev) return null;
                                        const enableColisNames = checked === true;
                                        return {
                                          ...prev,
                                          enableColisNames,
                                          colisNames: enableColisNames && prev.colisNames.length === 0 
                                            ? [{ colisNumber: '1', name: '' }] 
                                            : prev.colisNames
                                        };
                                      });
                                    }}
                                  />
                                  <Label htmlFor="edit-enable-colis-names" className="text-sm font-medium cursor-pointer">
                                    Definir nomes dos cólis
                                  </Label>
                                </div>
                                {editingCategory?.enableColisNames && (
                                  <div className="bg-muted/50 p-3 rounded-lg">
                                    <p className="text-xs text-muted-foreground mb-3">
                                      Defina nomes para cada número de cóli. Isso será visível durante a contagem.
                                    </p>
                                    <ColisNamesEditor
                                      colisNames={editingCategory.colisNames}
                                      onChange={(names) => setEditingCategory(prev => 
                                        prev ? { ...prev, colisNames: names } : null
                                      )}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setEditingCategory(null)}>
                                Cancelar
                              </Button>
                              <Button onClick={handleUpdate} disabled={!editingCategory?.name.trim()}>
                                Salvar
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>

                        {category.name !== 'Geral' && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir Categoria</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir a categoria "{category.name}"?
                                  Esta ação não pode ser desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(category.id)}>
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
