import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearDraft,
  draftSummary,
  emptyDraft,
  loadDraft,
  markEntry,
  saveDraft,
  setEntry,
} from './countingDraft';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _map: map,
  };
}

let storage = memoryStorage();
beforeEach(() => {
  storage = memoryStorage();
});

describe('teste 4 — rascunho recuperável e reenvio idempotente', () => {
  it('recupera o trabalho por utilizador e conferência', () => {
    let d = emptyDraft('u1', 'a1');
    d = setEntry(d, 'item-1', 4, 'a1');
    saveDraft(d, storage);

    const again = loadDraft('u1', 'a1', storage);
    expect(again.entries['item-1'].value).toBe(4);
    expect(again.entries['item-1'].status).toBe('por_guardar');
  });

  it('não mistura rascunhos de utilizadores diferentes', () => {
    saveDraft(setEntry(emptyDraft('u1', 'a1'), 'item-1', 4, 'a1'), storage);
    expect(Object.keys(loadDraft('u2', 'a1', storage).entries)).toHaveLength(0);
  });

  it('a chave da operação mantém-se entre tentativas falhadas do mesmo valor', () => {
    let d = setEntry(emptyDraft('u1', 'a1'), 'item-1', 4, 'a1');
    const key = d.entries['item-1'].opKey;
    d = markEntry(d, 'item-1', 'erro', 'rede indisponível');
    expect(d.entries['item-1'].opKey).toBe(key);
    d = markEntry(d, 'item-1', 'guardado');
    expect(d.entries['item-1'].opKey).toBe(key);
  });

  it('mudar o valor gera uma operação nova', () => {
    let d = setEntry(emptyDraft('u1', 'a1'), 'item-1', 4, 'a1');
    const key = d.entries['item-1'].opKey;
    d = setEntry(d, 'item-1', 5, 'a1');
    expect(d.entries['item-1'].opKey).not.toBe(key);
  });

  it('resume o estado das linhas', () => {
    let d = emptyDraft('u1', 'a1');
    d = setEntry(d, 'i1', 1, 'a1');
    d = setEntry(d, 'i2', 2, 'a1');
    d = markEntry(d, 'i2', 'guardado');
    expect(draftSummary(d)).toEqual({ porGuardar: 1, guardadas: 1, comErro: 0 });
  });

  it('limpa o rascunho quando a conferência é entregue', () => {
    saveDraft(setEntry(emptyDraft('u1', 'a1'), 'i1', 1, 'a1'), storage);
    clearDraft('u1', 'a1', storage);
    expect(Object.keys(loadDraft('u1', 'a1', storage).entries)).toHaveLength(0);
  });
});
