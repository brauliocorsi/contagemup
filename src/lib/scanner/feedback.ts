/**
 * Sinais sonoros e de vibração do scanner.
 * O operador tem o telemóvel na mão e nem sempre olha para o ecrã:
 * cada resultado tem um padrão distinto.
 */

export type FeedbackKind = 'ok' | 'error' | 'done';

const SOUND_KEY = 'scanner:sound';

/** O som pode ser desligado nas definições; a vibração mantém-se sempre. */
export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  try {
    const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!ctx || ctx.state === 'closed') ctx = new Ctx();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, startMs: number, durationMs: number) {
  const c = audioContext();
  if (!c) return;
  const start = c.currentTime + startMs / 1000;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  gain.gain.value = 0.05;
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + durationMs / 1000);
}

const PATTERNS: Record<FeedbackKind, { tones: Array<[number, number, number]>; vibrate: number | number[] }> = {
  // beep curto e agudo
  ok: { tones: [[1600, 0, 70]], vibrate: 40 },
  // dois beeps graves
  error: { tones: [[300, 0, 160], [300, 220, 160]], vibrate: [200, 80, 200] },
  // três beeps ascendentes
  done: { tones: [[900, 0, 90], [1200, 120, 90], [1600, 240, 140]], vibrate: [60, 60, 60, 60, 120] },
};

/** Emite o sinal correspondente ao resultado da leitura. */
export function scanFeedback(kind: FeedbackKind = 'ok') {
  const pattern = PATTERNS[kind];
  if (isSoundEnabled()) {
    pattern.tones.forEach(([freq, at, dur]) => tone(freq, at, dur));
  }
  try {
    navigator.vibrate?.(pattern.vibrate);
  } catch {
    /* ignore */
  }
}
