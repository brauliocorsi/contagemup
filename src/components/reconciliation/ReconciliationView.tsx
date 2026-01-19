import { useState, useMemo, useRef } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { useSessions } from '@/hooks/useSessions';
import { useCounting } from '@/hooks/useCounting';
import { useReconciliation, ColumnMapping, FileParseResult } from '@/hooks/useReconciliation';
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
  ArrowUpDown, Search, Eye, CheckCheck, X, Scale, FileQuestion, Download, Trash2,
  MapPin, Package, Settings2
} from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
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
    deleteReconciliation,
    parseCSV,
    parseXLSX,
    reParseWithMapping
  } = useReconciliation();

  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [reconciliationName, setReconciliationName] = useState('');
  const [fileData, setFileData] = useState<CSVImportRow[]>([]);
  const [fileErrors, setFileErrors] = useState<CSVValidationError[]>([]);
  const [fileHeaderError, setFileHeaderError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Column mapping state
  const [showColumnMapping, setShowColumnMapping] = useState(false);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [rawFileData, setRawFileData] = useState<Record<string, unknown>[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({ code: null, name: null, quantity: null });

  // View reconciliation details
  const [viewingReconciliation, setViewingReconciliation] = useState<string | null>(null);
  const [reconciliationItems, setReconciliationItems] = useState<ReconciliationItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Validation dialog
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [validationNotes, setValidationNotes] = useState('');

  // Filter by status
  const [statusFilter, setStatusFilter] = useState<string>('all');

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

    setFileName(file.name);
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target?.result as ArrayBuffer;
        const result = parseXLSX(data);
        applyParseResult(result);
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const result = parseCSV(content);
        applyParseResult(result);
      };
      reader.readAsText(file);
    }
  };

  const applyParseResult = (result: FileParseResult) => {
    setFileData(result.rows);
    setFileErrors(result.errors);
    setFileHeaderError(result.headerError);
    setFileHeaders(result.headers);
    setRawFileData(result.rawData);
    setColumnMapping(result.detectedMapping);

    // If auto-detection failed but we have data, show mapping UI
    if (result.headerError && result.rawData.length > 0) {
      setShowColumnMapping(true);
    } else {
      setShowColumnMapping(false);
    }
  };

  const handleApplyMapping = () => {
    const result = reParseWithMapping(rawFileData, columnMapping);
    setFileData(result.rows);
    setFileErrors(result.errors);
    setFileHeaderError(result.headerError);
    
    if (!result.headerError) {
      setShowColumnMapping(false);
    }
  };

  const handleCreateReconciliation = async () => {
    if (!selectedSessionId || !reconciliationName.trim() || fileData.length === 0 || fileErrors.length > 0) return;

    setIsCreating(true);
    await createReconciliation(selectedSessionId, reconciliationName, fileData, productsWithCounts);
    setIsCreating(false);
    
    // Reset form
    setFileData([]);
    setFileErrors([]);
    setFileHeaderError(null);
    setFileName('');
    setReconciliationName('');
    setFileHeaders([]);
    setRawFileData([]);
    setColumnMapping({ code: null, name: null, quantity: null });
    setShowColumnMapping(false);
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

  const handleDelete = async (id: string) => {
    await deleteReconciliation(id);
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

  const filteredItems = useMemo(() => {
    return reconciliationItems.filter(item => {
      const matchesSearch = 
        item.product_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.location && item.location.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.pallet_number && item.pallet_number.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [reconciliationItems, searchTerm, statusFilter]);

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
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('all')}>
            <CardContent className={cn("p-4 flex items-center gap-3", statusFilter === 'all' && "ring-2 ring-primary rounded-lg")}>
              <Scale className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{itemStats.total}</p>
                <p className="text-xs text-muted-foreground">Total Itens</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('match')}>
            <CardContent className={cn("p-4 flex items-center gap-3", statusFilter === 'match' && "ring-2 ring-green-600 rounded-lg")}>
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{itemStats.match}</p>
                <p className="text-xs text-muted-foreground">Conferem</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('surplus')}>
            <CardContent className={cn("p-4 flex items-center gap-3", statusFilter === 'surplus' && "ring-2 ring-blue-600 rounded-lg")}>
              <ArrowUpDown className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{itemStats.surplus}</p>
                <p className="text-xs text-muted-foreground">Excedentes</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('shortage')}>
            <CardContent className={cn("p-4 flex items-center gap-3", statusFilter === 'shortage' && "ring-2 ring-red-600 rounded-lg")}>
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-2xl font-bold">{itemStats.shortage}</p>
                <p className="text-xs text-muted-foreground">Faltas</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('not_found')}>
            <CardContent className={cn("p-4 flex items-center gap-3", statusFilter === 'not_found' && "ring-2 ring-muted-foreground rounded-lg")}>
              <FileQuestion className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{itemStats.notFound}</p>
                <p className="text-xs text-muted-foreground">Não encontrados</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {currentReconciliation.status === 'pending' && (
            <>
              <Button onClick={() => setValidatingId(currentReconciliation.id)}>
                <CheckCheck className="h-4 w-4 mr-2" />
                Validar Conciliação
              </Button>
              <Button variant="outline" onClick={() => handleCancel(currentReconciliation.id)}>
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
            </>
          )}
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-destructive">
                  Eliminar conciliação definitivamente?
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <p>
                    <strong>ATENÇÃO:</strong> Esta ação é <strong>IRREVERSÍVEL</strong>.
                  </p>
                  <p>
                    Todos os itens desta conciliação serão permanentemente eliminados.
                  </p>
                  <p className="font-medium pt-2">
                    Tem a certeza que deseja continuar?
                  </p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={() => handleDelete(currentReconciliation.id)} 
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Sim, eliminar definitivamente
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {currentReconciliation.notes && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-medium mb-1">Notas da validação:</p>
              <p className="text-sm text-muted-foreground">{currentReconciliation.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Search and Filter */}
        <div className="flex gap-4 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar por código, nome, localização ou palete..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          {statusFilter !== 'all' && (
            <Button variant="ghost" size="sm" onClick={() => setStatusFilter('all')}>
              <X className="h-4 w-4 mr-1" />
              Limpar filtro
            </Button>
          )}
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
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          Localização
                        </div>
                      </TableHead>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <Package className="h-3 w-3" />
                          Palete
                        </div>
                      </TableHead>
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
                        <TableCell>
                          {item.location ? (
                            <Badge variant="outline" className="font-normal">
                              <MapPin className="h-3 w-3 mr-1" />
                              {item.location}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.pallet_number ? (
                            <Badge variant="outline" className="font-normal">
                              <Package className="h-3 w-3 mr-1" />
                              {item.pallet_number}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
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
            <Label>Ficheiro CSV ou Excel</Label>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={!selectedSessionId}
              >
                <Upload className="h-4 w-4 mr-2" />
                {fileName || 'Carregar ficheiro'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />
              {fileData.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {fileData.length} produtos encontrados
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                Suporta ficheiros CSV e Excel (XLSX, XLS). Colunas: código, nome (opcional), quantidade
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

          {/* Column mapping UI */}
          {showColumnMapping && fileHeaders.length > 0 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Mapeamento de Colunas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Não foi possível detetar automaticamente as colunas. Por favor, mapeie-as manualmente:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Código do Produto *</Label>
                    <Select 
                      value={columnMapping.code || ''} 
                      onValueChange={(v) => setColumnMapping(prev => ({ ...prev, code: v || null }))}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Selecionar coluna" />
                      </SelectTrigger>
                      <SelectContent>
                        {fileHeaders.map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Nome do Produto</Label>
                    <Select 
                      value={columnMapping.name || ''} 
                      onValueChange={(v) => setColumnMapping(prev => ({ ...prev, name: v || null }))}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="(opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Nenhum</SelectItem>
                        {fileHeaders.map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Quantidade *</Label>
                    <Select 
                      value={columnMapping.quantity || ''} 
                      onValueChange={(v) => setColumnMapping(prev => ({ ...prev, quantity: v || null }))}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Selecionar coluna" />
                      </SelectTrigger>
                      <SelectContent>
                        {fileHeaders.map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button size="sm" onClick={handleApplyMapping} disabled={!columnMapping.code || !columnMapping.quantity}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Aplicar Mapeamento
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Detected mapping info */}
          {!showColumnMapping && columnMapping.code && fileData.length > 0 && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Código: <strong>{columnMapping.code}</strong>
              </span>
              {columnMapping.name && (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Nome: <strong>{columnMapping.name}</strong>
                </span>
              )}
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Quantidade: <strong>{columnMapping.quantity}</strong>
              </span>
              <Button variant="ghost" size="sm" onClick={() => setShowColumnMapping(true)}>
                <Settings2 className="h-4 w-4 mr-1" />
                Alterar
              </Button>
            </div>
          )}

          {/* Header error */}
          {fileHeaderError && !showColumnMapping && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200">
              <div className="flex items-center gap-2 text-red-800">
                <XCircle className="h-5 w-5" />
                <span className="font-medium">Erro no ficheiro</span>
              </div>
              <p className="text-sm text-red-700 mt-1">{fileHeaderError}</p>
            </div>
          )}

          {/* File validation errors */}
          {fileErrors.length > 0 && (
            <div className="border border-red-200 rounded-lg overflow-hidden">
              <div className="bg-red-50 px-4 py-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium text-red-800">
                  {fileErrors.length} linha{fileErrors.length > 1 ? 's' : ''} com erros
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
                    {fileErrors.map((err, idx) => (
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
                Corrija os erros no ficheiro e carregue novamente
              </div>
            </div>
          )}

          {/* Preview file data */}
          {fileData.length > 0 && !fileHeaderError && (
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted px-4 py-2 flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                <span className="text-sm font-medium">Pré-visualização ({fileData.length} linhas válidas)</span>
                {fileErrors.length > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {fileErrors.length} com erros
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
                    {fileData.slice(0, 10).map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono">{row.code}</TableCell>
                        <TableCell>{row.name || '-'}</TableCell>
                        <TableCell className="text-right">{row.quantity}</TableCell>
                      </TableRow>
                    ))}
                    {fileData.length > 10 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          ... e mais {fileData.length - 10} linhas
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
            disabled={!selectedSessionId || !reconciliationName.trim() || fileData.length === 0 || fileErrors.length > 0 || !!fileHeaderError || isCreating}
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
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleViewReconciliation(rec.id)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Ver
                          </Button>
                          
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-destructive">
                                  Eliminar conciliação definitivamente?
                                </AlertDialogTitle>
                                <AlertDialogDescription className="space-y-2">
                                  <p>
                                    <strong>ATENÇÃO:</strong> Esta ação é <strong>IRREVERSÍVEL</strong>.
                                  </p>
                                  <p>
                                    A conciliação "{rec.name}" e todos os seus itens serão permanentemente eliminados.
                                  </p>
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => handleDelete(rec.id)} 
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Sim, eliminar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
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
