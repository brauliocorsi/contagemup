import { describe, expect, it } from 'vitest';
import { evaluateScan, type ScanGateState } from './scanGate';

describe('teste 6 — leituras repetidas', () => {
  it('a pistola conta sempre, mesmo com a mesma etiqueta seguida', () => {
    let state: ScanGateState | null = null;
    let counted = 0;
    for (let i = 0; i < 5; i++) {
      const d = evaluateScan(state, 'CAM001-C1', 'wedge', 1000 + i * 10, 800);
      state = d.next;
      if (d.accept) counted++;
    }
    expect(counted).toBe(5);
  });

  it('a câmara não repete a mesma etiqueta dentro da janela', () => {
    let state: ScanGateState | null = null;
    let counted = 0;
    for (let i = 0; i < 20; i++) {
      const d = evaluateScan(state, 'CAM001-C1', 'camera', 1000 + i * 30, 800);
      state = d.next;
      if (d.accept) counted++;
    }
    expect(counted).toBe(1);
  });

  it('a câmara volta a contar depois de a janela passar', () => {
    const first = evaluateScan(null, 'X', 'camera', 0, 800);
    const second = evaluateScan(first.next, 'X', 'camera', 900, 800);
    expect(second.accept).toBe(true);
  });

  it('uma leitura da pistola não é bloqueada por uma leitura anterior da câmara', () => {
    const cam = evaluateScan(null, 'X', 'camera', 0, 800);
    const gun = evaluateScan(cam.next, 'X', 'wedge', 100, 800);
    expect(gun.accept).toBe(true);
  });
});
