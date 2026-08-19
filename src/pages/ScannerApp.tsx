import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { ScanBarcode, Search, ArrowRightLeft, Truck, ClipboardList, PackagePlus, Home, Printer } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { LoginForm } from '@/components/auth/LoginForm';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ProductInquiryModule } from '@/components/scanner/ProductInquiryModule';
import { TransferModule } from '@/components/scanner/TransferModule';
import { PalletModule } from '@/components/scanner/PalletModule';
import { PickingModule } from '@/components/scanner/PickingModule';
import { EntryModule } from '@/components/scanner/EntryModule';
import { parseCommand, SCANNER_MODES, type ScannerMode } from '@/lib/scanner/commands';
import { printCommandSheet } from '@/lib/scanner/labels';
import { toast } from 'sonner';

const MODULE_ICONS: Record<ScannerMode, typeof Search> = {
  consulta: Search,
  transferencia: ArrowRightLeft,
  palete: Truck,
  picking: ClipboardList,
  entradas: PackagePlus,
};

export default function ScannerApp() {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<ScannerMode>('consulta');

  /** Comandos globais lidos em qualquer módulo. Devolve true se consumiu a leitura. */
  const handleCommand = useCallback((raw: string) => {
    const cmd = parseCommand(raw);
    if (!cmd) return false;

    if (cmd.command === 'MODE' && cmd.value) {
      setMode(cmd.value as ScannerMode);
      toast.success(`Módulo: ${SCANNER_MODES.find((m) => m.id === cmd.value)?.label}`);
      return true;
    }
    if (cmd.command === 'PRINT') {
      printCommandSheet('a4');
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

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <ScanBarcode className="h-5 w-5 text-primary" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold leading-tight">Scanner de Armazém</h1>
            <p className="truncate text-[11px] text-muted-foreground">
              {SCANNER_MODES.find((m) => m.id === mode)?.label}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => printCommandSheet('a4')} aria-label="Folha de comandos">
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
        {mode === 'consulta' && <ProductInquiryModule onCommand={handleCommand} />}
        {mode === 'transferencia' && <TransferModule onCommand={handleCommand} />}
        {mode === 'palete' && <PalletModule onCommand={handleCommand} />}
        {mode === 'picking' && <PickingModule onCommand={handleCommand} />}
        {mode === 'entradas' && <EntryModule onCommand={handleCommand} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {SCANNER_MODES.map((m) => {
            const Icon = MODULE_ICONS[m.id];
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
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
