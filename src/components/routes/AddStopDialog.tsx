import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRoutes, ERPClient } from '@/hooks/useRoutes';
import { Loader2, Search, UserPlus } from 'lucide-react';

interface AddStopDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    client_name: string;
    address?: string;
    postal_code?: string;
    city?: string;
    venda_id?: string;
    venda_codigo?: string;
  }) => void;
}

export function AddStopDialog({ open, onOpenChange, onSubmit }: AddStopDialogProps) {
  const [tab, setTab] = useState('erp');
  const [searchTerm, setSearchTerm] = useState('');
  const { clients, clientsLoading, refetchClients } = useRoutes();
  const [fetched, setFetched] = useState(false);

  // Manual form state
  const [manualName, setManualName] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [manualPostalCode, setManualPostalCode] = useState('');
  const [manualCity, setManualCity] = useState('');

  const handleFetchClients = () => {
    refetchClients();
    setFetched(true);
  };

  const filteredClients = clients.filter(c => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return c.nome.toLowerCase().includes(term) ||
           c.cep.toLowerCase().includes(term) ||
           c.cidade.toLowerCase().includes(term);
  });

  const handleSelectClient = (client: ERPClient) => {
    const address = [client.endereco, client.numero, client.complemento, client.bairro]
      .filter(Boolean)
      .join(', ');

    onSubmit({
      client_name: client.nome,
      address: address || undefined,
      postal_code: client.cep || undefined,
      city: client.cidade || undefined,
    });
  };

  const handleManualSubmit = () => {
    if (!manualName.trim()) return;
    onSubmit({
      client_name: manualName.trim(),
      address: manualAddress.trim() || undefined,
      postal_code: manualPostalCode.trim() || undefined,
      city: manualCity.trim() || undefined,
    });
    setManualName('');
    setManualAddress('');
    setManualPostalCode('');
    setManualCity('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Adicionar Paragem</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="erp">
              <Search className="h-4 w-4 mr-1" />
              Clientes ERP
            </TabsTrigger>
            <TabsTrigger value="manual">
              <UserPlus className="h-4 w-4 mr-1" />
              Manual
            </TabsTrigger>
          </TabsList>

          <TabsContent value="erp" className="flex-1 overflow-hidden flex flex-col space-y-3">
            {!fetched ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <p className="text-sm text-muted-foreground">Carregue os clientes do ERP para pesquisar</p>
                <Button onClick={handleFetchClients} disabled={clientsLoading}>
                  {clientsLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Carregar Clientes
                </Button>
              </div>
            ) : (
              <>
                <Input
                  placeholder="Pesquisar por nome, código postal ou cidade..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {clientsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="overflow-y-auto flex-1 space-y-1 max-h-[350px]">
                    {filteredClients.length === 0 ? (
                      <p className="text-center text-muted-foreground py-4">Nenhum cliente encontrado</p>
                    ) : (
                      filteredClients.map((client) => (
                        <div
                          key={client.id}
                          className="p-3 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors"
                          onClick={() => handleSelectClient(client)}
                        >
                          <p className="font-medium text-sm">{client.nome}</p>
                          <div className="flex gap-2 text-xs text-muted-foreground mt-1">
                            {client.cep && <span>📮 {client.cep}</span>}
                            {client.cidade && <span>🏙️ {client.cidade}</span>}
                            {client.endereco && <span>📍 {client.endereco}</span>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="manual" className="space-y-4">
            <div>
              <Label>Nome do Cliente *</Label>
              <Input
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Nome do cliente"
              />
            </div>
            <div>
              <Label>Morada</Label>
              <Input
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                placeholder="Rua, número..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Código Postal</Label>
                <Input
                  value={manualPostalCode}
                  onChange={(e) => setManualPostalCode(e.target.value)}
                  placeholder="Ex: 1000-001"
                />
              </div>
              <div>
                <Label>Cidade</Label>
                <Input
                  value={manualCity}
                  onChange={(e) => setManualCity(e.target.value)}
                  placeholder="Ex: Lisboa"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleManualSubmit} disabled={!manualName.trim()}>
                Adicionar Paragem
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
