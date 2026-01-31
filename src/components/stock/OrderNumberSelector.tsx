import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { 
  Plus, Trash2, MapPin, Package, Check, X, ClipboardList, 
  ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Minus, ArrowRightLeft
} from 'lucide-react';
import { useOrderNumbers } from '@/hooks/useOrderNumbers';
import { OrderNumberEntry } from '@/types/stock';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
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
import { LocationSelect } from '@/components/counting/LocationSelect';
import { PalletSelect } from '@/components/counting/PalletSelect';

interface OrderNumberExitSelectorProps {
  productId: string;
  productCode: string;
  productName: string;
  totalColis: number;
  colisNames?: Record<string, string> | null;
  onAddToCart: (orderEntry: OrderNumberEntry) => void;
}

export function OrderNumberExitSelector({
  productId,
  productCode,
  productName,
  totalColis: productTotalColis,
  colisNames,
  onAddToCart,
}: OrderNumberExitSelectorProps) {
  // Calculate effective total colis: use max between product's total_colis and category's colis_names count
  const categoryColisCount = colisNames ? Object.keys(colisNames).length : 0;
  const totalColis = Math.max(productTotalColis, categoryColisCount);

  const { orderNumbers, loading, verifyOrderNumber } = useOrderNumbers(productId, totalColis);
  const [searchValue, setSearchValue] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    found: boolean;
    order?: OrderNumberEntry;
    message?: string;
  } | null>(null);

  const completeOrders = orderNumbers.filter(o => o.is_complete);
  const incompleteOrders = orderNumbers.filter(o => !o.is_complete);

  const handleVerify = async () => {
    if (!searchValue.trim()) return;
    
    setVerifying(true);
    setVerificationResult(null);

    const order = await verifyOrderNumber(searchValue.trim());
    
    if (order) {
      if (order.is_complete) {
        setVerificationResult({
          found: true,
          order,
          message: 'Encontrado em stock!'
        });
      } else {
        const missingColis: number[] = [];
        for (let i = 1; i <= totalColis; i++) {
          if (!order.colis_status[i.toString()]) {
            missingColis.push(i);
          }
        }
        setVerificationResult({
          found: true,
          order,
          message: `Encomenda incompleta (falta: ${missingColis.map(c => `Cóli ${c}`).join(', ')})`
        });
      }
    } else {
      setVerificationResult({
        found: false,
        message: 'Número de encomenda não encontrado'
      });
    }
    
    setVerifying(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleVerify();
    }
  };

  const handleSelect = (order: OrderNumberEntry) => {
    if (order.is_complete) {
      onAddToCart(order);
      setSearchValue('');
      setVerificationResult(null);
    }
  };

  const getColisName = (colisNumber: number): string => {
    if (colisNames && colisNames[colisNumber.toString()]) {
      return colisNames[colisNumber.toString()];
    }
    return `Cóli ${colisNumber}`;
  };

  const getColisStatusBadges = (order: OrderNumberEntry) => {
    return Array.from({ length: totalColis }, (_, i) => {
      const colisNum = i + 1;
      const isPresent = order.colis_status[colisNum.toString()];
      const colisName = getColisName(colisNum);
      return (
        <span
          key={colisNum}
          className={cn(
            "inline-flex items-center gap-0.5 text-xs px-1 py-0.5 rounded",
            isPresent ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          )}
        >
          {colisName}
          {isPresent ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
        </span>
      );
    });
  };

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-amber-600" />
          Selecionar por Nº Encomenda
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {productCode} - {productName}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Search input */}
        <div className="flex gap-2">
          <Input
            value={searchValue}
            onChange={(e) => {
              setSearchValue(e.target.value);
              setVerificationResult(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Número de encomenda..."
            disabled={verifying}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleVerify}
            disabled={verifying || !searchValue.trim()}
          >
            Verificar
          </Button>
        </div>

        {/* Verification result */}
        {verificationResult && (
          <div className={cn(
            "p-2 rounded-lg border text-sm",
            verificationResult.found && verificationResult.order?.is_complete
              ? "bg-green-50 border-green-200 text-green-800"
              : verificationResult.found
              ? "bg-yellow-50 border-yellow-200 text-yellow-800"
              : "bg-red-50 border-red-200 text-red-800"
          )}>
            <div className="flex items-center justify-between">
              <span>{verificationResult.message}</span>
              {verificationResult.order?.is_complete && (
                <Button
                  size="sm"
                  onClick={() => handleSelect(verificationResult.order!)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Adicionar
                </Button>
              )}
            </div>
            {verificationResult.order && (
              <div className="mt-2 space-y-1">
                {(verificationResult.order.location || verificationResult.order.pallet_number) && (
                  <div className="flex gap-2 text-xs">
                    {verificationResult.order.location && (
                      <Badge variant="outline" className="gap-1">
                        <MapPin className="h-2.5 w-2.5" />
                        {verificationResult.order.location}
                      </Badge>
                    )}
                    {verificationResult.order.pallet_number && (
                      <Badge variant="outline" className="gap-1">
                        <Package className="h-2.5 w-2.5" />
                        {verificationResult.order.pallet_number}
                      </Badge>
                    )}
                  </div>
                )}
                {totalColis > 1 && (
                  <div className="flex flex-wrap gap-1">
                    {getColisStatusBadges(verificationResult.order)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Available orders list */}
        {!loading && completeOrders.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Encomendas disponíveis ({completeOrders.length}):
            </Label>
            <ScrollArea className="h-[120px]">
              <div className="space-y-1">
                {completeOrders.map(order => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-2 rounded bg-background border cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleSelect(order)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{order.order_number}</span>
                      {order.location && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <MapPin className="h-2.5 w-2.5" />
                          {order.location}
                        </Badge>
                      )}
                    </div>
                    <Button size="sm" variant="ghost" className="h-6 px-2">
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Incomplete orders warning */}
        {!loading && incompleteOrders.length > 0 && (
          <div className="text-xs text-muted-foreground">
            <span className="text-yellow-600">{incompleteOrders.length}</span> encomenda(s) incompleta(s) não listada(s)
          </div>
        )}

        {loading && (
          <div className="text-sm text-muted-foreground text-center py-2">
            Carregando...
          </div>
        )}

        {!loading && orderNumbers.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-2">
            Nenhuma encomenda registada para este produto
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface OrderNumberEntrySelectorProps {
  productId: string;
  productCode: string;
  productName: string;
  totalColis: number;
  currentStock: number; // Total stock from products table
  location?: string;
  palletNumber?: string;
  colisNames?: Record<string, string> | null;
  onOrderAdded: () => void;
  onOrderDeleted?: () => void;
}

export function OrderNumberEntrySelector({
  productId,
  productCode,
  productName,
  totalColis: productTotalColis,
  currentStock,
  location,
  palletNumber,
  colisNames,
  onOrderAdded,
  onOrderDeleted,
}: OrderNumberEntrySelectorProps) {
  // Calculate effective total colis: use max between product's total_colis and category's colis_names count
  // This handles cases where product has total_colis=1 but category defines 2+ colis names
  const categoryColisCount = colisNames ? Object.keys(colisNames).length : 0;
  const totalColis = Math.max(productTotalColis, categoryColisCount);

  const { orderNumbers, loading, addOrderNumber, updateColisStatus, updateOrderLocation, deleteOrderNumber, convertStockToOrder, removeGenericStock, refetch } = useOrderNumbers(productId, totalColis);
  const [newOrderNumber, setNewOrderNumber] = useState('');
  const [convertOrderNumber, setConvertOrderNumber] = useState('');
  const [adding, setAdding] = useState(false);
  const [converting, setConverting] = useState(false);
  const [removingGeneric, setRemovingGeneric] = useState(false);
  const [showConvertInput, setShowConvertInput] = useState(false);
  const [addAsComplete, setAddAsComplete] = useState<'complete' | 'empty'>('complete');
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [deleteConfirmOrder, setDeleteConfirmOrder] = useState<OrderNumberEntry | null>(null);
  const [removeGenericConfirm, setRemoveGenericConfirm] = useState(false);
  const [updatingColis, setUpdatingColis] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!newOrderNumber.trim()) return;
    
    setAdding(true);
    const isComplete = addAsComplete === 'complete';
    const result = await addOrderNumber(newOrderNumber.trim(), location, palletNumber, isComplete);
    setAdding(false);
    
    if (result) {
      setNewOrderNumber('');
      onOrderAdded();
    }
  };

  const handleConvert = async () => {
    if (!convertOrderNumber.trim()) {
      toast.error('Introduza um número de encomenda');
      return;
    }
    if (untrackedStock <= 0) {
      toast.error('Não há stock genérico para converter');
      return;
    }
    
    setConverting(true);
    const result = await convertStockToOrder(convertOrderNumber.trim(), location, palletNumber);
    setConverting(false);
    
    if (result) {
      setConvertOrderNumber('');
      setShowConvertInput(false);
      onOrderAdded();
    }
  };

  const handleRemoveGeneric = async () => {
    setRemovingGeneric(true);
    const success = await removeGenericStock(1);
    setRemovingGeneric(false);
    setRemoveGenericConfirm(false);
    
    if (success) {
      onOrderAdded();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleConvertKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConvert();
    }
  };

  const toggleOrderExpanded = (orderId: string) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const handleColisToggle = async (orderId: string, colisNumber: number, currentValue: boolean) => {
    setUpdatingColis(`${orderId}-${colisNumber}`);
    await updateColisStatus(orderId, colisNumber, !currentValue);
    setUpdatingColis(null);
    await refetch();
    onOrderAdded(); // Refresh parent to show updated stock
  };

  const handleLocationChange = async (orderId: string, newLocation: string) => {
    await updateOrderLocation(orderId, newLocation, null);
    await refetch();
  };

  const handlePalletChange = async (orderId: string, newPallet: string) => {
    await updateOrderLocation(orderId, null, newPallet);
    await refetch();
  };

  const handleDeleteOrder = async (order: OrderNumberEntry) => {
    const success = await deleteOrderNumber(order.id);
    if (success) {
      onOrderDeleted?.();
    }
    setDeleteConfirmOrder(null);
  };

  const getColisName = (colisNumber: number): string => {
    if (colisNames && colisNames[colisNumber.toString()]) {
      return colisNames[colisNumber.toString()];
    }
    return `Cóli ${colisNumber}`;
  };

  const completeOrders = orderNumbers.filter(o => o.is_complete);
  const incompleteOrders = orderNumbers.filter(o => !o.is_complete);

  // Calculate tracked vs untracked stock
  const trackedStock = completeOrders.length; // Complete orders = tracked units
  const untrackedStock = Math.max(0, currentStock - trackedStock); // Generic stock without order numbers

  return (
    <>
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-blue-600" />
            Gestão de Stock por Encomenda
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {productCode} - {productName}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Stock Summary */}
          <div className="p-3 rounded-lg border bg-background space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Stock Total:</span>
              <Badge variant="secondary" className="text-base font-bold">
                {currentStock} un.
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                Com nº encomenda:
              </span>
              <span className="font-medium text-green-700">{trackedStock}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1">
                <Package className="h-3.5 w-3.5 text-gray-500" />
                Stock genérico:
              </span>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-600">{untrackedStock}</span>
                {untrackedStock > 0 && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs"
                      onClick={() => setShowConvertInput(!showConvertInput)}
                      title="Atribuir nº encomenda a stock existente"
                    >
                      <ArrowRightLeft className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => setRemoveGenericConfirm(true)}
                      title="Remover 1 unidade de stock genérico"
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
            
            {/* Convert stock input */}
            {showConvertInput && untrackedStock > 0 && (
              <div className="mt-2 p-2 rounded border border-amber-200 bg-amber-50/50 space-y-2">
                <Label className="text-xs text-amber-800">
                  Converter 1 unidade de stock genérico em encomenda rastreada:
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={convertOrderNumber}
                    onChange={(e) => setConvertOrderNumber(e.target.value)}
                    onKeyDown={handleConvertKeyDown}
                    placeholder="Nº encomenda..."
                    disabled={converting}
                    className="h-8 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleConvert}
                    disabled={converting || !convertOrderNumber.trim()}
                    className="h-8"
                  >
                    <ArrowRightLeft className="h-3 w-3 mr-1" />
                    Converter
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Isto NÃO altera a quantidade total - apenas associa um nº encomenda a stock já existente.
                </p>
              </div>
            )}
            
            {incompleteOrders.length > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5 text-yellow-600" />
                  Encomendas incompletas:
                </span>
                <span className="font-medium text-yellow-700">{incompleteOrders.length}</span>
              </div>
            )}
          </div>

          {/* Add new order number */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Registar Nova Encomenda:</Label>
            <div className="flex gap-2">
              <Input
                value={newOrderNumber}
                onChange={(e) => setNewOrderNumber(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Número de encomenda..."
                disabled={adding}
              />
              <Button
                type="button"
                size="sm"
                onClick={handleAdd}
                disabled={adding || !newOrderNumber.trim()}
              >
                <Plus className="h-3 w-3 mr-1" />
                Adicionar
              </Button>
            </div>
            
            {/* Option to add as complete or empty */}
            <RadioGroup 
              value={addAsComplete} 
              onValueChange={(v) => setAddAsComplete(v as 'complete' | 'empty')}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="complete" id="add-complete" />
                <Label htmlFor="add-complete" className="text-xs font-normal cursor-pointer">
                  Todos colis presentes
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="empty" id="add-empty" />
                <Label htmlFor="add-empty" className="text-xs font-normal cursor-pointer text-muted-foreground">
                  Marcar colis depois
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Existing orders with expandable colis view */}
          {!loading && orderNumbers.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Encomendas registadas ({orderNumbers.length}):
              </Label>
              
              {/* Complete orders */}
              {completeOrders.length > 0 && (
                <div className="space-y-1">
                  {completeOrders.map(order => (
                    <OrderRow 
                      key={order.id}
                      order={order}
                      totalColis={totalColis}
                      colisNames={colisNames}
                      isExpanded={expandedOrders.has(order.id)}
                      onToggleExpand={() => toggleOrderExpanded(order.id)}
                      onColisToggle={handleColisToggle}
                      onLocationChange={handleLocationChange}
                      onPalletChange={handlePalletChange}
                      onDelete={() => setDeleteConfirmOrder(order)}
                      updatingColis={updatingColis}
                      getColisName={getColisName}
                    />
                  ))}
                </div>
              )}
              
              {/* Incomplete orders */}
              {incompleteOrders.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs text-yellow-700 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Incompletas ({incompleteOrders.length}):
                  </Label>
                  {incompleteOrders.map(order => (
                    <OrderRow 
                      key={order.id}
                      order={order}
                      totalColis={totalColis}
                      colisNames={colisNames}
                      isExpanded={expandedOrders.has(order.id)}
                      onToggleExpand={() => toggleOrderExpanded(order.id)}
                      onColisToggle={handleColisToggle}
                      onLocationChange={handleLocationChange}
                      onPalletChange={handlePalletChange}
                      onDelete={() => setDeleteConfirmOrder(order)}
                      updatingColis={updatingColis}
                      getColisName={getColisName}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {loading && (
            <div className="text-sm text-muted-foreground text-center py-2">
              Carregando...
            </div>
          )}

          {!loading && orderNumbers.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-2">
              Nenhuma encomenda registada
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirmOrder} onOpenChange={() => setDeleteConfirmOrder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover encomenda?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que deseja remover a encomenda <strong>{deleteConfirmOrder?.order_number}</strong>?
              <br />
              Esta acção irá remover o registo de stock associado a esta encomenda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmOrder && handleDeleteOrder(deleteConfirmOrder)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove generic stock confirmation dialog */}
      <AlertDialog open={removeGenericConfirm} onOpenChange={setRemoveGenericConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover stock genérico?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que deseja remover <strong>1 unidade</strong> de stock genérico (sem nº encomenda)?
              <br /><br />
              Esta acção reduz o stock total em 1 unidade. Use quando precisa corrigir contagens erradas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveGeneric}
              disabled={removingGeneric}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removingGeneric ? 'A remover...' : 'Remover 1 unidade'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Separate component for order row with expandable colis
interface OrderRowProps {
  order: OrderNumberEntry;
  totalColis: number;
  colisNames?: Record<string, string> | null;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onColisToggle: (orderId: string, colisNumber: number, currentValue: boolean) => void;
  onLocationChange: (orderId: string, newLocation: string) => void;
  onPalletChange: (orderId: string, newPallet: string) => void;
  onDelete: () => void;
  updatingColis: string | null;
  getColisName: (colisNumber: number) => string;
}

function OrderRow({
  order,
  totalColis,
  isExpanded,
  onToggleExpand,
  onColisToggle,
  onLocationChange,
  onPalletChange,
  onDelete,
  updatingColis,
  getColisName,
}: OrderRowProps) {
  const presentCount = Object.values(order.colis_status).filter(Boolean).length;
  
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggleExpand}>
      <div className={cn(
        "rounded-lg border transition-colors",
        order.is_complete 
          ? "bg-green-50 border-green-200" 
          : "bg-yellow-50 border-yellow-200"
      )}>
        {/* Order header */}
        <div className="flex items-center justify-between p-2">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 flex-1 text-left hover:bg-muted/30 rounded p-1 -m-1 transition-colors">
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
              <span className="font-mono text-sm font-medium">{order.order_number}</span>
              {order.is_complete ? (
                <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-300 gap-0.5">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  Completa
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-700 border-yellow-300">
                  {presentCount}/{totalColis} colis
                </Badge>
              )}
            </button>
          </CollapsibleTrigger>
          
          <div className="flex items-center gap-1">
            {order.location && (
              <Badge variant="outline" className="text-xs gap-0.5">
                <MapPin className="h-2.5 w-2.5" />
                {order.location}
              </Badge>
            )}
            {order.pallet_number && (
              <Badge variant="outline" className="text-xs gap-0.5">
                <Package className="h-2.5 w-2.5" />
                {order.pallet_number}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Expandable colis list */}
        <CollapsibleContent>
          <div className="border-t border-dashed px-3 py-2 space-y-3">
            {/* Editable location and pallet fields */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Localização
                </Label>
                <LocationSelect
                  value={order.location || ''}
                  onValueChange={(value) => onLocationChange(order.id, value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  Palete
                </Label>
                <PalletSelect
                  value={order.pallet_number || ''}
                  onValueChange={(value) => onPalletChange(order.id, value)}
                />
              </div>
            </div>
            
            {/* Colis checklist */}
            <div className="space-y-1.5">
              {Array.from({ length: totalColis }, (_, i) => {
                const colisNum = i + 1;
                const isPresent = order.colis_status[colisNum.toString()] ?? false;
                const isUpdating = updatingColis === `${order.id}-${colisNum}`;
                const colisName = getColisName(colisNum);
                
                return (
                  <div 
                    key={colisNum}
                    className={cn(
                      "flex items-center gap-2 p-1.5 rounded",
                      isPresent ? "bg-green-100/50" : "bg-red-100/50"
                    )}
                  >
                    <Checkbox
                      id={`coli-${order.id}-${colisNum}`}
                      checked={isPresent}
                      disabled={isUpdating}
                      onCheckedChange={() => onColisToggle(order.id, colisNum, isPresent)}
                      className={cn(
                        isPresent 
                          ? "border-green-600 data-[state=checked]:bg-green-600" 
                          : "border-red-400"
                      )}
                    />
                    <label 
                      htmlFor={`coli-${order.id}-${colisNum}`}
                      className={cn(
                        "flex-1 text-sm cursor-pointer select-none",
                        isPresent ? "text-green-800" : "text-red-800"
                      )}
                    >
                      {colisName}
                    </label>
                    {isPresent ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-red-500" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

