// Deteta serviços de montagem/instalação nas encomendas da Gestão Click.

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isAssemblyService(name: string): boolean {
  return /montag|monta|instala/.test(normalize(name));
}

export interface AssemblyInfo {
  hasAssembly: boolean;
  services: string[];
}

/** Resume os serviços de montagem de uma encomenda (linhas de serviço da Gestão Click). */
export function assemblyFromServices(services: { nome?: string | null }[] | undefined): AssemblyInfo {
  const names = (services ?? [])
    .map((s) => (s?.nome ?? '').trim())
    .filter((n) => n.length > 0 && isAssemblyService(n));
  return { hasAssembly: names.length > 0, services: names };
}
