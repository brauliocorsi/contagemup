import JsBarcode from 'jsbarcode';
import { loadPDF } from '@/lib/lazyPdf';
import { COMMAND_SHEET } from './commands';

export type LabelFormat = 'a4' | 'ql700' | 'thermal';

/** Dimensões da etiqueta Brother QL-700 (DK-11209 / 62x29mm) */
export const QL700_WIDTH_MM = 62;
export const QL700_HEIGHT_MM = 29;

export interface LabelItem {
  /** Valor codificado no código de barras */
  code: string;
  title: string;
  subtitle?: string;
  extra?: string[];
  copies?: number;
  /** Data da última entrada de stock do produto (ISO). `null` imprime "Entrada: —" */
  entryDate?: string | null;
}

/** Formata a data de entrada para a etiqueta (dd/mm/aaaa) */
export function formatEntryDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-PT');
}

/** Linhas informativas da etiqueta (sem o título), incluindo a data de entrada quando aplicável */
function detailLines(item: LabelItem): string[] {
  const lines = (item.extra || []).filter(Boolean);
  if ('entryDate' in item) lines.push(`Entrada: ${formatEntryDate(item.entryDate)}`);
  return lines;
}


function sanitize(value: string): string {
  // CODE128 só suporta ASCII (0-127). Remove acentos e caracteres inválidos.
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
}

function barcodeDataUrl(value: string, width = 2, height = 60): string {
  const canvas = document.createElement('canvas');
  const safe = sanitize(value);
  if (!safe) return '';
  try {
    JsBarcode(canvas, safe, {
      format: 'CODE128',
      width,
      height,
      displayValue: false,
      margin: 0,
    });
  } catch {
    try {
      JsBarcode(canvas, safe.toUpperCase().replace(/[^0-9A-Z\-. $/+%]/g, ''), {
        format: 'CODE39',
        width,
        height,
        displayValue: false,
        margin: 0,
      });
    } catch {
      return '';
    }
  }
  return canvas.toDataURL('image/png');
}


/** Remove códigos repetidos, mantendo o maior número de cópias pedido */
function dedupeByCode(items: LabelItem[]): LabelItem[] {
  const map = new Map<string, LabelItem>();
  items.forEach((i) => {
    const key = (i.code || '').trim();
    if (!key) return;
    const prev = map.get(key);
    if (!prev) map.set(key, i);
    else if ((i.copies || 1) > (prev.copies || 1)) map.set(key, i);
  });
  return Array.from(map.values());
}

function expand(items: LabelItem[]): LabelItem[] {
  const out: LabelItem[] = [];
  items.forEach((i) => {
    const n = Math.max(1, i.copies || 1);
    for (let k = 0; k < n; k++) out.push(i);
  });
  return out;
}

function truncate(doc: any, text: string, maxWidth: number): string {
  let value = text || '';
  while (value.length > 3 && doc.getTextWidth(value) > maxWidth) {
    value = value.slice(0, -1);
  }
  return value === text ? text : value + '…';
}

export type OutputMode = 'print' | 'download' | 'preview';

function downloadBlob(blob: Blob, filename: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 10000);
    return true;
  } catch {
    return false;
  }
}

/** Imprime via iframe oculto — funciona dentro de iframes/preview onde window.open é bloqueado. */
function printViaIframe(url: string): boolean {
  try {
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.src = url;
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        /* ignorado */
      }
    };
    document.body.appendChild(frame);
    setTimeout(() => frame.remove(), 60000);
    return true;
  } catch {
    return false;
  }
}

async function output(doc: any, filename: string, mode: OutputMode = 'print'): Promise<string | void> {
  if (mode === 'preview') {
    return URL.createObjectURL(doc.output('blob'));
  }
  const blob: Blob = doc.output('blob');
  if (mode === 'download') {
    if (!downloadBlob(blob, filename)) doc.save(filename);
    return;
  }
  doc.autoPrint();
  const printable: Blob = doc.output('blob');
  const url = URL.createObjectURL(printable);
  const win = window.open(url, '_blank');
  if (win && !win.closed) return;
  // Popup bloqueado (mobile/preview em iframe): tenta imprimir via iframe e descarrega como último recurso.
  if (!printViaIframe(url)) downloadBlob(printable, filename);
}


