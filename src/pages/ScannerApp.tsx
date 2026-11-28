import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ScanBarcode,
  Search,
  ArrowRightLeft,
  ClipboardList,
  PackagePlus,
  Home,
  Printer,
  ChevronLeft,
  Loader2,
  LayoutGrid,
  Tags,
  ClipboardCheck,
  Truck,
  Boxes,
  LogOut,
  ShoppingCart,
  ArrowRight,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { LoginForm } from '@/components/auth/LoginForm';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { ProductInquiryModule } from '@/components/scanner/ProductInquiryModule';
import { TransferModule } from '@/components/scanner/TransferModule';
import { PickingModule } from '@/components/scanner/PickingModule';
import { EntryModule } from '@/components/scanner/EntryModule';
import { PrintCenterModule } from '@/components/scanner/PrintCenterModule';
import { PurchaseLabelsModule } from '@/components/scanner/PurchaseLabelsModule';
import { SupplierCodeModule } from '@/components/scanner/SupplierCodeModule';
import { CountingModule } from '@/components/scanner/CountingModule';
import { useMyLocationAudits } from '@/hooks/useLocationAudits';
import { LoadingModule } from '@/components/scanner/LoadingModule';
import { PutawayModule } from '@/components/scanner/PutawayModule';
import { parseCommand, SCANNER_MODES, type QtyHandler, type ScannerMode } from '@/lib/scanner/commands';
import { printCommandSheet } from '@/lib/scanner/labels';
import { toast } from 'sonner';

type View = 'home' | ScannerMode | 'impressao' | 'fornecedor' | 'contagem' | 'carregamento' | 'arrumacao' | 'compras';

const OPERATIONS: Array<{
  id: View;
  label: string;
  description: string;
  icon: typeof Search;
  accent: string;
}> = [
  {
    id: 'consulta',
    label: 'Consulta',
    description: 'Stock, localização e reservas',
    icon: Search,
    accent: 'bg-primary/10 text-primary',
  },
  {
    id: 'transferencia',
    label: 'Transferência',
    description: 'Mover produtos e colis entre locais',
    icon: ArrowRightLeft,
    accent: 'bg-info-soft text-info',
  },
  {
    id: 'picking',
    label: 'Picking',
    description: 'Separação e conferência de saídas',
    icon: ClipboardList,
    accent: 'bg-success-soft text-success',
  },
  {
    id: 'entradas',
    label: 'Entradas',
    description: 'Conferência de entradas e fornecedor',
    icon: PackagePlus,
    accent: 'bg-primary-soft text-primary',
  },
  {
    id: 'arrumacao',
    label: 'Arrumação',
    description: 'Conferência → localização final',
    icon: Boxes,
    accent: 'bg-warning-soft text-warning',
  },
  {
    id: 'carregamento',
    label: 'Carregamento',
    description: 'Cais → carrinha, conferência por nota',
    icon: Truck,
    accent: 'bg-info-soft text-info',
  },
  {
    id: 'contagem',
    label: 'Conferências',
    description: 'Conferir localizações (só conferências)',
    icon: ClipboardCheck,
    accent: 'bg-success-soft text-success',
  },
  {
    id: 'fornecedor',
    label: 'Cód. Fornecedor',
    description: 'Associar códigos de barras do fornecedor',
    icon: Tags,
    accent: 'bg-warning-soft text-warning',
  },
  {
    id: 'compras',
    label: 'Compras',
    description: 'Puxar compra do GestãoClick e imprimir etiquetas',
    icon: ShoppingCart,
    accent: 'bg-primary-soft text-primary',
  },
  {
    id: 'impressao',
    label: 'Imprimir códigos',
    description: 'Comandos, locais e produtos',
    icon: Printer,
    accent: 'bg-muted text-foreground',
  },
];

const NAV: Array<{ id: View; label: string; icon: typeof Search }> = [
  { id: 'home', label: 'Início', icon: LayoutGrid },
  { id: 'consulta', label: 'Consulta', icon: Search },
  { id: 'picking', label: 'Picking', icon: ClipboardList },
  { id: 'arrumacao', label: 'Arrumar', icon: Boxes },
  { id: 'carregamento', label: 'Carga', icon: Truck },
];

