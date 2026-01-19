import { useSessions } from '@/hooks/useSessions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { History, CheckCircle2, XCircle, Clock, Tags, Trash2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

export function SessionsView() {
  const { sessions, loading, completeSession, cancelSession, deleteSession } = useSessions();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800"><Clock className="h-3 w-3 mr-1" /> Ativa</Badge>;
      case 'completed':
        return <Badge className="bg-blue-100 text-blue-800"><CheckCircle2 className="h-3 w-3 mr-1" /> Completada</Badge>;
      case 'cancelled':
        return <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" /> Cancelada</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Histórico de Sessões</h2>
        <p className="text-sm text-muted-foreground">
          {sessions.length} sessões registadas
        </p>
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">Nenhuma sessão registada</h3>
            <p className="text-muted-foreground text-sm">
              Crie uma nova sessão na aba "Contagem"
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions.map(session => (
            <Card key={session.id}>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-medium">{session.name}</h3>
                      {getStatusBadge(session.status)}
                      {session.category && session.category !== 'Todas' && (
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Tags className="h-3 w-3" />
                          {session.category}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Criada em {format(new Date(session.created_at), "d 'de' MMMM 'às' HH:mm", { locale: pt })}
                    </p>
                    {session.completed_at && (
                      <p className="text-sm text-muted-foreground">
                        Completada em {format(new Date(session.completed_at), "d 'de' MMMM 'às' HH:mm", { locale: pt })}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    {session.status === 'active' && (
                      <>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Completar
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Completar sessão?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Ao completar a sessão, ela será marcada como terminada e não poderá ser editada.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => completeSession(session.id)}>
                                Completar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive">
                              <XCircle className="h-4 w-4 mr-1" />
                              Cancelar
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Cancelar sessão?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Ao cancelar a sessão, ela será marcada como inválida.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Voltar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => cancelSession(session.id)} className="bg-destructive text-destructive-foreground">
                                Cancelar sessão
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}

                    {(session.status === 'completed' || session.status === 'cancelled') && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-destructive">
                            <Trash2 className="h-4 w-4 mr-1" />
                            Eliminar
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-destructive">
                              Eliminar sessão definitivamente?
                            </AlertDialogTitle>
                            <AlertDialogDescription className="space-y-2">
                              <p>
                                <strong>ATENÇÃO:</strong> Esta ação é <strong>IRREVERSÍVEL</strong>.
                              </p>
                              <p>
                                Serão eliminados permanentemente:
                              </p>
                              <ul className="list-disc list-inside text-sm space-y-1">
                                <li>Todos os dados de contagem desta sessão</li>
                                <li>Todos os logs de operações (+1/-1)</li>
                                <li>Todas as conciliações associadas</li>
                                <li>Todos os itens das conciliações</li>
                              </ul>
                              <p className="font-medium pt-2">
                                Tem a certeza que deseja continuar?
                              </p>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => deleteSession(session.id)} 
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Sim, eliminar definitivamente
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
