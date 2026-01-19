import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { ArrowUpCircle, ArrowDownCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { StockMovement } from '@/hooks/useStockMovements';

interface StockHistoryTableProps {
  movements: StockMovement[];
  isLoading: boolean;
  onDelete?: (movement: StockMovement) => void;
  movementType: 'entrada' | 'saida';
}

export function StockHistoryTable({
  movements,
  isLoading,
  onDelete,
  movementType,
}: StockHistoryTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">A carregar...</p>
        </CardContent>
      </Card>
    );
  }

  if (movements.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Nenhum movimento de {movementType} registado.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {movementType === 'entrada' ? (
            <ArrowUpCircle className="h-4 w-4 text-green-600" />
          ) : (
            <ArrowDownCircle className="h-4 w-4 text-red-600" />
          )}
          Histórico de {movementType === 'entrada' ? 'Entradas' : 'Saídas'}
          <Badge variant="secondary">{movements.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Referência</TableHead>
                {onDelete && <TableHead className="w-[50px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((movement) => (
                <TableRow key={movement.id}>
                  <TableCell className="text-sm">
                    {format(new Date(movement.created_at), "dd/MM/yy HH:mm", { locale: pt })}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {movement.products?.code || '-'}
                  </TableCell>
                  <TableCell className="text-sm max-w-[150px] truncate">
                    {movement.products?.name || '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant={movement.movement_type === 'entrada' ? 'default' : 'destructive'}
                      className={movement.movement_type === 'entrada' ? 'bg-green-600' : ''}
                    >
                      {movement.movement_type === 'entrada' ? '+' : '-'}{movement.quantity}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                    {movement.reason || '-'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                    {movement.reference || '-'}
                  </TableCell>
                  {onDelete && (
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Anular movimento?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação irá anular o movimento e reverter o stock do produto.
                              Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => onDelete(movement)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Anular
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
