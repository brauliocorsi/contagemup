import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScanInput } from './ScanInput';
import { Check, Loader2, Package, RotateCcw, ScanBarcode, X } from 'lucide-react';
import { toast } from 'sonner';
import { useProductResolver } from '@/hooks/useScannerData';
import { mapDatabaseError } from '@/lib/errorMessages';
import type { Product } from '@/types/stock';

interface SupplierCodeModuleProps {
  onCommand?: (raw: string) => boolean;
}

interface HistoryEntry {
  productId: string;
  productCode: string;
  productName: string;
  newCode: string;
  previousCode: string | null;
}

export function SupplierCodeModule({ onCommand }: SupplierCodeModuleProps) {
  const resolveProduct = useProductResolver();
  const queryClient = useQueryClient();

  const [product, setProduct] = useState<Product | null>(null);
  const [matches, setMatches] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [conflict, setConflict] = useState<{ code: string; owner: Product } | null>(null);

  const { data: pendingCount, refetch: refetchPending } = useQuery({
    queryKey: ['supplier-code-pending'],
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .is('supplier_code', null);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['scanner-stock'] });
    refetchPending();
  }, [queryClient, refetchPending]);

  const saveSupplierCode = useCallback(
    async (target: Product, newCode: string | null) => {
      setBusy(true);
      const { error } = await supabase
        .from('products')
        .update({ supplier_code: newCode })
        .eq('id', target.id);
      setBusy(false);

      if (error) {
        toast.error('Erro ao guardar: ' + mapDatabaseError(error));
        return;
      }

      setHistory((h) => [
        {
          productId: target.id,
          productCode: target.code,
          productName: target.name,
          newCode: newCode ?? '—',
          previousCode: target.supplier_code ?? null,
        },
        ...h,
      ].slice(0, 20));

      toast.success(newCode ? `${target.code} → ${newCode}` : `Código removido de ${target.code}`);
      setProduct(null);
      setMatches([]);
      invalidate();
    },
    [invalidate]
  );

  const applyCode = useCallback(
    async (raw: string) => {
      if (!product) return;
      const code = raw.trim();
      if (!code) return;

      const { data: owners } = await supabase
        .from('products')
        .select('*')
        .eq('supplier_code', code)
        .limit(1);

      const owner = (owners?.[0] as Product | undefined) ?? null;
      if (owner && owner.id !== product.id) {
        setConflict({ code, owner });
        return;
      }

      await saveSupplierCode(product, code);
    },
    [product, saveSupplierCode]
  );

  const handleScan = useCallback(
    async (raw: string) => {
      if (onCommand?.(raw)) return;
      const code = raw.trim();
      if (!code) return;

      // Fase 2: já existe produto selecionado → o código lido é o do fornecedor
      if (product) {
        await applyCode(code);
        return;
      }

      // Fase 1: procurar o produto
      setBusy(true);
      const found = await resolveProduct(code);
      setBusy(false);

      if (found.length === 0) {
        toast.error('Produto não encontrado');
        return;
      }
      if (found.length === 1) {
        setProduct(found[0]);
        setMatches([]);
        return;
      }
      setMatches(found);
    },
    [applyCode, onCommand, product, resolveProduct]
  );

  const resolveConflict = useCallback(async () => {
    if (!conflict || !product) return;
    setBusy(true);
    const { error } = await supabase
      .from('products')
      .update({ supplier_code: null })
      .eq('id', conflict.owner.id);
    setBusy(false);
    if (error) {
      toast.error('Erro ao libertar o código: ' + mapDatabaseError(error));
      return;
    }
    const code = conflict.code;
    setConflict(null);
    await saveSupplierCode(product, code);
  }, [conflict, product, saveSupplierCode]);

  const undo = useCallback(
    async (entry: HistoryEntry) => {
      setBusy(true);
      const { error } = await supabase
        .from('products')
        .update({ supplier_code: entry.previousCode })
        .eq('id', entry.productId);
      setBusy(false);
      if (error) {
        toast.error('Erro ao desfazer: ' + mapDatabaseError(error));
        return;
      }
      setHistory((h) => h.filter((x) => x !== entry));
      toast.success(`Alteração desfeita em ${entry.productCode}`);
      invalidate();
    },
    [invalidate]
  );

  // Atalho de teclado: Esc limpa o produto selecionado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setProduct(null);
        setMatches([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const placeholder = useMemo(
    () => (product ? 'Ler o código de barras do fornecedor…' : 'Ler ou escrever o produto…'),
    [product]
  );

  return (
    <div className="space-y-4">
      <ScanInput
        onScan={handleScan}
        label={product ? '2. Código do fornecedor' : '1. Produto'}
        placeholder={placeholder}
      />

      {busy && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> A processar…
        </div>
      )}

      {typeof pendingCount === 'number' && (
        <div className="text-xs text-muted-foreground">
          Produtos sem código de fornecedor:{' '}
          <Badge variant="secondary">{pendingCount}</Badge>
        </div>
      )}

      {matches.length > 1 && (
        <Card>
          <CardContent className="space-y-2 p-3">
            <p className="text-xs font-medium text-muted-foreground">Vários produtos encontrados:</p>
            {matches.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setProduct(m);
                  setMatches([]);
                }}
                className="flex w-full items-center justify-between rounded-lg border p-2 text-left text-sm hover:border-primary"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{m.name}</span>
                  <span className="text-xs text-muted-foreground">{m.code}</span>
                </span>
                {m.supplier_code && <Badge variant="outline">{m.supplier_code}</Badge>}
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {product && (
        <Card className="border-primary/40">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{product.name}</p>
                <p className="text-xs text-muted-foreground">
                  Código interno: <span className="font-mono">{product.code}</span> · Stock:{' '}
                  {product.current_stock}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setProduct(null)} aria-label="Limpar">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="rounded-lg bg-muted/50 p-2 text-xs">
              Código de fornecedor atual:{' '}
              {product.supplier_code ? (
                <span className="font-mono font-semibold">{product.supplier_code}</span>
              ) : (
                <span className="text-muted-foreground">por preencher</span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => applyCode(product.code)} disabled={busy}>
                <Check className="mr-2 h-4 w-4" />
                Igual ao código interno
              </Button>
              {product.supplier_code && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => saveSupplierCode(product, null)}
                  disabled={busy}
                >
                  Limpar código
                </Button>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground">
              Lê agora o código de barras do fornecedor — é guardado automaticamente.
            </p>
          </CardContent>
        </Card>
      )}

      {!product && matches.length === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <ScanBarcode className="h-4 w-4" />
          Lê primeiro o produto (código interno, nome ou código já associado).
        </div>
      )}

      {history.length > 0 && (
        <Card>
          <CardContent className="space-y-2 p-3">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Package className="h-3.5 w-3.5" /> Atribuições desta sessão
            </p>
            {history.map((h, i) => (
              <div key={`${h.productId}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{h.productName}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {h.productCode} → {h.newCode}
                  </span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => undo(h)} disabled={busy}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Desfazer
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!conflict} onOpenChange={(o) => !o && setConflict(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Código já utilizado</AlertDialogTitle>
            <AlertDialogDescription>
              O código <span className="font-mono">{conflict?.code}</span> já está associado ao produto{' '}
              <strong>{conflict?.owner.name}</strong> ({conflict?.owner.code}). Queres transferir o código
              para o produto atual?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={resolveConflict}>Transferir código</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
