import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "product_stock_by_location",
  title: "Stock por localização",
  description:
    "Devolve o stock de um produto (por código exato) detalhado por localização e número de coli.",
  inputSchema: {
    code: z.string().trim().min(1).describe("Código exato do produto."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ code }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id,code,name,description,category,total_colis,current_stock,damaged_stock,colis_orfaos,updated_at")
      .eq("code", code)
      .maybeSingle();

    if (productError) return { content: [{ type: "text", text: productError.message }], isError: true };
    if (!product) {
      return { content: [{ type: "text", text: `Produto ${code} não encontrado.` }], isError: true };
    }

    const totals = new Map<string, { location: string | null; colis_number: number; quantity: number }>();
    for (let offset = 0; ; offset += 1000) {
      const { data: counts, error } = await supabase.from("counts")
        .select("id,location,colis_number,quantity").eq("product_id", product.id)
        .order("id").range(offset, offset + 999);
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      for (const row of counts ?? []) {
        const key = JSON.stringify([row.location, row.colis_number]);
        const previous = totals.get(key);
        totals.set(key, { location: row.location, colis_number: row.colis_number, quantity: (previous?.quantity ?? 0) + row.quantity });
      }
      if ((counts?.length ?? 0) < 1000) break;
    }
    const payload = { product, locations: Array.from(totals.values()) };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
