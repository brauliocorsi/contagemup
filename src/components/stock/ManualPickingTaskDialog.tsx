import { useMemo, useState } from 'react';
import { Plus, Search, Trash2, Loader2, Send } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useProducts } from '@/hooks/useProducts';
import { useCreatePickingTask } from '@/hooks/useScannerPickingTasks';

interface Line {
  product_id: string;
  code: string;
  name: string;
  quantity: number;
  order_number: string;
}

export function ManualPickingTaskDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [reference, setReference] = useState('');
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<Line[]>([]);

  const { products, loading } = useProducts();
  const createTask = useCreatePickingTask();

  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (term.length < 2) return [];
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          (p.code || '').toLowerCase().includes(term) ||
          (p.supplier_code || '').toLowerCase().includes(term),
      )
      .slice(0, 12);
  }, [products, search]);

  const addProduct = (p: { id: string; code: string; name: string }) => {
    setLines((prev) =>
      prev.some((l) => l.product_id === p.id)
        ? prev.map((l) => (l.product_id === p.id ? { ...l, quantity: l.quantity + 1 } : l))
        : [
            ...prev,
            { product_id: p.id, code: p.code || '', name: p.name, quantity: 1, order_number: '' },
          ],
    );
    setSearch('');
  };

  const update = (id: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.product_id === id ? { ...l, ...patch } : l)));

  const reset = () => {
    setName('');
    setReference('');
    setSearch('');
    setLines([]);
  };

  const submit = async () => {
    if (lines.length === 0) {
      toast.error('Adicione pelo menos um produto');
      return;
    }
    const taskName =
      name.trim() || `Picking manual ${new Date().toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}`;

    await createTask.mutateAsync({
      name: taskName,
      reference: reference.trim() || null,
      notes: 'Picking manual criado no painel de administração',
      items: lines.map((l) => ({
        product_code: l.code,
        product_name: l.name,
        orders: l.order_number.trim() || null,
        requested_quantity: Math.max(1, l.quantity),
      })),
    });

    toast.success('Picking enviado para o scanner. Ao concluir, os artigos vão para o cais de carga.');
    reset();
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Novo picking manual
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo picking manual</DialogTitle>
          <DialogDescription>
            Escolha os produtos e envie para o scanner. A conferência no scanner move o stock para a
            localização de pré-saída (cais de carga) — a saída só ocorre na entrega.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="picking-name">Nome da tarefa</Label>
              <Input
                id="picking-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Picking teste cais"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="picking-ref">Referência (opcional)</Label>
              <Input
                id="picking-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Ex.: ENC-1234"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="picking-search">Procurar produto</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="picking-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Código, nome ou código do fornecedor"
                className="pl-9"
              />
            </div>
            {loading && <p className="text-xs text-muted-foreground">A carregar produtos…</p>}
            {results.length > 0 && (
              <div className="max-h-52 overflow-y-auto rounded-md border">
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted"
                  >
                    <span className="truncate">{p.name}</span>
                    <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                      {p.code || '—'}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Artigos ({lines.length})</Label>
            {lines.length === 0 ? (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Ainda sem artigos.
              </p>
            ) : (
              <div className="max-h-60 space-y-2 overflow-y-auto">
                {lines.map((l) => (
                  <div key={l.product_id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                    <div className="min-w-[160px] flex-1">
                      <p className="truncate text-sm font-medium">{l.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{l.code || '—'}</p>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      value={l.quantity}
                      onChange={(e) =>
                        update(l.product_id, { quantity: parseInt(e.target.value, 10) || 1 })
                      }
                      className="w-20"
                      aria-label="Quantidade"
                    />
                    <Input
                      value={l.order_number}
                      onChange={(e) => update(l.product_id, { order_number: e.target.value })}
                      placeholder="Nota"
                      className="w-28"
                      aria-label="Número da nota"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setLines((prev) => prev.filter((x) => x.product_id !== l.product_id))
                      }
                      aria-label="Remover"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={createTask.isPending || lines.length === 0}>
            {createTask.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Enviar para o scanner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
