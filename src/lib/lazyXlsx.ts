// Lazy loader para xlsx — evita carregar ~500KB até ser realmente necessário.
let cached: typeof import('xlsx') | null = null;

export async function loadXLSX() {
  if (!cached) {
    cached = await import('xlsx');
  }
  return cached;
}
