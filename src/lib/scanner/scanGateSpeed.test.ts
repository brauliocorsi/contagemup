import { describe, expect, it } from 'vitest';
import { evaluateScan, type ScanGateState } from './scanGate';

describe('leituras rápidas da pistola e da câmara', () => {
  it('a pistola conta caixa a caixa mesmo com a mesma etiqueta', () => {
    let prev: ScanGateState | null = null;
    let contadas = 0;
    for (let i = 0; i < 10; i++) {
      const d = evaluateScan(prev, 'CAM001-C1', 'wedge', 1000 + i * 40, 800);
      if (d.accept) contadas++;
      prev = d.next;
    }
    expect(contadas).toBe(10);
  });

  it('a câmara com a etiqueta parada conta uma só vez', () => {
    let prev: ScanGateState | null = null;
    let contadas = 0;
    for (let i = 0; i < 30; i++) {
      const d = evaluateScan(prev, 'CAM001-C1', 'camera', 1000 + i * 20, 800);
      if (d.accept) contadas++;
      prev = d.next;
    }
    expect(contadas).toBe(1);
  });

  it('a câmara volta a contar quando a etiqueta sai e ao trocar de etiqueta', () => {
    const d = evaluateScan(null, 'A', 'camera', 0, 800);
    expect(d.accept).toBe(true);
    const depois = evaluateScan(d.next, 'A', 'camera', 900, 800);
    expect(depois.accept).toBe(true);
    const outra = evaluateScan(d.next, 'B', 'camera', 100, 800);
    expect(outra.accept).toBe(true);
  });
});
