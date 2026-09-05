import { useMemo, useState } from 'react';
import { PackageX, Search, PackagePlus, AlertOctagon, MapPin, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/layout/StatCard';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { DamageReportDialog } from '@/components/damages/DamageReportDialog';
import { useOrphanColis, OrphanProduct } from '@/hooks/useOrphanColis';
import { useDamages } from '@/hooks/useDamages';
import { useProducts } from '@/hooks/useProducts';

export function OrphanColisView() {
  const { products, flags, isLoading, flagOrdered, clearFlag } = useOrphanColis();
  const { reportDamage } = useDamages();
  const { products: allProducts } = useProducts();
  const [search, setSearch] = useState('');
  const [flagTarget, setFlagTarget] = useState<OrphanProduct | null>(null);
  const [note, setNote] = useState('');
  const [damageTarget, setDamageTarget] = useState<OrphanProduct | null>(null);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return products;
    return products.filter(p =>
      p.code.toLowerCase().includes(term) || p.name.toLowerCase().includes(term));
  }, [products, search]);

  const totals = useMemo(() => ({
    produtos: products.length,
    unidades: products.reduce((s, p) => s + p.orphan_units, 0),
    sinalizados: flags.length,
  }), [products, flags]);

  const flagsByProduct = useMemo(() => {
    const m = new Map<string, typeof flags>();
    flags.forEach(f => {
      const arr = m.get(f.product_id) || [];
      arr.push(f);
      m.set(f.product_id, arr);
    });
    return m;
  }, [flags]);

  const damageProduct = damageTarget
    ? allProducts.find(p => p.id === damageTarget.product_id) || null
    : null;

  return (
    <PageContainer>
      <PageHeader
        icon={<PackageX className="h-5 w-5" />}
        title="Colis Órfãos"
        description="Unidades que existem na prateleira mas não formam conjunto completo"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Produtos afetados" value={totals.produtos} icon={<PackageX className="h-5 w-5" />} tone="warning" />
        <StatCard label="Unidades órfãs" value={totals.unidades} icon={<PackagePlus className="h-5 w-5" />} tone="danger" />
        <StatCard label="Sinalizados ao fornecedor" value={totals.sinalizados} icon={<Clock className="h-5 w-5" />} tone="primary" />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Procurar por código ou nome"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-border-subtle">
          <CardContent className="py-12 text-center text-muted-foreground">
            Não há colis órfãos por resolver.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => {
            const pFlags = flagsByProduct.get(p.product_id) || [];
            return (
              <Card key={p.product_id} className="border-border-subtle">
                <CardContent className="py-4 space-y-3">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.code} · {p.category} · {p.total_colis} colis
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge variant="destructive">{p.orphan_units} unidades órfãs</Badge>
                        <Badge variant="outline">{p.complete_sets} conjuntos completos</Badge>
                        <Badge variant="outline">{p.physical_units} unidades físicas</Badge>
                        <Badge variant="secondary">
                          Falta coli {p.missing_colis.join(', ')}
                        </Badge>
                        {p.oldest_at && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            há {formatDistanceToNow(new Date(p.oldest_at), { locale: pt })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => { setFlagTarget(p); setNote(''); }}>
                        <PackagePlus className="h-4 w-4 mr-1" />
                        Coli encomendado
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDamageTarget(p)}>
                        <AlertOctagon className="h-4 w-4 mr-1" />
                        Abrir avaria
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {p.colis.map(c => (
                      <div key={c.colis_number} className="rounded-md border border-border-subtle p-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Coli {c.colis_number}</span>
                          <span className="tabular-nums">{c.quantity} un.</span>
                        </div>
                        <div className="mt-1 space-y-0.5 text-muted-foreground">
                          {c.locations.length === 0 ? (
                            <span>Sem stock</span>
                          ) : c.locations.map(l => (
                            <div key={l.location} className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate">{l.location}</span>
                              <span className="ml-auto tabular-nums">{l.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {pFlags.length > 0 && (
                    <div className="space-y-1">
                      {pFlags.map(f => (
                        <div key={f.id} className="flex items-center gap-2 text-xs rounded-md bg-muted/50 px-2 py-1">
                          <PackagePlus className="h-3 w-3" />
                          <span>
                            Coli {f.missing_coli ?? '—'} encomendado ao fornecedor
                            {f.note ? ` · ${f.note}` : ''}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ml-auto h-6 text-xs"
                            onClick={() => clearFlag.mutate(f.id)}
                          >
                            Remover
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!flagTarget} onOpenChange={(o) => !o && setFlagTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Coli encomendado ao fornecedor</DialogTitle>
            <DialogDescription>
              Sinaliza que o coli em falta já foi pedido. O stock não é movido.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nota</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex: encomenda 4512, chegada prevista 20/09"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFlagTarget(null)}>Cancelar</Button>
            <Button
              onClick={async () => {
                if (!flagTarget) return;
                await flagOrdered.mutateAsync({
                  productId: flagTarget.product_id,
                  missingColi: flagTarget.missing_colis[0] ?? null,
                  note,
                });
                setFlagTarget(null);
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {damageProduct && (
        <DamageReportDialog
          open={!!damageTarget}
          onOpenChange={(o) => !o && setDamageTarget(null)}
          product={damageProduct}
          onSubmit={async (data) => {
            await reportDamage(data);
            setDamageTarget(null);
          }}
        />
      )}
    </PageContainer>
  );
}
