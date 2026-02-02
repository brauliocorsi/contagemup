import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Map, ClipboardCheck } from 'lucide-react';
import { AislesConfig } from './AislesConfig';
import { LevelsConfig } from './LevelsConfig';
import { LocationsConfig } from './LocationsConfig';
import { PalletsConfig } from './PalletsConfig';
import { InteractiveWarehouseMap } from './InteractiveWarehouseMap';
import { LocationAuditView } from './LocationAuditView';

interface WarehouseMapViewProps {
  onStartAudit?: (auditId: string) => void;
}

export function WarehouseMapView({ onStartAudit }: WarehouseMapViewProps) {
  const [activeTab, setActiveTab] = useState('map');

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="map" className="gap-2">
            <Map className="h-4 w-4" />
            Mapa Visual
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Conferência
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2">
            <Settings className="h-4 w-4" />
            Configurar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="map" className="mt-4">
          <InteractiveWarehouseMap />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <LocationAuditView onStartAudit={onStartAudit} />
        </TabsContent>

        <TabsContent value="config" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <AislesConfig />
            <LevelsConfig />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <LocationsConfig />
            <PalletsConfig />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
