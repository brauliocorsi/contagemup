import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Keyboard, ScanLine, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { isSoundEnabled, scanFeedback, setSoundEnabled } from '@/lib/scanner/feedback';

interface ScanInputProps {
  onScan: (code: string) => void;
  placeholder?: string;
  label?: string;
  autoFocus?: boolean;
  className?: string;
  /** Janela anti-duplicado aplicada apenas às leituras da câmara (ms). */
  dedupeMs?: number;
  /** Feedback sonoro/vibração a cada leitura. */
  feedback?: boolean;
}

/**
 * Entrada universal de leitura: teclado/pistola (wedge) sempre ativo,
 * câmara opcional através do @zxing/browser.
 *
 * O campo usa `inputMode="none"` por defeito para que o teclado do telemóvel
 * NÃO abra e o ecrã não salte. A pistola continua a funcionar porque escreve
 * como teclado externo. O botão do teclado alterna para escrita manual.
 */
export function ScanInput({
  onScan,
  placeholder = 'Ler código…',
  label,
  autoFocus = true,
  className,
  dedupeMs = 800,
  feedback = true,
}: ScanInputProps) {
  const [value, setValue] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [manual, setManual] = useState(false);
  const [sound, setSound] = useState(() => isSoundEnabled());
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const manualRef = useRef(false);
  manualRef.current = manual;

  /** Foca sem nunca deslocar o ecrã. */
  const focusField = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  /**
   * @param fromCamera leituras da câmara repetem-se dezenas de vezes por segundo,
   * por isso só essas passam pelo filtro anti-duplicado. Pistola/teclado conta sempre.
   */
  const emit = (code: string, fromCamera = false) => {
    const clean = (code || '').trim();
    if (!clean) return;
    const now = Date.now();
    if (fromCamera && lastRef.current.code === clean && now - lastRef.current.at < dedupeMs) return;
    lastRef.current = { code: clean, at: now };
    if (feedback) scanFeedback('ok');
    onScan(clean);
    focusField();
  };

  /**
   * O foco é recuperado apenas por eventos (fim de toque, regresso à app,
   * início de escrita), nunca por temporizador — assim o ecrã não salta.
   */
  useEffect(() => {
    if (!autoFocus) return;

    const canSteal = () => {
      const el = document.activeElement as HTMLElement | null;
      if (el === inputRef.current) return false;
      if (document.querySelector('[role="dialog"], [role="listbox"], [role="menu"]')) return false;
      if (!el || el === document.body || el.tagName === 'HTML') return true;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return false;
      // Botões e outros elementos: recupera o foco após a interação terminar.
      return true;
    };

    const refocus = () => {
      if (canSteal()) focusField();
    };

    const onPointerUp = () => window.setTimeout(refocus, 60);
    const onVisibility = () => {
      if (!document.hidden) window.setTimeout(refocus, 120);
    };
    /** Se o operador ler um código sem ter o campo focado, redireciona a escrita. */
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1) return;
      if (!canSteal()) return;
      focusField();
    };

    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', refocus);
    return () => {
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', refocus);
    };
  }, [autoFocus, focusField]);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
          if (result) emit(result.getText(), true);
        });
        if (cancelled) controls.stop();
        else controlsRef.current = controls;
      } catch (e) {
        console.error('camera error', e);
        toast.error('Não foi possível aceder à câmara');
        setCameraOn(false);
      }
    }

    if (cameraOn) start();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn]);

  return (
    <div className={cn('space-y-2', className)}>
      {label && <p className="text-xs font-medium text-muted-foreground">{label}</p>}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <ScanLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={value}
            autoFocus={autoFocus}
            inputMode={manual ? 'text' : 'none'}
            className="h-12 pl-9 text-base"
            placeholder={manual ? 'Escrever código…' : placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                emit(value);
                setValue('');
                if (manualRef.current) setManual(false);
              }
            }}
          />
        </div>
        <Button
          type="button"
          variant={cameraOn ? 'default' : 'outline'}
          size="icon"
          className="h-12 w-12 shrink-0"
          onClick={() => setCameraOn((v) => !v)}
          aria-label={cameraOn ? 'Desligar câmara' : 'Ligar câmara'}
        >
          {cameraOn ? <CameraOff className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
        </Button>
        <Button
          type="button"
          variant={manual ? 'default' : 'outline'}
          size="icon"
          className="h-12 w-12 shrink-0"
          onClick={() => {
            setManual((v) => !v);
            window.setTimeout(focusField, 0);
          }}
          aria-label={manual ? 'Desligar escrita manual' : 'Escrever à mão'}
          title={manual ? 'Escrita manual ligada' : 'Escrita manual desligada'}
        >
          <Keyboard className="h-5 w-5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-12 w-12 shrink-0"
          onClick={() => {
            const next = !sound;
            setSound(next);
            setSoundEnabled(next);
            if (next) scanFeedback('ok');
          }}
          aria-label={sound ? 'Desligar som' : 'Ligar som'}
        >
          {sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        </Button>
      </div>

      {manual && (
        <p className="text-[11px] font-medium text-primary">
          Escrita manual ligada — o teclado abre. Confirma com Enter para voltar ao modo de leitura.
        </p>
      )}

      {cameraOn && (
        <div className="overflow-hidden rounded-xl border bg-black">
          <video ref={videoRef} className="h-56 w-full object-cover" muted playsInline />
        </div>
      )}
    </div>
  );
}
