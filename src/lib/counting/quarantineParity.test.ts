import { describe, expect, it } from 'vitest';
import { computeColiTotals, isQuarantineLocation } from './colis';

/**
 * A base considera quarentena apenas as moradas do cadastro com tipo
 * `quarantine`. O cliente, quando não recebe essa lista, decide por semelhança
 * de texto. Estes testes fixam a diferença para que não passe despercebida.
 */
describe('paridade da regra de quarentena entre ecrã e base', () => {
  const cadastro = ['QUARENTENA', 'QUARENTENA-DEV'];

  it('com a lista do cadastro decide igual à base', () => {
    expect(isQuarantineLocation('QUARENTENA', cadastro)).toBe(true);
    expect(isQuarantineLocation('quarentena-dev', cadastro)).toBe(true);
    expect(isQuarantineLocation('A1', cadastro)).toBe(false);
  });

  it('sem a lista, uma morada com a palavra no nome é tratada como quarentena', () => {
    // A base diria que não, porque a morada não está marcada como quarentena.
    expect(isQuarantineLocation('RUA-QUARENTENA-VELHA')).toBe(true);
    expect(isQuarantineLocation('RUA-QUARENTENA-VELHA', cadastro)).toBe(false);
  });

  it('a diferença altera os conjuntos apresentados', () => {
    const linhas = [
      { colis_number: 1, quantity: 5, location: 'A1' },
      { colis_number: 2, quantity: 5, location: 'RUA-QUARENTENA-VELHA' },
    ];
    expect(computeColiTotals(linhas, 2).completeSets).toBe(0);
    expect(computeColiTotals(linhas, 2, cadastro).completeSets).toBe(5);
  });
});
