import { useState, useMemo, useEffect } from 'react';
import { 
  ArrowLeft, 
  ArrowRight, 
  CheckCircle2, 
  MapPin, 
  Package,
  AlertTriangle,
  Check,
  EyeOff,
  X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocationAudits, LocationAuditItem } from '@/hooks/useLocationAudits';
import { cn } from '@/lib/utils';

interface AuditExecutionViewProps {
  auditId: string;
  onComplete: () => void;
  onBack: () => void;
}

export function AuditExecutionView({ auditId, onComplete, onBack }: AuditExecutionViewProps) {
  const { useAuditWithItems, startAudit, updateAuditItem, completeAudit } = useLocationAudits();
  const { data: audit, isLoading } = useAuditWithItems(auditId);
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [countedQuantities, setCountedQuantities] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const blind = !!audit?.blind_mode;

  // Start audit if pending
  useEffect(() => {
    if (audit && audit.status === 'pending') {
      startAudit.mutate(auditId);
    }
  }, [audit, auditId]);

  // Group items by location for easier navigation
  const groupedItems = useMemo(() => {
    if (!audit?.items) return [];
    
    const groups: { location: string; items: LocationAuditItem[] }[] = [];
    const locationMap = new Map<string, LocationAuditItem[]>();

    audit.items.forEach(item => {
      const existing = locationMap.get(item.location);
      if (existing) {
        existing.push(item);
      } else {
        locationMap.set(item.location, [item]);
      }
    });

    locationMap.forEach((items, location) => {
      groups.push({ location, items });
    });

    return groups;
  }, [audit?.items]);

  // Flatten items for pagination
  const allItems = useMemo(() => {
    return groupedItems.flatMap(g => g.items);
  }, [groupedItems]);

  // Current item
  const currentItem = allItems[currentIndex];

  // Progress stats
  const progressStats = useMemo(() => {
    if (!audit?.items) return { counted: 0, total: 0, percentage: 0 };
    const counted = audit.items.filter(i => i.status === 'counted').length;
    const total = audit.items.length;
    return { 
      counted, 
      total, 
      percentage: total > 0 ? Math.round((counted / total) * 100) : 0 
    };
  }, [audit?.items]);

  // Get current location group
  const currentLocation = useMemo(() => {
    if (!currentItem) return null;
    return groupedItems.find(g => g.location === currentItem.location);
  }, [currentItem, groupedItems]);

  const handleCountChange = (itemId: string, value: string) => {
    setCountedQuantities(prev => ({ ...prev, [itemId]: value }));
  };

  const handleConfirmCount = async (item: LocationAuditItem) => {
    const countedValue = countedQuantities[item.id];
    if (countedValue === undefined || countedValue === '') return;

    const quantity = parseInt(countedValue, 10);
    if (isNaN(quantity) || quantity < 0) return;

    await updateAuditItem.mutateAsync({
      itemId: item.id,
      countedQuantity: quantity,
      notes: notes[item.id],
    });

    // Move to next uncounted item
    const nextUncountedIndex = allItems.findIndex((i, idx) => idx > currentIndex && i.status === 'pending');
    if (nextUncountedIndex !== -1) {
      setCurrentIndex(nextUncountedIndex);
    } else if (currentIndex < allItems.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleComplete = async () => {
    await completeAudit.mutateAsync(auditId);
    onComplete();
  };

  const canComplete = progressStats.counted === progressStats.total && progressStats.total > 0;

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!audit || !currentItem) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">Sem itens para conferir</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Não foram encontrados produtos nas localizações seleccionadas.
            </p>
            <Button onClick={onBack}>Voltar</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          <div>
            <h2 className="text-lg font-semibold">{audit.name}</h2>
            <p className="text-sm text-muted-foreground">
              Progresso: {progressStats.counted}/{progressStats.total} itens
            </p>
          </div>
        </div>
        <Button 
          onClick={handleComplete} 
          disabled={!canComplete || completeAudit.isPending}
          className={cn(!canComplete && "opacity-50")}
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          {completeAudit.isPending ? 'A finalizar...' : 'Finalizar'}
        </Button>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <Progress value={progressStats.percentage} className="h-2" />
        <p className="text-xs text-muted-foreground text-right">{progressStats.percentage}%</p>
      </div>

      {/* Current item card */}
      <Card className="border-2">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="font-mono font-medium">{currentItem.location}</span>
              {blind && (
                <Badge variant="outline" className="gap-1">
                  <EyeOff className="h-3 w-3" /> Cega
                </Badge>
              )}
            </div>
            <Badge variant="outline">
              {currentIndex + 1} / {allItems.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Product info */}
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Package className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="font-mono text-sm text-muted-foreground">{currentItem.product_code}</p>
                <p className="font-medium">{currentItem.product_name}</p>
                {currentItem.colis_number && (
                  <Badge variant="outline" className="mt-1 text-xs">
                    Coli {currentItem.colis_number}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Expected vs Counted */}
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Esperado</p>
              {blind ? (
                <p className="flex items-center justify-center gap-1 pt-2 text-sm font-medium text-muted-foreground">
                  <EyeOff className="h-4 w-4" /> Oculto
                </p>
              ) : (
                <p className="text-3xl font-bold text-blue-600">{currentItem.expected_quantity}</p>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground text-center">Contado</p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  value={currentItem.status === 'counted' 
                    ? currentItem.counted_quantity ?? '' 
                    : countedQuantities[currentItem.id] ?? ''
                  }
                  onChange={(e) => handleCountChange(currentItem.id, e.target.value)}
                  disabled={currentItem.status === 'counted'}
                  className="text-center text-2xl font-bold h-14"
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {/* Difference indicator */}
          {!blind && currentItem.status === 'counted' && currentItem.difference !== null && currentItem.difference !== 0 && (
            <div className={cn(
              "flex items-center justify-center gap-2 p-2 rounded-md",
              currentItem.difference > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
            )}>
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">
                Diferença: {currentItem.difference > 0 ? '+' : ''}{currentItem.difference}
              </span>
            </div>
          )}

          {/* Confirm button */}
          {currentItem.status === 'pending' && (
            <Button
              className="w-full"
              size="lg"
              onClick={() => handleConfirmCount(currentItem)}
              disabled={
                countedQuantities[currentItem.id] === undefined || 
                countedQuantities[currentItem.id] === '' ||
                updateAuditItem.isPending
              }
            >
              <Check className="h-4 w-4 mr-2" />
              {updateAuditItem.isPending ? 'A confirmar...' : 'Confirmar Contagem'}
            </Button>
          )}

          {currentItem.status === 'counted' && (
            <div className="flex items-center justify-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Já conferido</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Anterior
        </Button>
        <Button
          variant="outline"
          onClick={() => setCurrentIndex(Math.min(allItems.length - 1, currentIndex + 1))}
          disabled={currentIndex === allItems.length - 1}
        >
          Próximo
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>

      {/* Quick jump to uncounted */}
      {progressStats.counted < progressStats.total && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const nextUncounted = allItems.findIndex(i => i.status === 'pending');
              if (nextUncounted !== -1) setCurrentIndex(nextUncounted);
            }}
          >
            Ir para próximo por conferir
          </Button>
        </div>
      )}
    </div>
  );
}
