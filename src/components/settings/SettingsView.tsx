import { useState } from 'react';
import { Settings, Users, UserPlus, Loader2, Trash2, Mail, User, Database, AlertTriangle, KeyRound } from 'lucide-react';
// StockDataRepairDialog removed: underlying RPCs dropped in stock refactor Phase 1.
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
import { ChangeUserPasswordDialog } from './ChangeUserPasswordDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


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
  const [newUserRole, setNewUserRole] = useState('operator');
  const [isCreating, setIsCreating] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<{ userId: string; name: string } | null>(null);

  const { toast } = useToast();
  const { profile: currentProfile } = useAuth();
  const queryClient = useQueryClient();
  const isMaster = currentProfile?.role === 'master';

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
      const { data, error } = await supabase.functions.invoke('admin-manage-users', {
        body: {
          action: 'create',
          email: newUserEmail,
          password: newUserPassword,
          name: newUserName,
          role: newUserRole,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: 'Utilizador criado',
        description: `${newUserName} foi adicionado com sucesso`
      });

      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserName('');
      setNewUserRole('operator');

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

  const updateRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { data, error } = await supabase.rpc('set_user_role', { p_user_id: userId, p_role: role });
      if (error) throw error;
      if (data && (data as any).ok !== true) throw new Error((data as any)?.error || 'Erro ao atualizar função');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      toast({ title: 'Função atualizada' });
    },
    onError: (error: any) =>
      toast({ title: 'Erro ao atualizar função', description: error.message, variant: 'destructive' }),
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke('admin-manage-users', {
        body: { action: 'delete', user_id: userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      toast({ title: 'Utilizador eliminado' });
    },
    onError: (error: any) =>
      toast({ title: 'Erro ao eliminar utilizador', description: error.message, variant: 'destructive' }),
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'master':
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Master</Badge>;
      case 'admin':
        return <Badge className="bg-primary/10 text-primary border-primary/20">Admin</Badge>;
      case 'financeiro':
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Financeiro</Badge>;
      case 'entregador':
        return <Badge className="bg-info-soft text-info border-info/20">Entregador</Badge>;
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
              {isMaster
                ? 'Crie uma nova conta de utilizador para acesso ao sistema'
                : 'Apenas o Master pode adicionar utilizadores'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <fieldset disabled={!isMaster} className={isMaster ? '' : 'opacity-50 pointer-events-none'}>
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

              <div className="space-y-2">
                <Label htmlFor="new-role">Função</Label>
                <Select value={newUserRole} onValueChange={setNewUserRole}>
                  <SelectTrigger id="new-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operator">Operador</SelectItem>
                    <SelectItem value="entregador">Entregador</SelectItem>
                    <SelectItem value="financeiro">Financeiro</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" className="w-full" disabled={isCreating || !isMaster}>
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
            </fieldset>
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
                    {isMaster && (
                      <TableHead className="text-right">Ações</TableHead>
                    )}
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
                      <TableCell>
                        {currentProfile?.role === 'admin' &&
                        profile.user_id !== currentProfile?.user_id ? (
                          <Select
                            value={profile.role}
                            onValueChange={(role) =>
                              updateRole.mutate({ userId: profile.user_id, role })
                            }
                          >
                            <SelectTrigger className="h-8 w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="operator">Operador</SelectItem>
                              <SelectItem value="entregador">Entregador</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          getRoleBadge(profile.role)
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {new Date(profile.created_at).toLocaleDateString('pt-PT')}
                      </TableCell>
                      {currentProfile?.role === 'admin' && (
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPasswordTarget({ userId: profile.user_id, name: profile.name })}
                          >
                            <KeyRound className="h-4 w-4 mr-1" />
                            Alterar senha
                          </Button>
                        </TableCell>
                      )}
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

      <ChangeUserPasswordDialog
        open={!!passwordTarget}
        onOpenChange={(open) => { if (!open) setPasswordTarget(null); }}
        userId={passwordTarget?.userId ?? null}
        userName={passwordTarget?.name ?? null}
      />
    </div>
  );
}
