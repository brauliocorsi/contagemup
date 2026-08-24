import { useCallback, useRef, useState } from 'react';
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
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { LoginForm } from '@/components/auth/LoginForm';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ProductInquiryModule } from '@/components/scanner/ProductInquiryModule';
import { TransferModule } from '@/components/scanner/TransferModule';
import { PickingModule } from '@/components/scanner/PickingModule';
import { EntryModule } from '@/components/scanner/EntryModule';
import { PrintCenterModule } from '@/components/scanner/PrintCenterModule';
import { SupplierCodeModule } from '@/components/scanner/SupplierCodeModule';
import { CountingModule } from '@/components/scanner/CountingModule';
import { parseCommand, SCANNER_MODES, type QtyHandler, type ScannerMode } from '@/lib/scanner/commands';
import { printCommandSheet } from '@/lib/scanner/labels';
import { toast } from 'sonner';

type View = 'home' | ScannerMode | 'impressao' | 'fornecedor' | 'contagem';

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
    id: 'contagem',
    label: 'Contagem',
    description: 'Conferir localizações atribuídas',
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
  { id: 'transferencia', label: 'Transf.', icon: ArrowRightLeft },
  { id: 'picking', label: 'Picking', icon: ClipboardList },
  { id: 'entradas', label: 'Entradas', icon: PackagePlus },
  { id: 'contagem', label: 'Contagem', icon: ClipboardCheck },
];

export default function ScannerApp() {
  const { user, loading } = useAuth();
  const [view, setView] = useState<View>('home');
  /** O módulo ativo regista aqui o seu handler de quantidade. */
  const qtyHandlerRef = useRef<QtyHandler | null>(null);
  const registerQtyHandler = useCallback((h: QtyHandler | null) => {
    qtyHandlerRef.current = h;
  }, []);

  /** Comandos globais lidos em qualquer módulo. Devolve true se consumiu a leitura. */
  const handleCommand = useCallback((raw: string) => {
    const cmd = parseCommand(raw);
    if (!cmd) return false;

    if (cmd.command === 'MODE' && cmd.value) {
      setView(cmd.value as ScannerMode);
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
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <LoginForm />;

  const current = OPERATIONS.find((o) => o.id === view);

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
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
            <h1 className="truncate text-base font-semibold leading-tight">Scanner de Armazém</h1>
            <p className="truncate text-[11px] text-muted-foreground">
              {current?.label ?? 'Operações'}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setView('impressao')} aria-label="Imprimir códigos">
            <Printer className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" asChild aria-label="Voltar à aplicação">
            <Link to="/">
              <Home className="h-5 w-5" />
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-4">
        {view === 'home' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Escolhe a operação:</p>
            <div className="grid grid-cols-2 gap-3">
              {OPERATIONS.map((op) => {
                const Icon = op.icon;
                return (
                  <button
                    key={op.id}
                    onClick={() => setView(op.id)}
                    className="flex flex-col items-start gap-2 rounded-xl border bg-card p-4 text-left shadow-sm transition-all active:scale-[0.98] hover:border-primary/40 hover:shadow-md"
                  >
                    <span className={cn('rounded-lg p-2.5', op.accent)}>
                      <Icon className="h-6 w-6" />
                    </span>
                    <span className="text-sm font-semibold leading-tight">{op.label}</span>
                    <span className="text-[11px] leading-snug text-muted-foreground">{op.description}</span>
                  </button>
                );
              })}
            </div>
            <Button variant="outline" className="w-full" onClick={() => printCommandSheet('a4')}>
              <Printer className="mr-2 h-4 w-4" />
              Folha de comandos (códigos de barras)
            </Button>
          </div>
        )}
        {view === 'consulta' && <ProductInquiryModule onCommand={handleCommand} />}
        {view === 'transferencia' && <TransferModule onCommand={handleCommand} />}
        {view === 'picking' && <PickingModule onCommand={handleCommand} registerQtyHandler={registerQtyHandler} />}
        {view === 'entradas' && <EntryModule onCommand={handleCommand} registerQtyHandler={registerQtyHandler} />}
        {view === 'contagem' && <CountingModule onCommand={handleCommand} registerQtyHandler={registerQtyHandler} />}
        {view === 'fornecedor' && <SupplierCodeModule onCommand={handleCommand} />}
        {view === 'impressao' && <PrintCenterModule />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-6">
          {NAV.map((m) => {
            const Icon = m.icon;
            const active = view === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setView(m.id)}
                className={cn(
                  'flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className={cn('h-5 w-5', active && 'scale-110')} />
                {m.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
