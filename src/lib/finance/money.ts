/**
 * Dinheiro em cêntimos inteiros: nada de vírgula flutuante acumulada.
 * A interface mostra euros; o servidor guarda sempre cêntimos.
 */

export function formatCents(cents: number | null | undefined): string {
  const v = typeof cents === 'number' ? cents : 0;
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v / 100);
}

/** Converte o que o utilizador escreve ("12,50", "12.5", "1 234,05") em cêntimos. */
export function parseEurosToCents(input: string): number | null {
  const s = input.replace(/\s|€/g, '').replace(/\.(?=\d{3}(\D|$))/g, '');
  if (!s) return 0;
  const normalized = s.replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  const [int, dec = ''] = normalized.split('.');
  return Number(int) * 100 + Number(dec.padEnd(2, '0'));
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}
