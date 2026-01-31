import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Package, Plus } from 'lucide-react';

interface Session {
  id: string;
  name: string;
  category: string;
  status: string;
}

interface CountingSessionSelectorProps {
  activeSessions: Session[];
  availableCategories: string[];
  onSessionChange: (sessionId: string) => void;
  onCreateSession: (name: string, categories: string) => Promise<Session | null>;
}

export function CountingSessionSelector({
  activeSessions,
  availableCategories,
  onSessionChange,
  onCreateSession,
}: CountingSessionSelectorProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionCategories, setNewSessionCategories] = useState<string[]>([]);
  const [allCategoriesSelected, setAllCategoriesSelected] = useState(true);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  const handleToggleCategory = (categoryName: string) => {
    setNewSessionCategories(prev => 
      prev.includes(categoryName) 
        ? prev.filter(c => c !== categoryName)
        : [...prev, categoryName]
    );
  };

  const handleToggleAllCategories = (checked: boolean) => {
    setAllCategoriesSelected(checked);
    if (checked) {
      setNewSessionCategories([]);
    }
  };

  const handleCreateSession = async () => {
    if (!newSessionName.trim()) return;
    setIsCreatingSession(true);
    
    const categoryValue = allCategoriesSelected 
      ? 'Todas' 
      : newSessionCategories.join(',');
    
    const session = await onCreateSession(newSessionName, categoryValue);
    if (session) {
      onSessionChange(session.id);
      setNewSessionName('');
      setNewSessionCategories([]);
      setAllCategoriesSelected(true);
      setDialogOpen(false);
    }
    setIsCreatingSession(false);
  };

  return (
    <div className="p-4 space-y-6">
      <div className="text-center py-12">
        <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Selecione ou crie uma sessão de contagem</h2>
        <p className="text-muted-foreground mb-6">
          Cada sessão mantém um registo separado das contagens
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto">
          {activeSessions.length > 0 && (
            <Select onValueChange={onSessionChange}>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue placeholder="Selecionar sessão existente" />
              </SelectTrigger>
              <SelectContent>
                {activeSessions.map(session => (
                  <SelectItem key={session.id} value={session.id}>
                    {session.name} {session.category !== 'Todas' && `(${session.category})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nova sessão
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova Sessão de Contagem</DialogTitle>
                <DialogDescription>
                  Crie uma nova sessão para iniciar a contagem de stock
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nome da sessão</Label>
                  <Input
                    placeholder="Ex: Inventário Janeiro 2026"
                    value={newSessionName}
                    onChange={(e) => setNewSessionName(e.target.value)}
                  />
                </div>
                <div className="space-y-3">
                  <Label>Categorias de produtos</Label>
                  
                  <div className="flex items-center space-x-2 p-3 border rounded-lg bg-muted/50">
                    <Checkbox 
                      id="all-categories"
                      checked={allCategoriesSelected}
                      onCheckedChange={(checked) => handleToggleAllCategories(checked as boolean)}
                    />
                    <label htmlFor="all-categories" className="text-sm font-medium cursor-pointer">
                      Todas as categorias
                    </label>
                  </div>
                  
                  {!allCategoriesSelected && (
                    <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                      {availableCategories.map(cat => (
                        <div key={cat} className="flex items-center space-x-2">
                          <Checkbox 
                            id={`cat-${cat}`}
                            checked={newSessionCategories.includes(cat)}
                            onCheckedChange={() => handleToggleCategory(cat)}
                          />
                          <label htmlFor={`cat-${cat}`} className="text-sm cursor-pointer">
                            {cat}
                          </label>
                        </div>
                      ))}
                      {availableCategories.length === 0 && (
                        <p className="text-sm text-muted-foreground">Nenhuma categoria disponível</p>
                      )}
                    </div>
                  )}
                  
                  {!allCategoriesSelected && newSessionCategories.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {newSessionCategories.map(cat => (
                        <span key={cat} className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}
                  
                  <p className="text-xs text-muted-foreground">
                    {allCategoriesSelected 
                      ? 'Todos os produtos serão mostrados na sessão'
                      : newSessionCategories.length > 0
                        ? `Apenas produtos das categorias selecionadas (${newSessionCategories.length}) serão mostrados`
                        : 'Selecione pelo menos uma categoria'
                    }
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button 
                  onClick={handleCreateSession} 
                  disabled={!newSessionName.trim() || isCreatingSession || (!allCategoriesSelected && newSessionCategories.length === 0)}
                >
                  Criar sessão
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
