import { useState, useMemo } from 'react';
import { 
  MapPin, 
  CheckSquare, 
  Square, 
  ClipboardCheck,
  Play,
  X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useWarehouseMap } from '@/hooks/useWarehouseMap';
import { useActiveSession } from '@/hooks/useActiveSession';
import { useLocationAudits } from '@/hooks/useLocationAudits';
import { CreateAuditDialog } from '@/components/audit/CreateAuditDialog';
import { AuditReportsView } from '@/components/reports/AuditReportsView';
import { cn } from '@/lib/utils';

interface LocationAuditViewProps {
  onStartAudit?: (auditId: string) => void;
}

export function LocationAuditView({ onStartAudit }: LocationAuditViewProps) {
  const { activeSession } = useActiveSession();
  const { aisles, locations, isLoading } = useWarehouseMap(activeSession?.id);
  const { audits } = useLocationAudits();
  
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [showSelector, setShowSelector] = useState(false);

  // Group locations by aisle
  const locationsByAisle = useMemo(() => {
    const groups: Record<string, { aisle: typeof aisles[0]; locations: typeof locations }> = {};
    
    aisles.forEach(aisle => {
      const aisleLocations = locations.filter(l => l.aisle_id === aisle.id && l.totalColis > 0);
      if (aisleLocations.length > 0) {
        groups[aisle.id] = { aisle, locations: aisleLocations };
      }
    });

    return groups;
  }, [aisles, locations]);

  // Locations with products (for selection)
  const selectableLocations = useMemo(() => {
    return locations.filter(l => l.totalColis > 0);
  }, [locations]);

  const toggleLocation = (code: string) => {
    setSelectedLocations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(code)) {
        newSet.delete(code);
      } else {
        newSet.add(code);
      }
      return newSet;
    });
  };

  const toggleAisle = (aisleId: string) => {
    const aisleData = locationsByAisle[aisleId];
    if (!aisleData) return;

    const aisleCodes = aisleData.locations.map(l => l.code);
    const allSelected = aisleCodes.every(code => selectedLocations.has(code));

    setSelectedLocations(prev => {
      const newSet = new Set(prev);
      if (allSelected) {
        aisleCodes.forEach(code => newSet.delete(code));
      } else {
        aisleCodes.forEach(code => newSet.add(code));
      }
      return newSet;
    });
  };

  const selectAll = () => {
    setSelectedLocations(new Set(selectableLocations.map(l => l.code)));
  };

  const clearSelection = () => {
    setSelectedLocations(new Set());
  };

  const handleCreateAudit = () => {
    if (selectedLocations.size === 0) return;
    setCreateDialogOpen(true);
  };

  const handleAuditCreated = (auditId: string) => {
    clearSelection();
    setShowSelector(false);
    if (onStartAudit) {
      onStartAudit(auditId);
    }
  };

  // Check if any audits are in progress
  const activeAudit = useMemo(() => {
    return audits.find(a => a.status === 'in_progress');
  }, [audits]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Conferência de Localizações
          </h3>
          <p className="text-sm text-muted-foreground">
            Seleccione localizações para criar uma conferência de stock
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeAudit && onStartAudit && (
            <Button onClick={() => onStartAudit(activeAudit.id)}>
              <Play className="h-4 w-4 mr-2" />
              Continuar "{activeAudit.name}"
            </Button>
          )}
          {!showSelector ? (
            <Button variant="outline" onClick={() => setShowSelector(true)}>
              <MapPin className="h-4 w-4 mr-2" />
              Nova Conferência
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => { setShowSelector(false); clearSelection(); }}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
          )}
        </div>
      </div>

      {/* Location Selector */}
      {showSelector && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Seleccionar Localizações</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll}>
                  <CheckSquare className="h-4 w-4 mr-1" />
                  Todas
                </Button>
                <Button variant="ghost" size="sm" onClick={clearSelection}>
                  <Square className="h-4 w-4 mr-1" />
                  Limpar
                </Button>
                <Badge variant="secondary">
                  {selectedLocations.size} seleccionadas
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-4">
                {Object.entries(locationsByAisle).map(([aisleId, data]) => {
                  const aisleCodes = data.locations.map(l => l.code);
                  const selectedCount = aisleCodes.filter(c => selectedLocations.has(c)).length;
                  const allSelected = selectedCount === aisleCodes.length;
                  const someSelected = selectedCount > 0 && selectedCount < aisleCodes.length;

                  return (
                    <div key={aisleId} className="space-y-2">
                      <div 
                        className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-2 rounded-md"
                        onClick={() => toggleAisle(aisleId)}
                      >
                        <Checkbox
                          checked={allSelected}
                          className={cn(someSelected && "data-[state=checked]:bg-primary/50")}
                        />
                        <span 
                          className="font-medium flex items-center gap-2"
                          style={{ color: data.aisle.color || undefined }}
                        >
                          {data.aisle.name}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {selectedCount}/{aisleCodes.length}
                        </Badge>
                      </div>
                      <div className="ml-6 flex flex-wrap gap-2">
                        {data.locations.map(location => {
                          const isSelected = selectedLocations.has(location.code);
                          return (
                            <Button
                              key={location.id}
                              variant={isSelected ? "default" : "outline"}
                              size="sm"
                              className={cn(
                                "h-8 px-3",
                                isSelected && "bg-primary text-primary-foreground"
                              )}
                              onClick={() => toggleLocation(location.code)}
                            >
                              <MapPin className="h-3 w-3 mr-1" />
                              {location.code}
                              <Badge 
                                variant="secondary" 
                                className={cn(
                                  "ml-1 text-[10px] h-4",
                                  isSelected && "bg-primary-foreground/20 text-primary-foreground"
                                )}
                              >
                                {location.totalColis}
                              </Badge>
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {Object.keys(locationsByAisle).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Nenhuma localização com stock encontrada.</p>
                    <p className="text-sm">Adicione produtos às localizações primeiro.</p>
                  </div>
                )}
              </div>
            </ScrollArea>

            {selectedLocations.size > 0 && (
              <div className="mt-4 pt-4 border-t flex justify-end">
                <Button onClick={handleCreateAudit}>
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                  Criar Conferência ({selectedLocations.size} localizações)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Audit History */}
      <AuditReportsView onStartAudit={onStartAudit} />

      {/* Create Audit Dialog */}
      <CreateAuditDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        selectedLocations={Array.from(selectedLocations)}
        onSuccess={handleAuditCreated}
      />
    </div>
  );
}
