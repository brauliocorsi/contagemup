import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Map } from 'lucide-react';
import { AislesConfig } from './AislesConfig';
import { LevelsConfig } from './LevelsConfig';
import { LocationsConfig } from './LocationsConfig';
import { PalletsConfig } from './PalletsConfig';

export function WarehouseMapView() {
  const [activeTab, setActiveTab] = useState('config');

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="config" className="gap-2">
            <Settings className="h-4 w-4" />
            Configurar
          </TabsTrigger>
          <TabsTrigger value="map" className="gap-2">
            <Map className="h-4 w-4" />
            Mapa Visual
          </TabsTrigger>
        </TabsList>

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

        <TabsContent value="map" className="mt-4">
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
            <Map className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">Mapa Visual Interativo</p>
            <p className="text-sm">Configure ruas, níveis e localizações primeiro para visualizar o mapa do armazém.</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
