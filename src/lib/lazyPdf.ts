// Lazy loader para jspdf + jspdf-autotable.
let cached: { jsPDF: typeof import('jspdf').default; autoTable: typeof import('jspdf-autotable').default } | null = null;

export async function loadPDF() {
  if (!cached) {
    const [jsPDFMod, autoTableMod] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    cached = { jsPDF: jsPDFMod.default, autoTable: autoTableMod.default };
  }
  return cached;
}
