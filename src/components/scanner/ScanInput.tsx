import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Keyboard, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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

/** Beep curto sem ficheiros externos. */
function beep() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1400;
    gain.gain.value = 0.05;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, 70);
  } catch {
    /* ignore */
  }
}

/**
 * Entrada universal de leitura: teclado/pistola (wedge) sempre ativo,
 * câmara opcional através do @zxing/browser.
 */
export function ScanInput({
  onScan,
  placeholder = 'Ler ou escrever código…',
  label,
  autoFocus = true,
  className,
  dedupeMs = 800,
  feedback = true,
}: ScanInputProps) {
  const [value, setValue] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const inputRef = useRef<HTMLInputElement | null>(null);

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
    if (feedback) {
      beep();
      try {
        navigator.vibrate?.(40);
      } catch {
        /* ignore */
      }
    }
    onScan(clean);
  };


  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current!,
          (result) => {
            if (result) emit(result.getText(), true);
          }

        );
        if (cancelled) controls.stop();
        else controlsRef.current = controls;
      } catch (e: any) {
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
            inputMode="text"
            className="h-12 pl-9 text-base"
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                emit(value);
                setValue('');
                inputRef.current?.focus();
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
          variant="outline"
          size="icon"
          className="h-12 w-12 shrink-0"
          onClick={() => inputRef.current?.focus()}
          aria-label="Focar teclado"
        >
          <Keyboard className="h-5 w-5" />
        </Button>
      </div>

      {cameraOn && (
        <div className="overflow-hidden rounded-xl border bg-black">
          <video ref={videoRef} className="h-56 w-full object-cover" muted playsInline />
        </div>
      )}
    </div>
  );
}
