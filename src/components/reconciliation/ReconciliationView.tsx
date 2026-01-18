import { useState, useMemo, useRef } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { useSessions } from '@/hooks/useSessions';
import { useCounting } from '@/hooks/useCounting';
import { useReconciliation } from '@/hooks/useReconciliation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, 
  ArrowUpDown, Search, Eye, CheckCheck, X, Scale, FileQuestion, Download
} from 'lucide-react';
import { CSVImportRow, ReconciliationItem, CSVValidationError } from '@/types/reconciliation';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

export function ReconciliationView() {
  const { products, loading: productsLoading } = useProducts();
  const { sessions, loading: sessionsLoading } = useSessions();
  const { 
    reconciliations, 
    loading: reconciliationsLoading, 
    createReconciliation, 
    getReconciliationItems,
    validateReconciliation,
    cancelReconciliation,
    parseCSV 
  } = useReconciliation();

  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [reconciliationName, setReconciliationName] = useState('');
  const [csvData, setCsvData] = useState<CSVImportRow[]>([]);
  const [csvErrors, setCsvErrors] = useState<CSVValidationError[]>([]);
  const [csvHeaderError, setCsvHeaderError] = useState<string | null>(null);
  const [csvFileName, setCsvFileName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // View reconciliation details
  const [viewingReconciliation, setViewingReconciliation] = useState<string | null>(null);
  const [reconciliationItems, setReconciliationItems] = useState<ReconciliationItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Validation dialog
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [validationNotes, setValidationNotes] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { getProductWithCounts, loading: countingLoading } = useCounting(selectedSessionId || null);

  const activeSessions = sessions.filter(s => s.status === 'active' || s.status === 'completed');

  const productsWithCounts = useMemo(() => {
    if (!selectedSessionId) return [];
    return products.map(p => getProductWithCounts(p));
  }, [products, selectedSessionId, getProductWithCounts]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const result = parseCSV(content);
      setCsvData(result.rows);
      setCsvErrors(result.errors);
      setCsvHeaderError(result.headerError);
    };
    reader.readAsText(file);
  };

  const handleCreateReconciliation = async () => {
    if (!selectedSessionId || !reconciliationName.trim() || csvData.length === 0 || csvErrors.length > 0) return;

    setIsCreating(true);
    await createReconciliation(selectedSessionId, reconciliationName, csvData, productsWithCounts);
    setIsCreating(false);
    
    // Reset form
    setCsvData([]);
    setCsvErrors([]);
    setCsvHeaderError(null);
    setCsvFileName('');
    setReconciliationName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleViewReconciliation = async (reconciliationId: string) => {
    setViewingReconciliation(reconciliationId);
    setLoadingItems(true);
    const items = await getReconciliationItems(reconciliationId);
    setReconciliationItems(items);
    setLoadingItems(false);
  };

  const handleValidate = async () => {
    if (!validatingId) return;
    await validateReconciliation(validatingId, validationNotes);
    setValidatingId(null);
    setValidationNotes('');
    setViewingReconciliation(null);
  };

  const handleCancel = async (id: string) => {
    await cancelReconciliation(id);
    setViewingReconciliation(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'match':
        return <Badge className="bg-green-100 text-green-800">Confere</Badge>;
      case 'surplus':
        return <Badge className="bg-blue-100 text-blue-800">Excedente</Badge>;
      case 'shortage':
        return <Badge className="bg-red-100 text-red-800">Falta</Badge>;
      case 'not_found':
        return <Badge variant="secondary">Não encontrado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getReconciliationStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pendente</Badge>;
      case 'validated':
        return <Badge className="bg-green-100 text-green-800">Validado</Badge>;
      case 'cancelled':
        return <Badge variant="secondary">Cancelado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const currentReconciliation = reconciliations.find(r => r.id === viewingReconciliation);

  const filteredItems = reconciliationItems.filter(item =>
    item.product_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.product_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const itemStats = useMemo(() => {
    return {
      total: reconciliationItems.length,
      match: reconciliationItems.filter(i => i.status === 'match').length,
      surplus: reconciliationItems.filter(i => i.status === 'surplus').length,
      shortage: reconciliationItems.filter(i => i.status === 'shortage').length,
      notFound: reconciliationItems.filter(i => i.status === 'not_found').length
    };
  }, [reconciliationItems]);

  const isLoading = productsLoading || sessionsLoading || reconciliationsLoading;

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Viewing reconciliation details
  if (viewingReconciliation && currentReconciliation) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{currentReconciliation.name}</h2>
            <p className="text-sm text-muted-foreground">
              Criada em {format(new Date(currentReconciliation.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: pt })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {getReconciliationStatusBadge(currentReconciliation.status)}
            <Button variant="outline" onClick={() => setViewingReconciliation(null)}>
              Voltar
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Scale className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{itemStats.total}</p>
                <p className="text-xs text-muted-foreground">Total Itens</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{itemStats.match}</p>
                <p className="text-xs text-muted-foreground">Conferem</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <ArrowUpDown className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{itemStats.surplus}</p>
                <p className="text-xs text-muted-foreground">Excedentes</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-2xl font-bold">{itemStats.shortage}</p>
                <p className="text-xs text-muted-foreground">Faltas</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <FileQuestion className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{itemStats.notFound}</p>
                <p className="text-xs text-muted-foreground">Não encontrados</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        {currentReconciliation.status === 'pending' && (
          <div className="flex gap-2">
            <Button onClick={() => setValidatingId(currentReconciliation.id)}>
              <CheckCheck className="h-4 w-4 mr-2" />
              Validar Conciliação
            </Button>
            <Button variant="outline" onClick={() => handleCancel(currentReconciliation.id)}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
          </div>
        )}

        {currentReconciliation.notes && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-medium mb-1">Notas da validação:</p>
              <p className="text-sm text-muted-foreground">{currentReconciliation.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar por código ou nome..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Items table */}
        <Card>
          <CardContent className="p-0">
            {loadingItems ? (
              <div className="p-8 text-center">
                <Skeleton className="h-8 w-full mb-2" />
                <Skeleton className="h-8 w-full mb-2" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead className="text-right">Esperado</TableHead>
                      <TableHead className="text-right">Contado</TableHead>
                      <TableHead className="text-right">Diferença</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map(item => (
                      <TableRow 
                        key={item.id}
                        className={cn(
                          item.status === 'shortage' && 'bg-red-50',
                          item.status === 'surplus' && 'bg-blue-50',
                          item.status === 'match' && 'bg-green-50'
                        )}
                      >
                        <TableCell className="font-mono">{item.product_code}</TableCell>
                        <TableCell className="font-medium">{item.product_name}</TableCell>
                        <TableCell className="text-right">{item.expected_quantity}</TableCell>
                        <TableCell className="text-right">{item.counted_quantity}</TableCell>
                        <TableCell className={cn(
                          "text-right font-bold",
                          item.difference > 0 && "text-blue-600",
                          item.difference < 0 && "text-red-600",
                          item.difference === 0 && "text-green-600"
                        )}>
                          {item.difference > 0 ? '+' : ''}{item.difference}
                        </TableCell>
                        <TableCell>{getStatusBadge(item.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {item.notes || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Validation dialog */}
        <Dialog open={!!validatingId} onOpenChange={() => setValidatingId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Validar Conciliação</DialogTitle>
              <DialogDescription>
                Confirma que as informações foram verificadas e estão corretas?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Notas (opcional)</Label>
                <Textarea
                  placeholder="Adicione observações sobre a validação..."
                  value={validationNotes}
                  onChange={(e) => setValidationNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setValidatingId(null)}>
                Cancelar
              </Button>
              <Button onClick={handleValidate}>
                <CheckCheck className="h-4 w-4 mr-2" />
                Confirmar Validação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Conciliação de Stock</h2>
        <p className="text-sm text-muted-foreground">
          Compare o stock esperado com a contagem realizada
        </p>
      </div>

      {/* Create new reconciliation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Scale className="h-4 w-4" />
            Nova Conciliação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Sessão de Contagem</Label>
              <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar sessão" />
                </SelectTrigger>
                <SelectContent>
                  {activeSessions.map(session => (
                    <SelectItem key={session.id} value={session.id}>
                      {session.name} ({session.status === 'active' ? 'Ativa' : 'Completada'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Nome da Conciliação</Label>
              <Input
                placeholder="Ex: Conciliação Janeiro 2026"
                value={reconciliationName}
                onChange={(e) => setReconciliationName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ficheiro CSV</Label>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={!selectedSessionId}
              >
                <Upload className="h-4 w-4 mr-2" />
                {csvFileName || 'Carregar CSV'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
              {csvData.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {csvData.length} produtos encontrados
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                O CSV deve conter colunas: código, nome (opcional), quantidade
              </p>
              <a 
                href="/templates/template_conciliacao.csv" 
                download="template_conciliacao.csv"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Download className="h-3 w-3" />
                Baixar template
              </a>
            </div>
          </div>

          {/* Header error */}
          {csvHeaderError && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200">
              <div className="flex items-center gap-2 text-red-800">
                <XCircle className="h-5 w-5" />
                <span className="font-medium">Erro no cabeçalho do ficheiro</span>
              </div>
              <p className="text-sm text-red-700 mt-1">{csvHeaderError}</p>
            </div>
          )}

          {/* CSV validation errors */}
          {csvErrors.length > 0 && (
            <div className="border border-red-200 rounded-lg overflow-hidden">
              <div className="bg-red-50 px-4 py-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium text-red-800">
                  {csvErrors.length} linha{csvErrors.length > 1 ? 's' : ''} com erros
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Linha</TableHead>
                      <TableHead>Conteúdo</TableHead>
                      <TableHead>Erros</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvErrors.map((err, idx) => (
                      <TableRow key={idx} className="bg-red-50/50">
                        <TableCell className="font-mono text-red-700">{err.line}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground max-w-[200px] truncate">
                          {err.content}
                        </TableCell>
                        <TableCell className="text-red-700 text-sm">
                          {err.errors.join('; ')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="bg-red-50 px-4 py-2 text-xs text-red-700">
                Corrija os erros no ficheiro CSV e carregue novamente
              </div>
            </div>
          )}

          {/* Preview CSV data */}
          {csvData.length > 0 && !csvHeaderError && (
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted px-4 py-2 flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                <span className="text-sm font-medium">Pré-visualização ({csvData.length} linhas válidas)</span>
                {csvErrors.length > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {csvErrors.length} com erros
                  </Badge>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvData.slice(0, 10).map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono">{row.code}</TableCell>
                        <TableCell>{row.name || '-'}</TableCell>
                        <TableCell className="text-right">{row.quantity}</TableCell>
                      </TableRow>
                    ))}
                    {csvData.length > 10 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          ... e mais {csvData.length - 10} linhas
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <Button 
            onClick={handleCreateReconciliation}
            disabled={!selectedSessionId || !reconciliationName.trim() || csvData.length === 0 || csvErrors.length > 0 || !!csvHeaderError || isCreating}
          >
            {isCreating ? 'A criar...' : 'Criar Conciliação'}
          </Button>
        </CardContent>
      </Card>

      {/* Existing reconciliations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de Conciliações</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {reconciliations.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Scale className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma conciliação realizada</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Validado em</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reconciliations.map(rec => (
                    <TableRow key={rec.id}>
                      <TableCell className="font-medium">{rec.name}</TableCell>
                      <TableCell>
                        {format(new Date(rec.created_at), 'dd/MM/yyyy HH:mm', { locale: pt })}
                      </TableCell>
                      <TableCell>{getReconciliationStatusBadge(rec.status)}</TableCell>
                      <TableCell>
                        {rec.validated_at 
                          ? format(new Date(rec.validated_at), 'dd/MM/yyyy HH:mm', { locale: pt })
                          : '-'
                        }
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleViewReconciliation(rec.id)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Ver
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
