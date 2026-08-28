import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, Merge, Search, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useProducts } from '@/hooks/useProducts';
import { useToast } from '@/hooks/use-toast';
import { Product } from '@/types/stock';

function normalizeName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isMattress(p: Product) {
  return (
    p.code?.toUpperCase().startsWith('COL') ||
    /colch/i.test(p.category || '') ||
    /colch/i.test(p.name || '')
  );
}

interface DuplicateGroup {
  key: string;
  name: string;
  items: Product[];
}

// Código "novo" = COL.../CAM... (formato novo). Estes têm sempre prioridade para ficar.
function isNewCode(code: string) {
  return /^(COL|CAM)\d/i.test((code || '').trim());
}

// Grupos multi-peça (mesmo nome, códigos de componentes distintos) não são duplicados reais.
function isMultiPartGroup(items: Product[]) {
  return items.length > 2 && !items.some((i) => isNewCode(i.code));
}

export function DuplicateProductsReport() {
  const { products, loading } = useProducts();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [onlyMattresses, setOnlyMattresses] = useState(true);
  const [keepChoice, setKeepChoice] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<DuplicateGroup | null>(null);
  const [merging, setMerging] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);


  const groups = useMemo<DuplicateGroup[]>(() => {
    const scope = onlyMattresses ? products.filter(isMattress) : products;
    const map = new Map<string, Product[]>();
    scope.forEach((p) => {
      const key = normalizeName(p.name || '');
      if (!key) return;
      const arr = map.get(key) || [];
      arr.push(p);
      map.set(key, arr);
    });
    return Array.from(map.entries())
      .filter(([, items]) => items.length > 1)
      .map(([key, items]) => ({
        key,
        name: items[0].name,
        items: [...items].sort((a, b) => a.code.localeCompare(b.code)),
      }))
      .filter((g) => !isMultiPartGroup(g.items))
      .filter((g) =>
        !search.trim() ||
        g.name.toLowerCase().includes(search.toLowerCase()) ||
        g.items.some((i) => i.code.toLowerCase().includes(search.toLowerCase()))
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, onlyMattresses, search]);

  const defaultKeep = (g: DuplicateGroup) => {
    if (keepChoice[g.key]) return keepChoice[g.key];
    // 1) código novo (COL/CAM), 2) código não numérico, 3) maior stock
    const newCode = g.items.find((i) => isNewCode(i.code));
    if (newCode) return newCode.id;
    const alpha = g.items.find((i) => /[A-Za-z]/.test(i.code));
    if (alpha) return alpha.id;
    return [...g.items].sort((a, b) => (b.current_stock || 0) - (a.current_stock || 0))[0].id;
  };

  const mergeGroup = async (g: DuplicateGroup) => {
    const keepId = defaultKeep(g);
    for (const item of g.items) {
      if (item.id === keepId) continue;
      const { error } = await supabase.rpc('merge_duplicate_products', {
        p_keep: keepId,
        p_remove: item.id,
      });
      if (error) throw error;
    }
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['counts'] });
    queryClient.invalidateQueries({ queryKey: ['last-counts'] });
  };

  const handleMerge = async () => {
    if (!pending) return;
    setMerging(true);
    try {
      await mergeGroup(pending);
      toast({ title: 'Unificado', description: `${pending.name} — ${pending.items.length - 1} duplicado(s) removido(s); stock somado no registo mantido` });
      refresh();
      setPending(null);
    } catch (e) {
      toast({
        title: 'Erro',
        description: e instanceof Error ? e.message : 'Não foi possível unificar',
        variant: 'destructive',
      });
    } finally {
      setMerging(false);
    }
  };

  const handleMergeAll = async () => {
    setMerging(true);
    let ok = 0;
    let fail = 0;
    for (const g of groups) {
      try {
        await mergeGroup(g);
        ok++;
      } catch {
        fail++;
      }
    }
    refresh();
    setMerging(false);
    setBulkOpen(false);
    toast({
      title: 'Unificação concluída',
      description: `${ok} grupo(s) unificado(s)${fail ? `, ${fail} com erro` : ''} — stock preservado`,
      variant: fail ? 'destructive' : 'default',
    });
  };


  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Produtos duplicados
            <Badge variant="secondary">{groups.length}</Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant={onlyMattresses ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOnlyMattresses((v) => !v)}
            >
              {onlyMattresses ? 'Apenas colchões' : 'Todos os produtos'}
            </Button>
            <Button size="sm" variant="secondary" disabled={merging || groups.length === 0} onClick={() => setBulkOpen(true)}>
              <Merge className="mr-2 h-4 w-4" />
              Unificar todos ({groups.length})
            </Button>
          </div>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Procurar por nome ou código..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <p className="text-sm text-muted-foreground">A carregar produtos...</p>}
        {!loading && groups.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum duplicado encontrado.</p>
        )}
        {groups.map((g) => {
          const keepId = defaultKeep(g);
          const totalStock = g.items.reduce((s, i) => s + (i.current_stock || 0), 0);
          return (
            <div key={g.key} className="rounded-lg border p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{g.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.items.length} registos · stock total {totalStock} un
                  </p>
                </div>
                <Button size="sm" onClick={() => setPending(g)}>
                  <Merge className="mr-2 h-4 w-4" />
                  Unificar
                </Button>
              </div>
              <RadioGroup
                value={keepId}
                onValueChange={(v) => setKeepChoice((prev) => ({ ...prev, [g.key]: v }))}
                className="space-y-2"
              >
                {g.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 rounded-md bg-muted/40 px-3 py-2">
                    <RadioGroupItem value={item.id} id={item.id} />
                    <Label htmlFor={item.id} className="flex flex-1 flex-wrap items-center gap-2 cursor-pointer">
                      <span className="font-mono text-xs">{item.code}</span>
                      <span className="text-sm text-muted-foreground truncate">{item.name}</span>
                      <Badge variant="outline" className="ml-auto text-xs">{item.current_stock} un</Badge>
                      <Badge variant="secondary" className="text-xs">{item.total_colis} coli(s)</Badge>
                      {item.location && <Badge variant="outline" className="text-xs">{item.location}</Badge>}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                Por defeito mantém-se o código novo (COL/CAM). O stock é somado no registo mantido — nada é perdido.
              </p>

            </div>
          );
        })}
      </CardContent>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unificar duplicados?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending && (
                <>
                  Manter <strong>{pending.items.find((i) => i.id === defaultKeep(pending))?.code}</strong> e
                  transferir contagens, movimentos e histórico dos restantes{' '}
                  {pending.items.length - 1} registo(s). Esta ação não pode ser revertida.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleMerge(); }}
              disabled={merging}
            >
              {merging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Unificar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkOpen} onOpenChange={(o) => !o && setBulkOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unificar todos os duplicados?</AlertDialogTitle>
            <AlertDialogDescription>
              {groups.length} grupo(s) serão unificados mantendo sempre o código novo (COL/CAM). Stock,
              contagens, movimentos e histórico são transferidos e somados no registo mantido. Esta ação não pode ser revertida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleMergeAll(); }} disabled={merging}>
              {merging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Unificar todos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </Card>
  );
}
