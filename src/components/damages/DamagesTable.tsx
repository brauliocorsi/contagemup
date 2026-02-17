import { useState } from 'react';
import { ProductDamageWithProduct } from '@/types/damages';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, Trash2, Search, Package, MapPin, Box, Calendar, Edit } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { DAMAGE_TYPES } from '@/types/damages';
import { DamageResolutionDialog } from './DamageResolutionDialog';
import { DamageEditDialog } from './DamageEditDialog';
import { DamageDetailDialog } from './DamageDetailDialog';
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

interface DamagesTableProps {
  damages: ProductDamageWithProduct[];
  onResolve: (data: { id: string; resolution_type: string; resolution_notes?: string }) => Promise<unknown>;
  onUpdate: (data: { id: string; damage_type?: string; description?: string | null; quantity?: number; location?: string | null; pallet_number?: string | null; colis_number?: number | null }) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  isResolving?: boolean;
  isUpdating?: boolean;
  showResolved?: boolean;
}

export function DamagesTable({ damages, onResolve, onUpdate, onDelete, isResolving, isUpdating, showResolved = false }: DamagesTableProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>(showResolved ? 'all' : 'active');
  const [resolveDialogDamage, setResolveDialogDamage] = useState<ProductDamageWithProduct | null>(null);
  const [editDialogDamage, setEditDialogDamage] = useState<ProductDamageWithProduct | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [detailDamage, setDetailDamage] = useState<ProductDamageWithProduct | null>(null);

  const filteredDamages = damages.filter(damage => {
    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      const matchesSearch = 
        damage.product?.name?.toLowerCase().includes(searchLower) ||
        damage.product?.code?.toLowerCase().includes(searchLower) ||
        damage.damage_type.toLowerCase().includes(searchLower) ||
        damage.description?.toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }

    // Type filter
    if (typeFilter !== 'all' && damage.damage_type !== typeFilter) {
      return false;
    }

    // Status filter
    if (statusFilter !== 'all' && damage.status !== statusFilter) {
      return false;
    }

    return true;
  });

  const handleResolve = (damage: ProductDamageWithProduct) => {
    setResolveDialogDamage(damage);
  };

  const handleDelete = async (id: string) => {
    await onDelete(id);
    setDeleteConfirm(null);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar por produto, código, tipo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Tipo de dano" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {DAMAGE_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="resolved">Resolvidos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Tipo de Dano</TableHead>
              <TableHead className="text-center">Qtd</TableHead>
              <TableHead>Localização</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDamages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Nenhuma avaria encontrada
                </TableCell>
              </TableRow>
            ) : (
              filteredDamages.map((damage) => (
                <TableRow key={damage.id} className={`cursor-pointer hover:bg-muted/50 ${damage.status === 'resolved' ? 'opacity-60' : ''}`} onClick={() => setDetailDamage(damage)}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{damage.product?.name || 'Produto removido'}</p>
                        <p className="text-xs text-muted-foreground">{damage.product?.code}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="destructive" className="whitespace-nowrap">
                      {damage.damage_type}
                    </Badge>
                    {damage.colis_number && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Coli {damage.colis_number}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-center font-medium">
                    {damage.quantity}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-sm">
                      {damage.location && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          {damage.location}
                        </div>
                      )}
                      {damage.pallet_number && (
                        <div className="flex items-center gap-1">
                          <Box className="h-3 w-3 text-muted-foreground" />
                          {damage.pallet_number}
                        </div>
                      )}
                      {!damage.location && !damage.pallet_number && (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      {format(new Date(damage.created_at), 'dd/MM/yyyy', { locale: pt })}
                    </div>
                    {damage.resolved_at && (
                      <p className="text-xs text-muted-foreground">
                        Resolvido: {format(new Date(damage.resolved_at), 'dd/MM/yyyy', { locale: pt })}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    {damage.status === 'active' ? (
                      <Badge variant="destructive">Ativo</Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-green-100 text-green-800">
                        {damage.resolution_type || 'Resolvido'}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      {damage.status === 'active' && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditDialogDamage(damage)}
                            title="Editar avaria"
                          >
                            <Edit className="h-4 w-4 text-primary" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleResolve(damage)}
                            title="Resolver avaria"
                          >
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteConfirm(damage.id)}
                        title="Eliminar registo"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Resolution Dialog */}
      {resolveDialogDamage && (
        <DamageResolutionDialog
          open={!!resolveDialogDamage}
          onOpenChange={(open) => !open && setResolveDialogDamage(null)}
          damage={resolveDialogDamage}
          onSubmit={onResolve}
          isLoading={isResolving}
        />
      )}

      {/* Edit Dialog */}
      {editDialogDamage && (
        <DamageEditDialog
          open={!!editDialogDamage}
          onOpenChange={(open) => !open && setEditDialogDamage(null)}
          damage={editDialogDamage}
          onSubmit={onUpdate}
          isLoading={isUpdating}
        />
      )}

      {/* Detail Dialog */}
      {detailDamage && (
        <DamageDetailDialog
          open={!!detailDamage}
          onOpenChange={(open) => !open && setDetailDamage(null)}
          damage={detailDamage}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Avaria?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O registo de avaria será permanentemente eliminado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
