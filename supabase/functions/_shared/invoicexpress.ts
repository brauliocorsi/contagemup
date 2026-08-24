import type { GcDocument } from "./gc-logistics.ts";

const ACCOUNT = "upmoveisrbcunipes";
const BASE = `https://${ACCOUNT}.app.invoicexpress.com`;

function apiKey(): string {
  const key = Deno.env.get("INVOICEXPRESS_API_KEY");
  if (!key) throw new Error("Chave da InvoiceXpress em falta");
  return key;
}

/** InvoiceXpress usa DD/MM/YYYY. */
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function fmtDate(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Data de hoje (emissão) e vencimento a 2 dias. */
function issueDates(): { date: string; dueDate: string } {
  const now = new Date();
  const due = new Date(now.getTime());
  due.setDate(due.getDate() + 2);
  return { date: fmtDate(now), dueDate: fmtDate(due) };
}

/**
 * Data de carga escolhida pelo utilizador (ISO `YYYY-MM-DDTHH:mm`).
 * A InvoiceXpress exige que seja >= ao instante do pedido: se já passou, usamos agora + margem.
 */
export function loadedAt(chosen: string): string {
  const soon = new Date(Date.now() + 15 * 60 * 1000);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(chosen.trim());
  const target = m
    ? new Date(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4] ?? "8"),
        Number(m[5] ?? "0"),
        0,
      )
    : soon;
  const use = target.getTime() <= soon.getTime() ? soon : target;
  return `${fmtDate(use)} ${pad(use.getHours())}:${pad(use.getMinutes())}`;
}

/** NIF: campo da ficha do cliente ou, em falta, "NIF 123456789" nas observações. */
function resolveNif(doc: GcDocument): string {
  const direct = digits(doc.cliente.documento);
  if (direct.length === 9) return direct;
  const texts = [doc.observacoes, doc.observacoesInternas];
  for (const text of texts) {
    const found = /n\.?\s*i\.?\s*f\.?\s*[:\-]?\s*((?:\d[\s.]?){9})/i.exec(text ?? "");
    const value = digits(found?.[1] ?? "");
    if (value.length === 9) return value;
  }
  return "";
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function num(value: string): number {
  const n = Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export type GuideResult = {
  orderId: string;
  codigo: string;
  cliente?: string;
  ok: boolean;
  guideId?: number;
  guideNumber?: string;
  permalink?: string;
  version?: number;
  previousGuideNumber?: string;
  error?: string;
};

type IxGuide = {
  id?: number;
  inverted_sequence_number?: string;
  sequence_number?: string;
  permalink?: string;
};

async function ixRequest(path: string, body: unknown, method = "POST"): Promise<IxGuide> {
  const res = await fetch(`${BASE}${path}?api_key=${encodeURIComponent(apiKey())}`, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`InvoiceXpress ${res.status}: ${text.slice(0, 300)}`);
  }
  try {
    const parsed = JSON.parse(text) as { guide?: IxGuide; transport?: IxGuide };
    return parsed.guide ?? parsed.transport ?? (parsed as IxGuide);
  } catch {
    return {};
  }
}

const DEFAULT_FROM = "Rua Industrial, 5, 4590-000 Paços de Ferreira, Portugal";

type IxAddress = { detail: string; city: string; postal_code: string; country: string };

/** A InvoiceXpress exige detail/city/postal_code/country preenchidos. */
function parseAddress(raw: string): IxAddress {
  const text = raw.replace(/\s+/g, " ").trim();
  const postal = /(\d{4}-\d{3})/.exec(text)?.[1] ?? "";
  let city = "";
  if (postal) {
    const after = text.slice(text.indexOf(postal) + postal.length);
    city = after.replace(/^[,\s-]+/, "").split(",")[0]?.trim() ?? "";
  }
  if (!city) {
    const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
    city = parts.length > 1 ? (parts[parts.length - 1] ?? "") : "";
  }
  return {
    detail: (text || "N/D").slice(0, 250),
    city: (city || "N/D").slice(0, 100),
    postal_code: postal || "0000-000",
    country: "Portugal",
  };
}

const VAT_RATE = 0.23;

const UNIT_MAP: Record<string, string> = {
  un: "unit",
  und: "unit",
  unid: "unit",
  unidade: "unit",
  pc: "unit",
  pcs: "unit",
  h: "hour",
  hora: "hour",
  horas: "hour",
  dia: "day",
  dias: "day",
  mes: "month",
  serv: "service",
  servico: "service",
};

/** A InvoiceXpress só aceita unidades de uma lista fechada. */
function ixUnit(raw: string | undefined): string {
  const key = (raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f.]/g, "");
  if (!key) return "unit";
  const allowed = ["service", "hour", "day", "month", "tax", "unit", "article", "product", "other"];
  if (allowed.includes(key)) return key;
  return UNIT_MAP[key] ?? "unit";
}