export default function ScannerApp() {
  const { user, loading, profile, signOut } = useAuth();
  const { ready, isWarehouseOperator, canUseScanner } = useRoleAccess();
  const { data: myAudits = [] } = useMyLocationAudits();
  /** A contagem só existe quando há conferência aberta e atribuída a este utilizador. */
  const canCount = myAudits.length > 0;
  const [view, setView] = useState<View>('home');
  const [toolsOpen, setToolsOpen] = useState(false);
  /** O módulo ativo regista aqui o seu handler de quantidade. */
  const qtyHandlerRef = useRef<QtyHandler | null>(null);
  const registerQtyHandler = useCallback((h: QtyHandler | null) => {
    qtyHandlerRef.current = h;
  }, []);

  /** Módulos vedados ao operador de armazém (também por comando CMD-MODE). */
  const blockedViews = useMemo<View[]>(() => (isWarehouseOperator ? ['fornecedor'] : []), [isWarehouseOperator]);

  const goTo = useCallback(
    (next: View) => {
      if (blockedViews.includes(next)) {
        toast.error('Sem permissão para este módulo');
        return;
      }
      setView(next);
    },
    [blockedViews],
  );

  /** Comandos globais lidos em qualquer módulo. Devolve true se consumiu a leitura. */
  const handleCommand = useCallback((raw: string) => {
    const cmd = parseCommand(raw);
    if (!cmd) return false;

    if (cmd.command === 'MODE' && cmd.value) {
      const target = cmd.value as ScannerMode;
      if (blockedViews.includes(target)) {
        toast.error('Sem permissão para este módulo');
        return true;
      }
      setView(target);
      toast.success(`Módulo: ${SCANNER_MODES.find((m) => m.id === cmd.value)?.label}`);
      return true;
    }
    if (cmd.command === 'PRINT') {
      printCommandSheet('a4');
      return true;
    }
    if (cmd.command === 'BACK') {
      setView('home');
      return true;
    }
    if (cmd.command === 'QTY+' || cmd.command === 'QTY-') {
      const handler = qtyHandlerRef.current;
      if (!handler) {
        toast.info('Comando de quantidade indisponível neste módulo');
        return true;
      }
      if (cmd.value) handler({ set: Number(cmd.value) });
      else handler({ delta: cmd.command === 'QTY+' ? 1 : -1 });
      return true;
    }
    toast.info(`Comando ${cmd.command}`);
    return true;
  }, [blockedViews]);

  if (loading || (user && !ready)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <LoginForm />;

  if (!canUseScanner) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-muted-foreground">A sua conta não tem acesso ao scanner de armazém.</p>
        <Button variant="outline" onClick={() => void signOut()}>
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </Button>
      </div>
    );
  }

  const operations = OPERATIONS.filter(
    (o) => !blockedViews.includes(o.id),
  );
  const navItems = NAV.filter((n) => !blockedViews.includes(n.id));
  const current = operations.find((o) => o.id === view);


  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          {view === 'home' ? (
            <ScanBarcode className="h-5 w-5 text-primary" />
          ) : (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setView('home')} aria-label="Voltar ao início">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-heading text-lg font-semibold leading-tight">{current?.label ?? 'Scanner de Armazém'}</h1>
            <p className="truncate text-[11px] text-muted-foreground">
              {view === 'home' ? 'UP Móveis' : 'Scanner de Armazém'}
            </p>
          </div>
          <div className="hidden max-w-[9rem] truncate text-right text-[11px] text-muted-foreground sm:block">
            {profile?.name ?? user.email}
          </div>
          <Button variant="ghost" size="icon" onClick={() => goTo('impressao')} aria-label="Imprimir códigos">
            <Printer className="h-5 w-5" />
          </Button>
          {isWarehouseOperator ? (
            <Button variant="ghost" size="icon" onClick={() => void signOut()} aria-label="Sair">
              <LogOut className="h-5 w-5" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon" asChild aria-label="Voltar à aplicação">
              <Link to="/">
                <Home className="h-5 w-5" />
              </Link>
            </Button>
          )}

        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-4">
        {view === 'home' && (
          <div className="space-y-7">
            <div className="border-b border-border-subtle pb-5 pt-2">
              <p className="text-xs text-muted-foreground">{profile?.name ?? 'Armazém UP Móveis'}</p>
              <h2 className="mt-1 font-heading text-2xl font-semibold">Operações do armazém</h2>
            </div>
            <section aria-labelledby="scanner-dispatch">
              <h3 id="scanner-dispatch" className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Expedição</h3>
              <div className="grid grid-cols-2 gap-3">
                {operations.filter(op => ['picking', 'carregamento'].includes(op.id)).map(op => <Button key={op.id} variant="outline" onClick={() => goTo(op.id)} className="group h-36 min-w-0 flex-col items-start justify-between whitespace-normal rounded-lg border-border-subtle bg-card p-4 text-left hover:border-primary/40 hover:bg-surface-muted">
                  <span className="flex w-full items-center justify-between"><span className={cn('flex h-10 w-10 items-center justify-center rounded-md', op.accent)}><op.icon className="h-5 w-5" /></span><ArrowRight className="text-muted-foreground" /></span>
                  <span className="block text-base font-semibold">{op.label}</span>
                </Button>)}
              </div>
            </section>
            <section aria-labelledby="scanner-receiving">
              <h3 id="scanner-receiving" className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Receber e arrumar</h3>
              <div className="grid grid-cols-3 gap-2">
                {operations.filter(op => ['entradas', 'arrumacao', 'transferencia'].includes(op.id)).map(op => <Button key={op.id} variant="outline" onClick={() => goTo(op.id)} className="h-24 min-w-0 flex-col gap-3 whitespace-normal rounded-lg border-border-subtle bg-card px-2 text-center hover:bg-surface-muted"><op.icon className="h-5 w-5 text-primary" /><span className="text-xs sm:text-sm">{op.label}</span></Button>)}
              </div>
            </section>
            <section aria-labelledby="scanner-stock">
              <h3 id="scanner-stock" className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Stock e conferência</h3>
              <div className="divide-y divide-border-subtle border-y border-border-subtle">
                {operations.filter(op => ['consulta', 'contagem'].includes(op.id)).map(op => <Button key={op.id} variant="ghost" onClick={() => goTo(op.id)} className="h-16 w-full justify-start gap-3 rounded-none px-2"><op.icon className="text-primary" /><span className="flex-1 text-left">{op.id === 'consulta' ? 'Consultar stock' : op.label}</span>{op.id === 'contagem' && myAudits.length > 0 && <Badge variant="secondary">{myAudits.length}</Badge>}<ArrowRight className="text-muted-foreground" /></Button>)}
              </div>
            </section>
            <Collapsible open={toolsOpen} onOpenChange={setToolsOpen}>
              <CollapsibleTrigger asChild><Button variant="ghost" className="h-12 w-full justify-between px-2 text-muted-foreground">Ferramentas e etiquetas<ChevronDown className={cn('transition-transform', toolsOpen && 'rotate-180')} /></Button></CollapsibleTrigger>
              <CollapsibleContent className="divide-y divide-border-subtle">
                {operations.filter(op => ['impressao', 'compras', 'fornecedor'].includes(op.id)).map(op => <Button key={op.id} variant="ghost" onClick={() => goTo(op.id)} className="h-14 w-full justify-start gap-3 rounded-none px-2"><op.icon /><span className="flex-1 text-left">{op.label}</span><ArrowRight className="text-muted-foreground" /></Button>)}
                <Button variant="ghost" className="h-14 w-full justify-start gap-3 rounded-none px-2" onClick={() => printCommandSheet('a4')}><Printer />Folha de comandos</Button>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
        {view === 'consulta' && <ProductInquiryModule onCommand={handleCommand} />}
        {view === 'transferencia' && <TransferModule onCommand={handleCommand} />}
        {view === 'picking' && <PickingModule onCommand={handleCommand} registerQtyHandler={registerQtyHandler} />}
        {view === 'entradas' && <EntryModule onCommand={handleCommand} registerQtyHandler={registerQtyHandler} />}
        {view === 'arrumacao' && <PutawayModule onCommand={handleCommand} />}
        {view === 'carregamento' && <LoadingModule onCommand={handleCommand} />}
        {view === 'contagem' && (canCount ? <CountingModule onCommand={handleCommand} registerQtyHandler={registerQtyHandler} /> : (
          <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
            <ClipboardCheck className="mx-auto mb-2 h-8 w-8 opacity-50" />
            Sem conferências abertas atribuídas a si.
          </div>
        ))}
        {view === 'fornecedor' && !isWarehouseOperator && <SupplierCodeModule onCommand={handleCommand} />}
        {view === 'compras' && <PurchaseLabelsModule onCommand={handleCommand} />}
        {view === 'impressao' && <PrintCenterModule />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {navItems.map((m) => {
            const Icon = m.icon;
            const active = view === m.id;
            return (
              <Button
                variant="ghost"
                key={m.id}
                onClick={() => goTo(m.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'h-16 min-w-0 flex-col items-center gap-1 rounded-none px-1 py-2 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className={cn('h-5 w-5', active && 'scale-110')} />
                {m.label}
              </Button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
