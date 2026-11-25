import { describe, it, expect } from 'vitest';
import { keepInStock, type EntryRow } from '@/components/products/ColisEntryDates';
const e = (colis: number, date: string, quantity = 1): EntryRow => ({ key: `${colis}${date}`, colis, date, quantity, location: 'CONF', origin: 'x', reference: null });
describe('keepInStock', () => {
  it('mostra só a entrada de 25/11 quando a de 13/11 já saiu', () => {
    const r = keepInStock([e(1,'2026-11-25'), e(1,'2026-11-13'), e(2,'2026-11-25'), e(2,'2026-11-13')], { 1: 1, 2: 1 });
    expect(r.map(x => `${x.colis}:${x.date}`)).toEqual(['1:2026-11-25', '2:2026-11-25']);
  });
  it('sem stock não mostra entradas', () => {
    expect(keepInStock([e(1,'2026-11-13')], {})).toEqual([]);
  });
});
