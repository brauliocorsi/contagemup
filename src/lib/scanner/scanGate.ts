/**
 * Decide se uma leitura deve contar.
 *
 * A câmara devolve o mesmo código dezenas de vezes por segundo, por isso essas
 * leituras passam por uma janela anti-repetição. A pistola e o teclado enviam
 * uma leitura por disparo (terminada em Enter) e contam SEMPRE, mesmo que seja
 * a mesma etiqueta seguidas vezes — é assim que se conta caixa a caixa.
 */

export type ScanSource = 'camera' | 'wedge';

export interface ScanGateState {
  code: string;
  at: number;
  source: ScanSource;
}

export interface ScanGateDecision {
  accept: boolean;
  reason?: 'repetida_camara';
  next: ScanGateState;
}

export function evaluateScan(
  prev: ScanGateState | null,
  code: string,
  source: ScanSource,
  now: number,
  dedupeMs: number,
): ScanGateDecision {
  const next: ScanGateState = { code, at: now, source };
  if (source !== 'camera') return { accept: true, next };
  if (prev && prev.source === 'camera' && prev.code === code && now - prev.at < dedupeMs) {
    // Janela deslizante: enquanto a etiqueta continuar à frente da câmara é
    // sempre a MESMA leitura. Só volta a contar depois de a etiqueta sair do
    // campo de visão durante mais tempo do que a janela.
    return { accept: false, reason: 'repetida_camara', next };
  }
  return { accept: true, next };
}
