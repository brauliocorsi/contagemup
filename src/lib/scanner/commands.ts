// Comandos operacionais por código de barras (folha de comandos imprimível)

export type ScannerCommand =
  | 'OK'
  | 'NEXT'
  | 'BACK'
  | 'CANCEL'
  | 'PRINT'
  | 'QTY+'
  | 'QTY-'
  | 'CLEAR'
  | 'FINISH'
  | 'MODE';

export interface ParsedCommand {
  command: ScannerCommand;
  /** Valor extra: quantidade para QTY-<n>, módulo para MODE-<modulo> */
  value?: string;
  raw: string;
}

export const SCANNER_MODES = [
  { id: 'consulta', label: 'Consulta' },
  { id: 'transferencia', label: 'Transferência' },
  { id: 'picking', label: 'Picking' },
  { id: 'entradas', label: 'Entradas' },
] as const;

export type ScannerMode = (typeof SCANNER_MODES)[number]['id'];

/** Devolve o comando quando o código lido é um CMD-*, senão null. */
export function parseCommand(raw: string): ParsedCommand | null {
  const value = (raw || '').trim().toUpperCase();
  if (!value.startsWith('CMD-')) return null;
  const body = value.slice(4);

  if (body === 'OK' || body === 'VALIDAR' || body === 'CONFIRMAR') return { command: 'OK', raw };
  if (body === 'NEXT' || body === 'AVANCAR') return { command: 'NEXT', raw };
  if (body === 'BACK' || body === 'VOLTAR') return { command: 'BACK', raw };
  if (body === 'CANCEL' || body === 'CANCELAR') return { command: 'CANCEL', raw };
  if (body === 'PRINT' || body === 'IMPRIMIR') return { command: 'PRINT', raw };
  if (body === 'CLEAR' || body === 'LIMPAR') return { command: 'CLEAR', raw };
  if (body === 'FINISH' || body === 'CONCLUIR') return { command: 'FINISH', raw };
  if (body === 'QTY+' || body === 'QTYMAIS') return { command: 'QTY+', raw };
  if (body === 'QTY-' || body === 'QTYMENOS') return { command: 'QTY-', raw };

  const qty = body.match(/^QTY-?(\d+)$/);
  if (qty) return { command: 'QTY+', value: qty[1], raw };

  const mode = body.match(/^MODE-(.+)$/);
  if (mode) {
    const id = mode[1].toLowerCase();
    const known = SCANNER_MODES.find((m) => m.id === id);
    if (known) return { command: 'MODE', value: known.id, raw };
  }

  return null;
}

export const COMMAND_SHEET: Array<{ code: string; label: string; description: string }> = [
  { code: 'CMD-OK', label: 'Validar', description: 'Confirma a ação em curso' },
  { code: 'CMD-NEXT', label: 'Avançar', description: 'Passa ao passo/linha seguinte' },
  { code: 'CMD-BACK', label: 'Voltar', description: 'Regressa ao passo anterior' },
  { code: 'CMD-CANCEL', label: 'Cancelar', description: 'Cancela a operação (confirma com OK)' },
  { code: 'CMD-PRINT', label: 'Imprimir', description: 'Imprime a etiqueta do item em foco' },
  { code: 'CMD-QTY+', label: 'Quantidade +1', description: 'Aumenta a quantidade' },
  { code: 'CMD-QTY-', label: 'Quantidade -1', description: 'Diminui a quantidade' },
  { code: 'CMD-QTY-5', label: 'Quantidade = 5', description: 'Define a quantidade (CMD-QTY-<n>)' },
  { code: 'CMD-QTY-10', label: 'Quantidade = 10', description: 'Define a quantidade (CMD-QTY-<n>)' },
  { code: 'CMD-CLEAR', label: 'Limpar', description: 'Limpa a lista de leituras (confirma com OK)' },
  { code: 'CMD-FINISH', label: 'Concluir', description: 'Grava a operação (confirma com OK)' },
  { code: 'CMD-MODE-consulta', label: 'Ir para Consulta', description: 'Muda de módulo' },
  { code: 'CMD-MODE-transferencia', label: 'Ir para Transferência', description: 'Muda de módulo' },
  { code: 'CMD-MODE-picking', label: 'Ir para Picking', description: 'Muda de módulo' },
  { code: 'CMD-MODE-entradas', label: 'Ir para Entradas', description: 'Muda de módulo' },
];

/** Códigos internos gerados pelo sistema */
export function locationCode(code: string) {
  const clean = (code || '').trim().toUpperCase();
  return clean.startsWith('LOC-') ? clean : `LOC-${clean}`;
}

export function colisCode(productCode: string, colis: number) {
  return `${(productCode || '').trim()}-C${colis}`;
}

export interface ParsedScan {
  kind: 'command' | 'location' | 'colis' | 'code';
  value: string;
  colis?: number;
  command?: ParsedCommand;
}

/** Classifica qualquer código lido. */
export function parseScan(raw: string): ParsedScan {
  const value = (raw || '').trim();
  const cmd = parseCommand(value);
  if (cmd) return { kind: 'command', value, command: cmd };

  const upper = value.toUpperCase();
  if (upper.startsWith('LOC-')) return { kind: 'location', value: value.slice(4) };

  const colis = value.match(/^(.+)-C(\d+)$/i);
  if (colis) return { kind: 'colis', value: colis[1], colis: Number(colis[2]) };

  return { kind: 'code', value };
}

/** Handler de quantidade partilhado entre a app e o módulo ativo (comandos CMD-QTY). */
export type QtyHandler = (opts: { delta?: number; set?: number }) => void;
