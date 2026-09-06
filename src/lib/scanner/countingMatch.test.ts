import { describe, expect, it } from 'vitest';
import { resolveCountingScan, splitColisCode } from './countingMatch';

const item = (id: string, code: string, colis: number | null, name = 'Cama Opera') => ({
  id,
  product_code: code,
  product_name: name,
  colis_number: colis,
});

describe('teste 3 — código ambíguo bloqueado; C2 altera apenas C2', () => {
  const items = [item('a', 'CAM001', 1), item('b', 'CAM001', 2)];

  it('código sem coli com vários candidatos não escolhe o primeiro', () => {
    const r = resolveCountingScan(items, 'CAM001', null, 'B33');
    expect(r.status).toBe('ambiguo');
    expect(r.item).toBeUndefined();
    expect(r.candidates).toHaveLength(2);
  });

  it('etiqueta do coli 2 seleciona exatamente o coli 2', () => {
    const r = resolveCountingScan(items, 'CAM001-C2', null, 'B33');
    expect(r.status).toBe('ok');
    expect(r.item?.id).toBe('b');
    expect(r.item?.colis_number).toBe(2);
  });

  it('o coli lido é respeitado mesmo quando já vem separado do código', () => {
    const r = resolveCountingScan(items, 'CAM001', 2, 'B33');
    expect(r.item?.id).toBe('b');
  });

  it('coli inexistente na localização não incrementa outro coli', () => {
    const r = resolveCountingScan([item('a', 'CAM001', 1)], 'CAM001-C2', null, 'B33');
    expect(r.status).toBe('coli_inexistente');
    expect(r.item).toBeUndefined();
  });

  it('produto de um coli é inequívoco', () => {
    const r = resolveCountingScan([item('a', 'SOF9', 1)], 'SOF9', null, 'B33');
    expect(r.status).toBe('ok');
    expect(r.item?.id).toBe('a');
  });

  it('artigo não previsto é sinalizado como exceção', () => {
    const r = resolveCountingScan(items, 'OUTRO', null, 'B33');
    expect(r.status).toBe('fora_da_localizacao');
    expect(r.message).toContain('B33');
  });

  it('duas caixas legítimas com a mesma etiqueta pedem escolha', () => {
    const r = resolveCountingScan([item('a', 'CAM001', 2), item('b', 'CAM001', 2)], 'CAM001-C2');
    expect(r.status).toBe('ambiguo');
    expect(r.candidates).toHaveLength(2);
  });
});

describe('separação do sufixo de coli', () => {
  it('separa CODIGO-C2', () => {
    expect(splitColisCode('ABC-123-C2')).toEqual({ base: 'ABC-123', colis: 2 });
  });
  it('mantém códigos sem sufixo', () => {
    expect(splitColisCode('2012252903006')).toEqual({ base: '2012252903006', colis: null });
  });
});