function ordinal(version: number): string {
  return `${version}.ª via`;
}

function buildPayload(
  doc: GcDocument,
  addressFrom: string,
  plate: string,
  version: number,
  previousGuideNumber: string,
  loadedAtValue: string,
) {
  const nif = resolveNif(doc);
  const items = [...doc.produtos, ...doc.servicos].map((l) => ({
    name: [l.codigo, l.nome].filter(Boolean).join(" - ").slice(0, 200) || "Artigo",
    description: [l.detalhes].filter(Boolean).join(" ").slice(0, 500),
    // A Gestão Click já devolve preços com IVA incluído; a InvoiceXpress espera o valor sem IVA.
    unit_price: Math.round((num(l.valorUnitario) / (1 + VAT_RATE)) * 10000) / 10000,
    quantity: num(l.quantidade) || 1,
    unit: ixUnit(l.unidade),
    tax: { name: "IVA23" },
  }));

  return {
    transport: {
      date: issueDates().date,
      due_date: issueDates().dueDate,
      loaded_at: loadedAtValue,
      license_plate: plate || undefined,
      address_from: parseAddress(addressFrom || DEFAULT_FROM),
      address_to: parseAddress(doc.cliente.morada || doc.cliente.nome || "Morada do cliente"),
      client: {
        name: doc.cliente.nome || "Consumidor Final",
        code: `GC-${doc.cliente.id || nif || doc.cliente.nome}`.slice(0, 30),
        ...(nif.length === 9 ? { fiscal_id: nif } : {}),
        ...(doc.cliente.email ? { email: doc.cliente.email } : {}),
        ...(doc.cliente.telefone ? { phone: doc.cliente.telefone } : {}),
        ...(doc.cliente.morada ? { address: doc.cliente.morada } : {}),
      },
      items,
      observations:
        version > 1
          ? `Encomenda ${doc.codigo} — ${ordinal(version)} por falta de entrega da via anterior${previousGuideNumber ? ` (guia n.º ${previousGuideNumber})` : ""}`
          : `Encomenda ${doc.codigo}`,
    },
  };
}

export async function createTransportGuides(
  docs: GcDocument[],
  options: {
    addressFrom: string;
    plate: string;
    loadedAt?: string;
    versions?: Record<string, { version: number; previousGuideNumber: string }>;
  },
): Promise<GuideResult[]> {
  const results: GuideResult[] = [];
  const loadedAtValue = loadedAt(options.loadedAt ?? "");
  for (const doc of docs) {
    const meta = options.versions?.[doc.id];
    const version = meta?.version ?? 1;
    const previousGuideNumber = meta?.previousGuideNumber ?? "";
    try {
      let guide = await ixRequest(
        "/transports.json",
        buildPayload(
          doc,
          options.addressFrom,
          options.plate,
          version,
          previousGuideNumber,
          loadedAtValue,
        ),
      );
      if (!guide.inverted_sequence_number && !guide.sequence_number && guide.id !== undefined) {
        try {
          guide = { ...guide, ...(await ixRequest(`/transports/${guide.id}.json`, undefined, "GET")) };
        } catch {
          /* mantém os dados da criação */
        }
      }
      results.push({
        orderId: doc.id,
        codigo: doc.codigo,
        cliente: doc.cliente.nome,
        ok: true,
        version,
        ...(previousGuideNumber ? { previousGuideNumber } : {}),
        ...(guide.id !== undefined ? { guideId: guide.id } : {}),
        ...(guide.inverted_sequence_number || guide.sequence_number
          ? { guideNumber: guide.inverted_sequence_number ?? guide.sequence_number ?? "" }
          : {}),
        ...(guide.permalink ? { permalink: guide.permalink } : {}),
      });
    } catch (error) {
      results.push({
        orderId: doc.id,
        codigo: doc.codigo,
        cliente: doc.cliente.nome,
        ok: false,
        version,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  }
  return results;
}
