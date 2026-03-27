import { useState } from 'react';
import { Settings, Users, UserPlus, Loader2, Trash2, Mail, User, Database, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ProfileSettings } from './ProfileSettings';
import { Separator } from '@/components/ui/separator';
import { ResetStockDialog } from './ResetStockDialog';
import { StockDataRepairDialog } from './StockDataRepairDialog';

interface Profile {
  id: string;
  user_id: string;
  name: string;
  role: string;
  created_at: string;
  avatar_url?: string | null;
}

export function SettingsView() {
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [repairDialogOpen, setRepairDialogOpen] = useState(false);
  const { toast } = useToast();
  const { profile: currentProfile } = useAuth();
  const queryClient = useQueryClient();

  // Fetch all users/profiles
  const { data: profiles = [], isLoading: isLoadingProfiles } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Profile[];
    }
  });

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newUserEmail || !newUserPassword || !newUserName) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos',
        variant: 'destructive'
      });
      return;
    }

    if (newUserPassword.length < 6) {
      toast({
        title: 'Erro',
        description: 'A senha deve ter pelo menos 6 caracteres',
        variant: 'destructive'
      });
      return;
    }

    setIsCreating(true);

    try {
      const { error } = await supabase.auth.signUp({
        email: newUserEmail,
        password: newUserPassword,
        options: {
          data: { name: newUserName }
        }
      });

      if (error) throw error;

      toast({
        title: 'Utilizador criado',
        description: `${newUserName} foi adicionado com sucesso`
      });

      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserName('');
      
      // Refresh profiles list
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
    } catch (error: any) {
      toast({
        title: 'Erro ao criar utilizador',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setIsCreating(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <Badge className="bg-primary/10 text-primary border-primary/20">Admin</Badge>;
      case 'supervisor':
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Supervisor</Badge>;
      default:
        return <Badge variant="outline">Operador</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Configurações</h1>
          <p className="text-muted-foreground text-sm">
            Gestão de utilizadores e preferências do sistema
          </p>
        </div>
      </div>

      {/* Profile Settings (Photo & Password) */}
      <ProfileSettings />

      <Separator className="my-2" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Add User Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserPlus className="h-5 w-5" />
              Adicionar Utilizador
            </CardTitle>
            <CardDescription>
              Crie uma nova conta de utilizador para acesso ao sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="Nome do utilizador"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@exemplo.com"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={isCreating}>
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    A criar...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Criar Utilizador
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Users List */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" />
              Utilizadores Registados
            </CardTitle>
            <CardDescription>
              Lista de todos os utilizadores com acesso ao sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingProfiles ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : profiles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>Nenhum utilizador registado</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead className="text-right">Data de Registo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={profile.avatar_url || undefined} alt={profile.name} />
                            <AvatarFallback className="text-sm bg-primary/10 text-primary">
                              {profile.name?.charAt(0).toUpperCase() || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <span>{profile.name}</span>
                            {profile.user_id === currentProfile?.user_id && (
                              <Badge variant="outline" className="ml-2 text-xs">Você</Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{getRoleBadge(profile.role)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {new Date(profile.created_at).toLocaleDateString('pt-PT')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Data Management Section */}
      <Separator className="my-2" />
      
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-destructive">
            <Database className="h-5 w-5" />
            Gestão de Dados
          </CardTitle>
          <CardDescription>
            Operações de manutenção e reset do sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Database className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <h4 className="font-medium">Corrigir Dados Históricos</h4>
                  <p className="text-sm text-muted-foreground">
                    Remove movimentos falsos do bug pré-v1.2.0 e recalcula o stock
                  </p>
                </div>
              </div>
              <Button 
                variant="outline"
                onClick={() => setRepairDialogOpen(true)}
              >
                <Database className="h-4 w-4 mr-2" />
                Corrigir
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/20 bg-destructive/5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h4 className="font-medium">Reset de Stock</h4>
                  <p className="text-sm text-muted-foreground">
                    Zera todo o stock e histórico, mantendo produtos e localizações
                  </p>
                </div>
              </div>
              <Button 
                variant="destructive" 
                onClick={() => setResetDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ResetStockDialog 
        open={resetDialogOpen} 
        onOpenChange={setResetDialogOpen} 
      />
    </div>
  );
}
