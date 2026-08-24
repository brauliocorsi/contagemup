import type { SepOrder } from "./types";

export type PlanAssignment = { date: string; run: number; codigo: string };

/** Texto pronto para colar no ChatGPT / Claude Code. */
export function buildAiPrompt(opts: {
  origin: string;
  days: string[];
  maxPerDay: number;
  maxRunsPerDay: number;
  consumption: number;
  fuelPrice: number;
  orders: SepOrder[];
}): string {
  const linhas = opts.orders
    .map(
      (o) =>
        `${o.codigo};${o.cliente};${(o.morada ?? "").replace(/[;\n]+/g, " ").trim()};${
          o.morada?.match(/\d{4}-\d{3}/)?.[0] ?? ""
        };${o.entrega ?? ""};${o.situacao ?? ""}`,
    )
    .join("\n");

  return `És um planeador de rotas de distribuição de mobiliário em Portugal.

ARMAZÉM (saída e regresso todos os dias): ${opts.origin}
DIAS DE TRABALHO DISPONÍVEIS (terça a sábado): ${opts.days.join(", ")}
LIMITES: até ${opts.maxPerDay} entregas por volta e até ${opts.maxRunsPerDay} volta(s) por dia.
CONSUMO: ${opts.consumption} L/100km · GASÓLEO: ${opts.fuelPrice} €/L

REGRAS:
1. Agrupa apenas zonas compatíveis pelo código postal (nunca misturar Lisboa com Braga, por exemplo).
2. Respeita a data de entrega sempre que possível; se moveres uma encomenda de data, indica-o nas notas.
3. Cada volta começa e termina no armazém.
4. Ordena as paragens dentro de cada volta pelo melhor trajeto.

ENCOMENDAS (codigo;cliente;morada;codigo_postal;data_entrega;situacao):
${linhas}

RESPONDE APENAS com linhas neste formato exato, uma por paragem, pela ordem do trajeto,
sem tabelas, sem markdown e sem texto extra:
AAAA-MM-DD;VOLTA;CODIGO

Exemplo:
2026-08-18;1;12345
2026-08-18;1;12346
2026-08-19;2;12350

No fim podes acrescentar linhas a começar por "# " com notas ou sugestões de poupança.`;
}

/** Aceita "AAAA-MM-DD;volta;codigo", vírgulas, tabs, "|" ou cabeçalhos de dia seguidos de códigos. */
export function parseAiPlan(text: string): PlanAssignment[] {
  const out: PlanAssignment[] = [];
  let currentDate = "";
  let currentRun = 1;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const parts = line
      .split(/[;,\t|]+/)
      .map((p) => p.trim())
      .filter(Boolean);

    const dateInLine = line.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
    const runInLine = Number(line.match(/volta\s*(\d+)/i)?.[1] ?? 0);

    if (parts.length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(parts[0]!)) {
      const codigo = parts[parts.length - 1]!;
      const run = Number(String(parts[1]).replace(/\D+/g, "")) || 1;
      currentDate = parts[0]!;
      currentRun = run;
      if (codigo) out.push({ date: currentDate, run, codigo });
      continue;
    }

    if (parts.length === 2 && /^\d{4}-\d{2}-\d{2}$/.test(parts[0]!)) {
      currentDate = parts[0]!;
      out.push({ date: currentDate, run: currentRun, codigo: parts[1]! });
      continue;
    }

    // Cabeçalho de dia/volta
    if (dateInLine && parts.length <= 2) {
      currentDate = dateInLine;
      currentRun = runInLine || 1;
      continue;
    }
    if (!dateInLine && runInLine) {
      currentRun = runInLine;
      continue;
    }

    // Linha só com código
    const codigo = line.replace(/^[-*\d.)\s]+/, "").trim();
    if (currentDate && /^[A-Za-z0-9/_-]{2,20}$/.test(codigo)) {
      out.push({ date: currentDate, run: currentRun, codigo });
    }
  }

  return out;
}
