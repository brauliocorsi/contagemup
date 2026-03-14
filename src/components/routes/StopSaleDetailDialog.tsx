import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, Package, CreditCard, MapPin, FileText, User, Phone, Mail, Truck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Separator } from '@/components/ui/separator';

interface VendaDetail {
  id: string;
  codigo: string;
  data: string;
  data_entrega: string;
  situacao: string;
  cliente_nome: string;
  cliente_documento: string;
  cliente_telefone: string;
  cliente_email: string;
  valor_total: string;
  valor_desconto: string;
  valor_frete: string;
  observacao: string;
  observacao_interna: string;
  numero_pedido: string;
  transportadora: string;
  produtos: {
    nome: string;
    codigo: string;
    quantidade: string;
    valor_unitario: string;
    valor_total: string;
    unidade: string;
    desconto: string;
    observacao: string;
  }[];
  pagamentos: {
    forma: string;
    valor: string;
    parcelas: string;
    vencimento: string;
    status: string;
  }[];
  enderecos: {
    endereco: string;
    numero: string;
    complemento: string;
    bairro: string;
    cidade: string;
    estado: string;
    cep: string;
  }[];
}

interface StopSaleDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendaId: string | null;
  vendaCodigo: string | null;
}

export function StopSaleDetailDialog({ open, onOpenChange, vendaId, vendaCodigo }: StopSaleDetailDialogProps) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<VendaDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = async () => {
    if (!vendaId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('gestaoclick-venda-detail', {
        body: { venda_id: vendaId },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setDetail(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao buscar detalhes');
      toast.error('Erro ao buscar detalhes da venda');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (o: boolean) => {
    if (o && vendaId && !detail) {
      fetchDetail();
    }
    if (!o) {
      setDetail(null);
      setError(null);
    }
    onOpenChange(o);
  };

  const formatCurrency = (val: string) => {
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    return num.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Detalhes da Venda {vendaCodigo || ''}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">A carregar detalhes...</p>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-destructive">{error}</p>
          </div>
        ) : detail ? (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Header info */}
            <div className="grid grid-cols-2 gap-3">
              <InfoItem icon={<FileText className="h-4 w-4" />} label="Código" value={detail.codigo} />
              <InfoItem icon={<FileText className="h-4 w-4" />} label="Data" value={detail.data} />
              {detail.data_entrega && (
                <InfoItem icon={<Truck className="h-4 w-4" />} label="Data Entrega" value={detail.data_entrega} />
              )}
              {detail.numero_pedido && (
                <InfoItem icon={<FileText className="h-4 w-4" />} label="Nº Pedido" value={detail.numero_pedido} />
              )}
              <InfoItem icon={<FileText className="h-4 w-4" />} label="Estado" value={detail.situacao} />
              <InfoItem icon={<FileText className="h-4 w-4" />} label="Total" value={formatCurrency(detail.valor_total)} highlight />
            </div>

            {/* Client */}
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <User className="h-4 w-4 text-primary" /> Cliente
              </h3>
              <div className="grid grid-cols-2 gap-2 bg-muted/50 rounded-lg p-3">
                <span className="text-sm font-medium col-span-2">{detail.cliente_nome}</span>
                {detail.cliente_documento && (
                  <span className="text-xs text-muted-foreground">NIF: {detail.cliente_documento}</span>
                )}
                {detail.cliente_telefone && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {detail.cliente_telefone}
                  </span>
                )}
                {detail.cliente_email && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1 col-span-2">
                    <Mail className="h-3 w-3" /> {detail.cliente_email}
                  </span>
                )}
              </div>
            </div>

            {/* Delivery address */}
            {detail.enderecos.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-primary" /> Endereço de Entrega
                </h3>
                {detail.enderecos.map((end, i) => (
                  <div key={i} className="bg-muted/50 rounded-lg p-3 text-sm">
                    <p>{[end.endereco, end.numero].filter(Boolean).join(', ')}</p>
                    {end.complemento && <p className="text-muted-foreground">{end.complemento}</p>}
                    <p className="text-muted-foreground">
                      {[end.bairro, end.cidade, end.estado, end.cep].filter(Boolean).join(' • ')}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <Separator />

            {/* Products */}
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Package className="h-4 w-4 text-primary" /> Produtos ({detail.produtos.length})
              </h3>
              <div className="space-y-1.5">
                {detail.produtos.map((prod, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card">
                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{prod.nome || 'Sem nome'}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {prod.codigo && <span className="font-mono">{prod.codigo}</span>}
                        <span>Qtd: {prod.quantidade}{prod.unidade ? ` ${prod.unidade}` : ''}</span>
                      </div>
                      {prod.observacao && (
                        <p className="text-xs text-muted-foreground italic mt-0.5">{prod.observacao}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{formatCurrency(prod.valor_total || prod.valor_unitario)}</p>
                      {parseFloat(prod.desconto) > 0 && (
                        <p className="text-xs text-destructive">-{prod.desconto}%</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Payments */}
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <CreditCard className="h-4 w-4 text-primary" /> Pagamento
              </h3>
              {detail.pagamentos.length > 0 ? (
                <div className="space-y-1.5">
                  {detail.pagamentos.map((pag, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg border bg-card">
                      <div>
                        <p className="text-sm font-medium">{pag.forma || 'N/A'}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {pag.parcelas !== '1' && <span>{pag.parcelas}x parcelas</span>}
                          {pag.vencimento && <span>Venc: {pag.vencimento}</span>}
                          {pag.status && <Badge variant="outline" className="text-[10px] py-0">{pag.status}</Badge>}
                        </div>
                      </div>
                      <span className="text-sm font-semibold">{formatCurrency(pag.valor)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-2">Sem informação de pagamento</p>
              )}
            </div>

            {/* Financial summary */}
            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              {parseFloat(detail.valor_desconto) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Desconto</span>
                  <span className="text-destructive">-{formatCurrency(detail.valor_desconto)}</span>
                </div>
              )}
              {parseFloat(detail.valor_frete) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Frete</span>
                  <span>{formatCurrency(detail.valor_frete)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold pt-1 border-t">
                <span>Total</span>
                <span>{formatCurrency(detail.valor_total)}</span>
              </div>
            </div>

            {/* Notes */}
            {(detail.observacao || detail.observacao_interna) && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Observações</h3>
                {detail.observacao && (
                  <p className="text-sm bg-muted/50 rounded-lg p-3">{detail.observacao}</p>
                )}
                {detail.observacao_interna && (
                  <p className="text-sm bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mt-1.5">
                    <span className="font-medium text-amber-700 dark:text-amber-300">Interna: </span>
                    {detail.observacao_interna}
                  </p>
                )}
              </div>
            )}

            {/* Transport */}
            {detail.transportadora && (
              <div className="flex items-center gap-2 text-sm bg-muted/50 rounded-lg p-3">
                <Truck className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground">Transportadora:</span>
                <span className="font-medium">{detail.transportadora}</span>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function InfoItem({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <span className={highlight ? 'font-bold text-primary' : 'font-medium'}>{value}</span>
    </div>
  );
}
