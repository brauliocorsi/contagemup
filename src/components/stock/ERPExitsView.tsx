import { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { CalendarIcon, Loader2, ShoppingCart, User, Package, Download, Truck, Plus, AlertTriangle, ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useProducts } from '@/hooks/useProducts';
import { useCategories } from '@/hooks/useCategories';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

interface SaleExitItem {
  productCode: string;
  productName: string;
  quantity: number;
}

interface SaleExit {
  venda_id: string;
  codigo: string;
  cliente_nome: string;
  situacao: string;
  data: string;
  prazo_entrega: string;
  items: SaleExitItem[];
}

export interface ERPExitCartItem {
  product_id: string;
  product_code: string;
  product_name: string;
  quantity: number;
}

interface ERPExitsViewProps {
  onSendToCart?: (items: ERPExitCartItem[]) => void;
}

export function ERPExitsView({ onSendToCart }: ERPExitsViewProps) {
  const [date, setDate] = useState<Date>(new Date());
  const [salesExits, setSalesExits] = useState<SaleExit[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { toast } = useToast();
  const { products, fetchProducts } = useProducts();
  const { categories } = useCategories();

  // Quick register dialog state
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [registerItem, setRegisterItem] = useState<{ code: string; name: string } | null>(null);
  const [registerCategory, setRegisterCategory] = useState('Geral');
  const [registering, setRegistering] = useState(false);

  // Local products map by code (lowercase)
  const localProductMap = useMemo(() => {
    const map = new Map<string, { id: string; code: string; name: string; current_stock: number }>();
    for (const p of products) {
      map.set(p.code.toLowerCase(), {
        id: p.id,
        code: p.code,
        name: p.name,
        current_stock: p.current_stock,
      });
    }
    return map;
  }, [products]);

  const fetchScheduledExits = async (selectedDate: Date) => {
    setLoading(true);
    setSalesExits([]);
    setLoaded(false);

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const { data, error } = await supabase.functions.invoke('gestaoclick-scheduled-exits', {
        body: { date: dateStr },
      });

      if (error) throw new Error(error.message);

      setSalesExits(data?.salesExits || []);
      setLoaded(true);

      const total = data?.salesExits?.length || 0;
      toast({
        title: 'Pesquisa concluída',
        description: `${total} venda(s) agendada(s) para ${format(selectedDate, 'dd/MM/yyyy')}.`,
      });
    } catch (err: any) {
      console.error('Error fetching scheduled exits:', err);
      toast({ title: 'Erro', description: err.message || 'Erro ao buscar saídas agendadas', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDateSelect = (newDate: Date | undefined) => {
    if (newDate) {
      setDate(newDate);
    }
  };

  // Aggregate all products across all sales with local matching
  const aggregatedProducts = useMemo(() => {
    const map = new Map<string, { productCode: string; productName: string; totalQuantity: number; salesCount: number }>();
    for (const sale of salesExits) {
      for (const item of sale.items) {
        const key = item.productCode.toLowerCase();
        const existing = map.get(key);
        if (existing) {
          existing.totalQuantity += item.quantity;
          existing.salesCount++;
        } else {
          map.set(key, {
            productCode: item.productCode,
            productName: item.productName,
            totalQuantity: item.quantity,
            salesCount: 1,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);
  }, [salesExits]);

  const totalProducts = aggregatedProducts.reduce((sum, p) => sum + p.totalQuantity, 0);

  // Products not found locally
  const missingProducts = useMemo(() => {
    return aggregatedProducts.filter(p => !localProductMap.has(p.productCode.toLowerCase()));
  }, [aggregatedProducts, localProductMap]);

  // Products found locally (for cart)
  const matchedProducts = useMemo(() => {
    return aggregatedProducts
      .filter(p => localProductMap.has(p.productCode.toLowerCase()))
      .map(p => {
        const local = localProductMap.get(p.productCode.toLowerCase())!;
        return { ...p, localProduct: local };
      });
  }, [aggregatedProducts, localProductMap]);

  const handleQuickRegister = (code: string, name: string) => {
    setRegisterItem({ code, name });
    setRegisterCategory('Geral');
    setRegisterDialogOpen(true);
  };

  const confirmRegister = async () => {
    if (!registerItem) return;
    setRegistering(true);
    try {
      const { error } = await supabase.from('products').insert({
        code: registerItem.code,
        name: registerItem.name,
        category: registerCategory,
        current_stock: 0,
        total_colis: 1,
        min_stock: 0,
      });
      if (error) throw error;
      toast({ title: 'Produto cadastrado', description: `${registerItem.code} adicionado ao sistema local.` });
      setRegisterDialogOpen(false);
      setRegisterItem(null);
      fetchProducts();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setRegistering(false);
    }
  };

  const handleRegisterAll = async () => {
    if (missingProducts.length === 0) return;
    setRegistering(true);
    try {
      const toInsert = missingProducts.map(p => ({
        code: p.productCode,
        name: p.productName,
        category: registerCategory || 'Geral',
        current_stock: 0,
        total_colis: 1,
        min_stock: 0,
      }));
      const { error } = await supabase.from('products').insert(toInsert);
      if (error) throw error;
      toast({ title: 'Produtos cadastrados', description: `${toInsert.length} produto(s) adicionado(s).` });
      refetchProducts();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setRegistering(false);
    }
  };

  const handleSendToCart = () => {
    if (!onSendToCart || matchedProducts.length === 0) return;
    const items: ERPExitCartItem[] = matchedProducts.map(p => ({
      product_id: p.localProduct.id,
      product_code: p.localProduct.code,
      product_name: p.localProduct.name,
      quantity: p.totalQuantity,
    }));
    onSendToCart(items);
    toast({ title: 'Enviado para carrinho', description: `${items.length} produto(s) adicionado(s) ao carrinho de saída.` });
  };

  const exportToExcel = () => {
    const salesData = salesExits.flatMap(sale =>
      sale.items.map(item => ({
        'Venda': sale.codigo,
        'Cliente': sale.cliente_nome,
        'Estado': sale.situacao,
        'Data Entrega': sale.prazo_entrega,
        'Código Produto': item.productCode,
        'Produto': item.productName,
        'Quantidade': item.quantity,
      }))
    );
    const aggData = aggregatedProducts.map(p => ({
      'Código': p.productCode,
      'Produto': p.productName,
      'Quantidade Total': p.totalQuantity,
      'Nº Vendas': p.salesCount,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesData), 'Por Venda');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(aggData), 'Resumo Produtos');
    XLSX.writeFile(wb, `saidas_erp_${format(date, 'yyyy-MM-dd')}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Truck className="h-5 w-5 text-orange-600" />
          Saídas Agendadas do ERP
        </h2>
        <p className="text-sm text-muted-foreground">
          Produtos com entrega/levantamento agendado para o dia selecionado
        </p>
      </div>

      {/* Date picker + search */}
      <div className="flex flex-wrap items-center gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-[220px] justify-start text-left font-normal", !date && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date ? format(date, 'dd/MM/yyyy') : 'Selecionar data'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={handleDateSelect}
              locale={pt}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        <Button onClick={() => fetchScheduledExits(date)} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShoppingCart className="h-4 w-4 mr-2" />}
          {loading ? 'A carregar...' : 'Buscar Saídas'}
        </Button>

        {salesExits.length > 0 && (
          <>
            <Button variant="outline" onClick={exportToExcel}>
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>
            {onSendToCart && matchedProducts.length > 0 && (
              <Button onClick={handleSendToCart} className="bg-red-600 hover:bg-red-700 text-white">
                <ArrowRight className="h-4 w-4 mr-2" />
                Enviar {matchedProducts.length} produto(s) para Saída
              </Button>
            )}
          </>
        )}
      </div>

      {/* Summary */}
      {loaded && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{salesExits.length}</p>
              <p className="text-xs text-muted-foreground">Vendas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{aggregatedProducts.length}</p>
              <p className="text-xs text-muted-foreground">Produtos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{totalProducts}</p>
              <p className="text-xs text-muted-foreground">Unidades Total</p>
            </CardContent>
          </Card>
          {missingProducts.length > 0 && (
            <Card className="border-destructive/50">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-destructive">{missingProducts.length}</p>
                <p className="text-xs text-muted-foreground">Não cadastrados</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Missing products alert */}
      {missingProducts.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Produtos não cadastrados no sistema local ({missingProducts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {missingProducts.map(p => (
              <div key={p.productCode} className="flex items-center justify-between text-sm bg-background rounded px-3 py-2 border">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{p.productCode}</span>
                  <span>{p.productName}</span>
                  <Badge variant="secondary">{p.totalQuantity} un.</Badge>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleQuickRegister(p.productCode, p.productName)}>
                  <Plus className="h-3 w-3 mr-1" />
                  Cadastrar
                </Button>
              </div>
            ))}
            {missingProducts.length > 1 && (
              <div className="flex items-center gap-3 pt-2">
                <Select value={registerCategory} onValueChange={setRegisterCategory}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))}
                    <SelectItem value="Geral">Geral</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={handleRegisterAll} disabled={registering}>
                  <Plus className="h-3 w-3 mr-1" />
                  Cadastrar Todos ({missingProducts.length})
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Aggregated product list */}
      {aggregatedProducts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              Lista de Produtos para Saída
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Qtd Saída</TableHead>
                    <TableHead className="text-right">Stock Local</TableHead>
                    <TableHead className="text-right">Nº Vendas</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aggregatedProducts.map(p => {
                    const local = localProductMap.get(p.productCode.toLowerCase());
                    const isRegistered = !!local;
                    const hasEnoughStock = isRegistered && (local.current_stock >= p.totalQuantity);
                    return (
                      <TableRow key={p.productCode} className={!isRegistered ? 'bg-destructive/5' : ''}>
                        <TableCell className="font-mono text-sm">{p.productCode}</TableCell>
                        <TableCell>{p.productName}</TableCell>
                        <TableCell className="text-right font-bold">{p.totalQuantity}</TableCell>
                        <TableCell className="text-right">
                          {isRegistered ? (
                            <span className={cn("font-medium", !hasEnoughStock && "text-destructive")}>
                              {local.current_stock}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{p.salesCount}</TableCell>
                        <TableCell className="text-center">
                          {!isRegistered ? (
                            <Badge variant="destructive" className="text-xs">Não cadastrado</Badge>
                          ) : hasEnoughStock ? (
                            <Badge variant="default" className="text-xs bg-green-600"><Check className="h-3 w-3 mr-1" />OK</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs text-orange-600 border-orange-300">Stock baixo</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sales detail */}
      {salesExits.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Detalhe por Venda</h3>
          {salesExits.map(sale => (
            <Card key={sale.venda_id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="font-mono font-bold">#{sale.codigo}</span>
                  <Badge variant="outline">{sale.situacao}</Badge>
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <User className="h-3 w-3" />
                    {sale.cliente_nome}
                  </span>
                  {sale.prazo_entrega && (
                    <span className="flex items-center gap-1 text-sm text-muted-foreground ml-auto">
                      <CalendarIcon className="h-3 w-3" />
                      {sale.prazo_entrega}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {sale.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{item.productCode}</span>
                        <span>{item.productName}</span>
                      </div>
                      <Badge variant="secondary" className="font-bold">{item.quantity} un.</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {loaded && salesExits.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Truck className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="text-lg font-semibold mb-1">Sem saídas agendadas</h3>
            <p className="text-sm text-muted-foreground">
              Nenhuma venda com entrega/levantamento agendado para {format(date, 'dd/MM/yyyy')}.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Quick Register Dialog */}
      <Dialog open={registerDialogOpen} onOpenChange={setRegisterDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadastrar Produto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm text-muted-foreground">Código</Label>
              <p className="font-mono font-medium">{registerItem?.code}</p>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Nome</Label>
              <p className="font-medium">{registerItem?.name}</p>
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={registerCategory} onValueChange={setRegisterCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                  <SelectItem value="Geral">Geral</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegisterDialogOpen(false)}>Cancelar</Button>
            <Button onClick={confirmRegister} disabled={registering}>
              {registering ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
