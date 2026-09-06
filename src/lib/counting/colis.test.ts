import { describe, expect, it } from 'vitest';
import { computeColiTotals, effectiveTotalColis, isQuarantineLocation } from './colis';

const row = (colis_number: number, quantity: number, location: string | null) => ({
  colis_number,
  quantity,
  location,
});

describe('regra efetiva de colis', () => {
  it('usa o maior entre produto e categoria', () => {
    expect(effectiveTotalColis(1, { '1': 'Base', '2': 'Cabeceira' })).toBe(2);
    expect(effectiveTotalColis(3, { '1': 'Base' })).toBe(3);
    expect(effectiveTotalColis(0, null)).toBe(1);
  });
});

describe('teste 1 — produto de um coli e de vários colis', () => {
  it('produto de um coli: disponibilidade é a soma física', () => {
    const t = computeColiTotals([row(1, 7, 'A1'), row(1, 3, 'B2')], 1);
    expect(t.physicalUnits).toBe(10);
    expect(t.completeSets).toBe(10);
    expect(t.orphanUnits).toBe(0);
  });

  it('cinco C1 e três C2 dão três conjuntos e dois C1 soltos', () => {
    const t = computeColiTotals([row(1, 5, 'A1'), row(2, 3, 'A1')], 2);
    expect(t.completeSets).toBe(3);
    expect(t.physicalUnits).toBe(8);
    expect(t.orphanUnits).toBe(2);
  });
});

describe('teste 2 — colis distribuídos por várias localizações', () => {
  it('soma o mesmo coli em localizações diferentes', () => {
    const t = computeColiTotals(
      [row(1, 2, 'A1'), row(1, 3, 'B7'), row(2, 4, 'C3'), row(2, 1, 'A1')],
      2,
    );
    expect(t.perColi[1]).toBe(5);
    expect(t.perColi[2]).toBe(5);
    expect(t.completeSets).toBe(5);
    expect(t.orphanUnits).toBe(0);
  });

  it('quarentena fica fora da disponibilidade', () => {
    const t = computeColiTotals(
      [row(1, 5, 'A1'), row(2, 5, 'A1'), row(1, 2, 'QUARENTENA'), row(2, 2, 'QUARENTENA-01')],
      2,
    );
    expect(t.quarantineUnits).toBe(4);
    expect(t.physicalUnits).toBe(10);
    expect(t.completeSets).toBe(5);
  });

  it('aceita a lista real de códigos de quarentena', () => {
    expect(isQuarantineLocation('Q-DEV', ['Q-DEV'])).toBe(true);
    expect(isQuarantineLocation('A1', ['Q-DEV'])).toBe(false);
  });
});
