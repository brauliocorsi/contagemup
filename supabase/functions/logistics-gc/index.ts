import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchDocument, listOrders } from "../_shared/gc-logistics.ts";
import { createTransportGuides } from "../_shared/invoicexpress.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims, error: claimsErr } = await authClient.auth.getClaims(
    authHeader.replace("Bearer ", ""),
  );
  if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
  const userId = (claims.claims as { sub?: string }).sub ?? null;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "orders") {
      const from = body.from;
      const to = body.to;
      if (!isDate(from) || !isDate(to)) throw new Error("Datas inválidas");
      if (from > to) throw new Error("A data inicial tem de ser anterior à final");
      const lookbackDays = Number(body.lookbackDays ?? 180);
      return json(await listOrders(from, to, lookbackDays));
    }

    if (action === "orders-by-code") {
      const codes = Array.isArray(body.codes)
        ? body.codes.map((v) => String(v).trim()).filter(Boolean)
        : [];
      if (codes.length === 0) throw new Error("Indique o número de encomenda");
      if (codes.length > 10) throw new Error("Procure no máximo 10 encomendas de cada vez");
      return json(await findOrdersByCode(codes));
    }

    if (action === "document") {
      const id = String(body.id ?? "").trim();
      if (!id) throw new Error("Encomenda inválida");
      return json(await fetchDocument(id));
    }

    if (action === "documents") {
      const ids = Array.isArray(body.ids) ? body.ids.map((v) => String(v).trim()).filter(Boolean) : [];
      if (ids.length === 0) throw new Error("Nenhuma encomenda selecionada");
      if (ids.length > 40) throw new Error("Selecione no máximo 40 encomendas de cada vez");
      const docs = [];
      for (let i = 0; i < ids.length; i += 4) {
        docs.push(...(await Promise.all(ids.slice(i, i + 4).map((id) => fetchDocument(id)))));
      }
      return json({ documents: docs });
    }

    if (action === "guide-history") {
      const ids = Array.isArray(body.ids) ? body.ids.map((v) => String(v).trim()).filter(Boolean) : [];
      if (ids.length === 0) return json({ history: [] });
      const { data, error } = await admin
        .from("transport_guides")
        .select("*")
        .in("order_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return json({ history: data ?? [] });
    }

    if (action === "guides") {
      const ids = Array.isArray(body.ids) ? body.ids.map((v) => String(v).trim()).filter(Boolean) : [];
      if (ids.length === 0) throw new Error("Nenhuma encomenda selecionada");
      if (ids.length > 20) throw new Error("Emita no máximo 20 guias de cada vez");

      const addressFrom = String(body.addressFrom ?? "").trim();
      const plate = String(body.plate ?? "").trim();
      const loadedAt = String(body.loadedAt ?? "").trim();

      const docs = [];
      for (let i = 0; i < ids.length; i += 4) {
        docs.push(...(await Promise.all(ids.slice(i, i + 4).map((id) => fetchDocument(id)))));
      }

      // Versões: cada nova guia da mesma encomenda é uma "2.ª via", "3.ª via", …
      const { data: previous } = await admin
        .from("transport_guides")
        .select("order_id, version, guide_number, created_at")
        .in("order_id", ids)
        .order("created_at", { ascending: false });

      const versions: Record<string, { version: number; previousGuideNumber: string }> = {};
      for (const doc of docs) {
        const rows = (previous ?? []).filter((r) => r.order_id === doc.id);
        const last = rows[0];
        versions[doc.id] = {
          version: (last?.version ?? 0) + 1,
          previousGuideNumber: last?.guide_number ?? "",
        };
      }

      const results = await createTransportGuides(docs, { addressFrom, plate, loadedAt, versions });

      const batchId = crypto.randomUUID();
      const rows = results
        .filter((r) => r.ok)
        .map((r) => ({
          order_id: r.orderId,
          order_code: r.codigo,
          client_name: r.cliente ?? "",
          guide_id: r.guideId ?? null,
          guide_number: r.guideNumber ?? "",
          permalink: r.permalink ?? "",
          plate,
          address_from: addressFrom,
          version: r.version ?? 1,
          batch_id: batchId,
          created_by: userId,
        }));
      if (rows.length > 0) {
        const { error } = await admin.from("transport_guides").insert(rows);
        if (error) console.error("[logistics-gc] histórico de guias:", error.message);
      }

      return json({ results, batchId });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[logistics-gc]", message);
    return json({ error: message }, 400);
  }
});
