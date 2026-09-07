import { describe, expect, it } from 'vitest';
import {
  addColiScan,
  completeSets,
  evaluateColiScan,
  linePending,
  splitColisSuffix,
  type ColiLine,
} from './coliCounter';

const line = (key: string, order: string, sets: number, colisCount: number): ColiLine => ({
  key,
  aliases: ['MOV1'],
  orderNumber: order,
  label: `Móvel ${key}`,
  slots: Array.from({ length: colisCount }, (_, i) => ({
    colis_number: i + 1,
    requested: sets,
    done: 0,
    scanned: 0,
  })),
});

describe('contagem por volume', () => {
  it('lê o sufixo -C2 da etiqueta', () => {
    expect(splitColisSuffix('MOV1-C2')).toEqual({ base: 'MOV1', colis: 2 });
    expect(splitColisSuffix('MOV1')).toEqual({ base: 'MOV1' });
  });

  it('multivolume sem sufixo pede o volume, não assume o 1', () => {
    const out = evaluateColiScan([line('a', 'E1', 1, 2)], 'MOV1');
    expect(out.status).toBe('escolher_coli');
    if (out.status === 'escolher_coli') expect(out.options).toEqual([1, 2]);
  });

  it('um móvel de 2 volumes: ler C1 deixa C2 pendente e 0 conjuntos', () => {
    let ls = [line('a', 'E1', 1, 2)];
    ls = addColiScan(ls, 'a', 1);
    expect(completeSets(ls[0])).toBe(0);
    expect(linePending(ls[0])).toBe(1);
  });

  it('ler C1 duas vezes não cria um conjunto e excede o previsto', () => {
    let ls = [line('a', 'E1', 1, 2)];
    ls = addColiScan(ls, 'a', 1);
    const again = evaluateColiScan(ls, 'MOV1', 1);
    expect(again.status).toBe('completo');
    ls = addColiScan(ls, 'a', 1);
    expect(ls[0].slots[0].scanned).toBe(1);
    expect(completeSets(ls[0])).toBe(0);
  });

  it('dois móveis: C1,C1,C2,C2 dá 2 conjuntos', () => {
    let ls = [line('a', 'E1', 2, 2)];
    for (const c of [1, 1, 2, 2]) ls = addColiScan(ls, 'a', c);
    expect(completeSets(ls[0])).toBe(2);
    expect(linePending(ls[0])).toBe(0);
  });

  it('o mesmo produto em duas encomendas obriga a escolher a linha', () => {
    const ls = [line('a', 'E1', 1, 1), line('b', 'E2', 1, 1)];
    const out = evaluateColiScan(ls, 'MOV1');
    expect(out.status).toBe('escolher_linha');
    if (out.status === 'escolher_linha') expect(out.candidates.map((c) => c.key)).toEqual(['a', 'b']);
  });

  it('quando só resta uma candidata com pendente, aplica sem perguntar', () => {
    let ls = [line('a', 'E1', 1, 1), line('b', 'E2', 1, 1)];
    ls = addColiScan(ls, 'a', 1);
    const out = evaluateColiScan(ls, 'MOV1');
    expect(out).toEqual({ status: 'ok', lineKey: 'b', colis: 1 });
  });

  it('código fora da lista é desconhecido', () => {
    expect(evaluateColiScan([line('a', 'E1', 1, 1)], 'OUTRO').status).toBe('desconhecido');
  });
});