/** Etiquetas em folha A4 (grelha 3x8, 70x37mm) */
async function printA4(items: LabelItem[], filename: string, mode: OutputMode = 'print') {
  const { jsPDF } = await loadPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const cols = 3;
  const rows = 8;
  const w = 70;
  const h = 35.7;
  const marginX = 0;
  const marginY = 5;
  const perPage = cols * rows;

  items.forEach((item, index) => {
    if (index > 0 && index % perPage === 0) doc.addPage();
    const i = index % perPage;
    const x = marginX + (i % cols) * w;
    const y = marginY + Math.floor(i / cols) * h;

    doc.setDrawColor(220);
    doc.rect(x + 1.5, y + 1, w - 3, h - 2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(truncate(doc, item.title, w - 8), x + 4, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    let ty = y + 10;
    if (item.subtitle) {
      doc.text(truncate(doc, item.subtitle, w - 8), x + 4, ty);
      ty += 3.5;
    }
    (item.extra || []).slice(0, 2).forEach((line) => {
      doc.text(truncate(doc, line, w - 8), x + 4, ty);
      ty += 3.5;
    });

    const img = barcodeDataUrl(item.code);
    if (img) doc.addImage(img, 'PNG', x + 5, y + h - 20, w - 10, 12);
    doc.setFontSize(8);
    doc.text(item.code, x + w / 2, y + h - 4.5, { align: 'center' });
  });

  return output(doc, filename, mode);
}

/** Etiqueta individual para impressora térmica 100x50mm */
async function printThermal(items: LabelItem[], filename: string, mode: OutputMode = 'print') {
  const { jsPDF } = await loadPDF();
  const doc = new jsPDF({ unit: 'mm', format: [100, 50], orientation: 'landscape' });

  items.forEach((item, index) => {
    if (index > 0) doc.addPage([100, 50], 'landscape');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(truncate(doc, item.title, 92), 4, 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    let ty = 14;
    if (item.subtitle) {
      doc.text(truncate(doc, item.subtitle, 92), 4, ty);
      ty += 4.5;
    }
    (item.extra || []).slice(0, 2).forEach((line) => {
      doc.text(truncate(doc, line, 92), 4, ty);
      ty += 4.5;
    });

    const img = barcodeDataUrl(item.code, 2, 80);
    if (img) doc.addImage(img, 'PNG', 8, 27, 84, 15);
    doc.setFontSize(10);
    doc.text(item.code, 50, 47, { align: 'center' });
  });

  return output(doc, filename, mode);
}

/** Etiqueta Brother QL-700 — rolo contínuo 62x29mm (DK-11209), 1 etiqueta por página */
async function printQL700(items: LabelItem[], filename: string, mode: OutputMode = 'print') {
  const { jsPDF } = await loadPDF();
  const W = QL700_WIDTH_MM;
  const H = QL700_HEIGHT_MM;
  // Margens de segurança da QL-700 (área não imprimível ~1.5mm)
  const M = 2;
  const innerW = W - M * 2;

  const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: 'landscape' });

  items.forEach((item, index) => {
    if (index > 0) doc.addPage([W, H], 'landscape');

    // Título (nome do produto/local) — até 2 linhas
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    const titleLines: string[] = doc.splitTextToSize(item.title || '', innerW).slice(0, 2);
    let ty = M + 2.6;
    titleLines.forEach((line: string) => {
      doc.text(line, M, ty);
      ty += 2.9;
    });

    // Linha de contexto (código interno / coli)
    const info = [item.subtitle, ...(item.extra || [])].filter(Boolean).join('  •  ');
    if (info) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.text(truncate(doc, info, innerW), M, ty);
    }

    // Código de barras ocupa a largura útil, alinhado ao fundo
    const barH = 9.5;
    const barY = H - M - 4.2 - barH;
    const img = barcodeDataUrl(item.code, 2, 120);
    if (img) doc.addImage(img, 'PNG', M, barY, innerW, barH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(truncate(doc, item.code, innerW), W / 2, H - M - 0.4, { align: 'center' });
  });

  return output(doc, filename, mode);
}

export async function printLabels(
  items: LabelItem[],
  format: LabelFormat = 'ql700',
  filename = 'etiquetas.pdf',
  mode: OutputMode = 'print'
): Promise<string | void> {
  const list = expand(dedupeByCode(items)).filter((i) => i.code && i.code.trim());
  if (list.length === 0) return;
  if (format === 'ql700') return printQL700(list, filename, mode);
  if (format === 'thermal') return printThermal(list, filename, mode);
  return printA4(list, filename, mode);
}

/** Talão/resumo de uma operação concluída */
export async function printOperationReceipt(params: {
  title: string;
  operationCode: string;
  meta: Array<[string, string]>;
  columns: string[];
  rows: (string | number)[][];
}) {
  const { jsPDF, autoTable } = await loadPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(params.title, 14, 18);

  const img = barcodeDataUrl(params.operationCode, 1.6, 50);
  if (img) doc.addImage(img, 'PNG', 140, 10, 55, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(params.operationCode, 167.5, 26, { align: 'center' });

  doc.setFontSize(9);
  let y = 26;
  params.meta.forEach(([label, value]) => {
    doc.text(`${label}: ${value}`, 14, y);
    y += 5;
  });

  autoTable(doc, {
    startY: y + 3,
    head: [params.columns],
    body: params.rows,
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: [15, 76, 92] },
  });

  await output(doc, `${params.operationCode}.pdf`);
}

/** Folha de comandos operacionais */
export async function printCommandSheet(format: LabelFormat = 'a4', mode: OutputMode = 'print') {
  return printLabels(
    COMMAND_SHEET.map((c) => ({
      code: c.code,
      title: c.label,
      subtitle: c.description,
    })),
    format,
    'comandos-scanner.pdf',
    mode
  );
}

export function productLabel(product: { code: string; name: string }, colisCodeValue?: string, colis?: number): LabelItem {
  return {
    code: colisCodeValue || product.code,
    title: product.name,
    subtitle: `Código: ${product.code}`,
    extra: colis ? [`Coli ${colis}`] : undefined,
  };
}

/**
 * Etiquetas de um produto respeitando os colis.
 * Com mais de 1 coli gera uma etiqueta por coli com o código `CODIGO-C1`, `CODIGO-C2`, ...
 */
export function productColiLabels(
  product: { code: string; name: string; total_colis?: number | null },
  options?: { copies?: number; colisNames?: Record<string, string> | null }
): LabelItem[] {
  const total = Math.max(1, product.total_colis || 1);
  const copies = Math.max(1, options?.copies || 1);
  if (total <= 1) {
    return [{ ...productLabel(product), copies }];
  }
  return Array.from({ length: total }, (_, idx) => {
    const n = idx + 1;
    const name = options?.colisNames?.[String(n)];
    return {
      code: `${product.code}-C${n}`,
      title: product.name,
      subtitle: `Código: ${product.code}`,
      extra: [name ? `Coli ${n}/${total} - ${name}` : `Coli ${n}/${total}`],
      copies,
    };
  });
}
