// MÓDULO EXPERIMENTAL REMOVÍVEL — "Necessidades de Compra — Testes".
// SOMENTE LEITURA + simulação local. Nunca cria/edita compras, vendas, produtos, stock ou movimentos.
// Remoção: apagar src/components/purchase-needs-lab, src/lib/purchase-needs-lab,
// supabase/functions/needs-lab-gc e o item 'needs-lab' do menu (AppSidebar + Dashboard).
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  AlertTriangle, Download, FlaskConical, Loader2, RefreshCw, Trash2, ChevronRight, ChevronDown, Save,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { computeNeeds, diffSnapshots } from '@/lib/purchase-needs-lab/engine';
import { buildEngineInput, type GcSnapshot } from '@/lib/purchase-needs-lab/mapping';
import {
  clearLabState, downloadCsv, emptyLabState, loadLabState, saveLabState, toCsv, type LabState,
} from '@/lib/purchase-needs-lab/localState';
import { usePhysicalCoverage } from './usePhysicalCoverage';
import { GuidedSimulationPanel } from './GuidedSimulationPanel';

interface Situacao { id: string; nome: string }

export function PurchaseNeedsLabView() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [state, setState] = useState<LabState>(emptyLabState);
  const [snapshot, setSnapshot] = useState<GcSnapshot | null>(null);
  const [situacoes, setSituacoes] = useState<{ vendas: Situacao[]; compras: Situacao[] } | null>(null);
  const [busca, setBusca] = useState('');
  const [fornecedorFiltro, setFornecedorFiltro] = useState('');
  const [soFaltas, setSoFaltas] = useState(true);
  const [aberto, setAberto] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (user?.id) setState(loadLabState(user.id));
  }, [user?.id]);

  const update = (patch: Partial<LabState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      saveLabState(user?.id, next);
      return next;
    });
  };

  const physical = usePhysicalCoverage(isAdmin);

  const situacoesMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('needs-lab-gc', { body: { action: 'situacoes' } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { situacoesVendas: Situacao[]; situacoesCompras: Situacao[]; quality: { errors: string[] } };
    },
    onSuccess: (d) => {
      setSituacoes({ vendas: d.situacoesVendas ?? [], compras: d.situacoesCompras ?? [] });
      if (d.quality?.errors?.length) toast.warning(d.quality.errors[0]);
    },
    onError: (e: Error) => toast.error(`Não foi possível ler as situações: ${e.message}`),
  });

  const snapshotMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('needs-lab-gc', {
        body: {
          action: 'snapshot',
          vendaSituacaoIds: state.vendaSituacaoIds,
          compraSituacaoIds: state.compraSituacaoIds,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as GcSnapshot;
    },
    onSuccess: (d) => {
      setSnapshot(d);
      toast.success('Dados carregados (só leitura).');
    },
    onError: (e: Error) => toast.error(`Falha ao carregar: ${e.message}`),
  });

  const input = useMemo(
    () => buildEngineInput(snapshot, state, physical.data?.map ?? null),
    [snapshot, state, physical.data],
  );
  const output = useMemo(() => computeNeeds(input), [input]);
  const deltas = useMemo(() => diffSnapshots(state.snapshot, output), [state.snapshot, output]);

  const fornecedores = useMemo(
    () => Array.from(new Set(output.groups.flatMap((g) => g.fornecedores))).sort(),
    [output],
  );

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return output.groups.filter((g) => {
      if (soFaltas && g.faltaComprar <= 0 && !g.incompleto) return false;
      if (fornecedorFiltro && !g.fornecedores.includes(fornecedorFiltro)) return false;
      if (q && !`${g.codigo} ${g.nome} ${g.detalhes}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [output, busca, soFaltas, fornecedorFiltro]);

  const exportar = () => {
    const rows = linhas.map((g) => ({
      codigo: g.codigo,
      nome: g.nome,
      configuracao: g.detalhes,
      fornecedores: g.fornecedores.join(' | '),
      pendente_entregar: g.pendente,
      cobertura_fisica_livre: g.coberturaFisica,
      cobertura_fisica_usada: g.coberturaFisicaUsada,
      compras_por_receber: g.comprasPorReceber,
      compras_usadas: g.comprasUsadas,
      falta_comprar_calculado: g.faltaComprar,
      compraria_manualmente: state.manualBuy[g.groupKey]?.quantidade ?? '',
      diferenca:
        state.manualBuy[g.groupKey]?.quantidade == null
          ? ''
          : (state.manualBuy[g.groupKey]!.quantidade as number) - g.faltaComprar,
      nota: state.manualBuy[g.groupKey]?.nota ?? '',
      dados_incompletos: g.incompleto ? 'sim' : 'não',
      revisao: g.review.join(' | '),
    }));
    if (rows.length === 0) return toast.error('Nada para exportar.');
    downloadCsv(`necessidades-compra-testes-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  };

  if (!isAdmin) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Sem permissão</AlertTitle>
        <AlertDescription>Este ambiente de testes está reservado a administradores.</AlertDescription>
      </Alert>
    );
  }

  const q = snapshot?.quality;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Necessidades de Compra — Testes"
        description="Ambiente experimental de simulação, separado do trabalho real."
      />

      <Alert>
        <FlaskConical className="h-4 w-4" />
        <AlertTitle>Ambiente de testes — não altera stock nem cria compras</AlertTitle>
        <AlertDescription>
          Tudo aqui é leitura e simulação. Nada é gravado no GestãoClick nem no stock. Os ajustes manuais ficam
          guardados apenas neste navegador e na sua conta.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados e cálculo</TabsTrigger>
          <TabsTrigger value="simulacao">Simulação guiada (fictícia)</TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">1. Escolher o que conta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => situacoesMut.mutate()} disabled={situacoesMut.isPending}>
                  {situacoesMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Ler situações reais
                </Button>
                <span className="text-sm text-muted-foreground">
                  As situações são lidas ao sistema — nada é adivinhado.
                </span>
              </div>

              {situacoes && (
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-sm font-medium">Vendas que contam como procura</p>
                    <div className="max-h-56 space-y-1.5 overflow-auto rounded-md border p-2">
                      {situacoes.vendas.map((s) => (
                        <label key={s.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={state.vendaSituacaoIds.includes(s.id)}
                            onCheckedChange={(v) =>
                              update({
                                vendaSituacaoIds: v
                                  ? [...state.vendaSituacaoIds, s.id]
                                  : state.vendaSituacaoIds.filter((x) => x !== s.id),
                              })
                            }
                          />
                          <span className="flex-1">{s.nome}</span>
                          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Checkbox
                              checked={state.situacoesParciaisIds.includes(s.id)}
                              onCheckedChange={(v) =>
                                update({
                                  situacoesParciaisIds: v
                                    ? [...state.situacoesParciaisIds, s.id]
                                    : state.situacoesParciaisIds.filter((x) => x !== s.id),
                                })
                              }
                            />
                            entregas parciais
                          </label>
                        </label>
                      ))}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Marque "entregas parciais" nas situações onde já pode ter havido entregas: nessas, a quantidade
                      em falta é pedida linha a linha em vez de assumida.
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium">Compras consideradas por receber</p>
                    <div className="max-h-56 space-y-1.5 overflow-auto rounded-md border p-2">
                      {situacoes.compras.length === 0 && (
                        <p className="text-sm text-muted-foreground">Sem situações de compras disponíveis.</p>
                      )}
                      {situacoes.compras.map((s) => (
                        <label key={s.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={state.compraSituacaoIds.includes(s.id)}
                            onCheckedChange={(v) =>
                              update({
                                compraSituacaoIds: v
                                  ? [...state.compraSituacaoIds, s.id]
                                  : state.compraSituacaoIds.filter((x) => x !== s.id),
                              })
                            }
                          />
                          <span>{s.nome}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">2. Carregar dados reais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => snapshotMut.mutate()}
                  disabled={snapshotMut.isPending || state.vendaSituacaoIds.length === 0}
                >
                  {snapshotMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Carregar dados
                </Button>
                {snapshot && (
                  <span className="text-sm text-muted-foreground">
                    Atualizado às {new Date(snapshot.generatedAt).toLocaleString('pt-PT')}
                  </span>
                )}
                {physical.isFetching && <span className="text-sm text-muted-foreground">A ler o físico…</span>}
              </div>

              {state.vendaSituacaoIds.length === 0 && (
                <p className="text-sm text-muted-foreground">Escolha pelo menos uma situação de venda.</p>
              )}

              {q && (
                <div className="space-y-2 rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={q.complete ? 'secondary' : 'destructive'}>
                      {q.complete ? 'Leitura completa' : 'Leitura incompleta — resultados parciais'}
                    </Badge>
                    <Badge variant="outline">
                      Vendas: {q.vendasPaginasLidas}/{q.vendasPaginasTotal} páginas
                    </Badge>
                    <Badge variant="outline">
                      Compras: {q.comprasPaginasLidas}/{q.comprasPaginasTotal} páginas
                    </Badge>
                    <Badge variant="outline">Quantidade recebida nas compras: não confirmada pela API</Badge>
                  </div>
                  {[...q.errors, ...q.notes].map((m, i) => (
                    <p key={i} className="text-muted-foreground">• {m}</p>
                  ))}
                </div>
              )}

              {physical.data && (
                <p className="text-sm text-muted-foreground">
                  Físico lido do Contagem: {physical.data.produtos} produtos, {physical.data.contagens} registos de
                  contagem, {physical.data.localizacoesLivres} localizações de stock livres (quarentena, cais, viatura,
                  conferência e zonas livres não contam).
                </p>
              )}
              {physical.isError && (
                <p className="text-sm text-destructive">
                  Não foi possível ler o stock físico — a cobertura física fica por verificar em vez de ser assumida.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                <span>3. Resultado simulado</span>
                <span className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={exportar}>
                    <Download className="mr-2 h-4 w-4" /> Exportar CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      update({ snapshot: output, snapshotAt: new Date().toISOString() });
                      toast.success('Referência guardada para comparação.');
                    }}
                  >
                    <Save className="mr-2 h-4 w-4" /> Guardar referência
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      clearLabState(user?.id);
                      setState(emptyLabState);
                      setSnapshot(null);
                      toast.success('Simulação limpa. Nenhum dado de negócio foi tocado.');
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Limpar simulação
                  </Button>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <Stat label="Pendente de entregar" value={output.totals.pendente} />
                <Stat label="Falta comprar" value={output.totals.faltaComprar} />
                <Stat label="Grupos incompletos" value={output.totals.gruposIncompletos} />
                <Stat label="Grupos a rever" value={output.totals.gruposComRevisao} />
              </div>

              {state.snapshotAt && (
                <div className="rounded-md border p-3 text-sm">
                  <p className="font-medium">
                    Alterações desde a referência de {new Date(state.snapshotAt).toLocaleString('pt-PT')}
                  </p>
                  {deltas.length === 0 ? (
                    <p className="text-muted-foreground">Sem alterações — o cálculo repetido não acumula.</p>
                  ) : (
                    deltas.slice(0, 15).map((d) => (
                      <p key={d.groupKey} className="text-muted-foreground">
                        • {d.codigo || d.nome}: {d.anterior} → {d.atual} ({d.delta > 0 ? '+' : ''}
                        {d.delta})
                      </p>
                    ))
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Procurar por código, nome ou configuração"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="max-w-sm"
                />
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={fornecedorFiltro}
                  onChange={(e) => setFornecedorFiltro(e.target.value)}
                >
                  <option value="">Todos os fornecedores (ligação verificada)</option>
                  {fornecedores.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={soFaltas} onCheckedChange={(v) => setSoFaltas(!!v)} />
                  Só faltas e casos a confirmar
                </label>
              </div>

              <div className="overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Produto / configuração</TableHead>
                      <TableHead className="text-right">Pendente</TableHead>
                      <TableHead className="text-right">Físico livre</TableHead>
                      <TableHead className="text-right">Por receber</TableHead>
                      <TableHead className="text-right">Falta comprar</TableHead>
                      <TableHead className="text-right">Eu compraria</TableHead>
                      <TableHead className="text-right">Diferença</TableHead>
                      <TableHead>Nota</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                          Sem linhas. Carregue dados reais ou use a simulação guiada.
                        </TableCell>
                      </TableRow>
                    )}
                    {linhas.map((g) => {
                      const manual = state.manualBuy[g.groupKey];
                      const diff = manual?.quantidade == null ? null : manual.quantidade - g.faltaComprar;
                      const open = !!aberto[g.groupKey];
                      return (
                        <Fragment key={g.groupKey}>
                          <TableRow>
                            <TableCell>
                              <button
                                type="button"
                                onClick={() => setAberto((p) => ({ ...p, [g.groupKey]: !open }))}
                                aria-label="Ver detalhe"
                              >
                                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </button>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{g.codigo || '(sem código)'}</div>
                              <div className="text-xs text-muted-foreground">{g.nome}{g.detalhes ? ` · ${g.detalhes}` : ''}</div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {g.incompleto && <Badge variant="destructive" className="text-[10px]">Incompleto</Badge>}
                                {g.review.length > 0 && <Badge variant="outline" className="text-[10px]">A rever</Badge>}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{g.pendente}</TableCell>
                            <TableCell className="text-right">{g.coberturaFisica}</TableCell>
                            <TableCell className="text-right">{g.comprasPorReceber}</TableCell>
                            <TableCell className="text-right font-semibold">{g.faltaComprar}</TableCell>
                            <TableCell className="text-right">
                              <Input
                                className="ml-auto h-8 w-20 text-right"
                                inputMode="numeric"
                                value={manual?.quantidade ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value.trim();
                                  update({
                                    manualBuy: {
                                      ...state.manualBuy,
                                      [g.groupKey]: { quantidade: v === '' ? null : Number(v), nota: manual?.nota },
                                    },
                                  });
                                }}
                              />
                            </TableCell>
                            <TableCell className={`text-right ${diff && diff !== 0 ? 'text-destructive font-medium' : ''}`}>
                              {diff == null ? '—' : diff > 0 ? `+${diff}` : diff}
                            </TableCell>
                            <TableCell>
                              <Input
                                className="h-8"
                                value={manual?.nota ?? ''}
                                onChange={(e) =>
                                  update({
                                    manualBuy: {
                                      ...state.manualBuy,
                                      [g.groupKey]: { quantidade: manual?.quantidade ?? null, nota: e.target.value },
                                    },
                                  })
                                }
                              />
                            </TableCell>
                          </TableRow>
                          {open && (
                            <TableRow>
                              <TableCell colSpan={9} className="bg-muted/40">
                                <div className="space-y-3 py-2 text-sm">
                                  {g.review.length > 0 && (
                                    <div className="text-amber-700 dark:text-amber-400">
                                      {g.review.map((r, i) => <p key={i}>• {r}</p>)}
                                    </div>
                                  )}
                                  <div>
                                    <p className="font-medium">Vendas (ordem cronológica)</p>
                                    {g.demandas.map((d) => (
                                      <div key={d.line.key} className="flex flex-wrap items-center gap-2 py-1">
                                        <span className="min-w-40">
                                          {d.line.vendaCodigo} · {d.line.data || 'sem data'} · {d.line.cliente}
                                        </span>
                                        <Badge variant="outline" className="text-[10px]">{d.line.situacaoNome}</Badge>
                                        <span>vendido {d.line.quantidade}</span>
                                        <span className="flex items-center gap-1">
                                          pendente
                                          <Input
                                            className="h-7 w-16 text-right"
                                            inputMode="numeric"
                                            placeholder="?"
                                            value={state.manualDemands[d.line.key]?.pendente ?? (d.line.origin === 'gc' && d.line.pendente !== null ? d.line.pendente : '')}
                                            onChange={(e) => {
                                              const v = e.target.value.trim();
                                              update({
                                                manualDemands: {
                                                  ...state.manualDemands,
                                                  [d.line.key]: { pendente: v === '' ? null : Number(v) },
                                                },
                                              });
                                            }}
                                          />
                                        </span>
                                        <span>
                                          coberto {d.coberto} · falta <b>{d.falta}</b>
                                        </span>
                                        <span className="text-muted-foreground">
                                          {d.alocacoes
                                            .map((a) => (a.from === 'fisico' ? `${a.quantidade} do físico` : `${a.quantidade} da compra ${a.compraCodigo}`))
                                            .join(' + ') || 'sem cobertura'}
                                        </span>
                                        {d.incompleto && <Badge variant="destructive" className="text-[10px]">a confirmar</Badge>}
                                      </div>
                                    ))}
                                  </div>
                                  <Separator />
                                  <div>
                                    <p className="font-medium">Compras por receber</p>
                                    {g.fornecimentos.length === 0 && <p className="text-muted-foreground">Nenhuma.</p>}
                                    {g.fornecimentos.map((s) => (
                                      <div key={s.key} className="flex flex-wrap items-center gap-2 py-1">
                                        <span className="min-w-40">
                                          {s.compraCodigo} · {s.data || 'sem data'} · {s.fornecedor || 'fornecedor por confirmar'}
                                        </span>
                                        <span>comprado {s.quantidade}</span>
                                        <span className="flex items-center gap-1">
                                          por receber
                                          <Input
                                            className="h-7 w-16 text-right"
                                            inputMode="numeric"
                                            placeholder="?"
                                            value={state.manualSupplies[s.key]?.porReceber ?? ''}
                                            onChange={(e) => {
                                              const v = e.target.value.trim();
                                              update({
                                                manualSupplies: {
                                                  ...state.manualSupplies,
                                                  [s.key]: { porReceber: v === '' ? null : Number(v) },
                                                },
                                              });
                                            }}
                                          />
                                        </span>
                                        {s.origin === 'manual' ? (
                                          <Badge variant="secondary" className="text-[10px]">manual de teste</Badge>
                                        ) : (
                                          <Badge variant="outline" className="text-[10px]">a confirmar</Badge>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="simulacao">
          <GuidedSimulationPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}

export default PurchaseNeedsLabView;
