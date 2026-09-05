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
      .select("id,code,name,category,total_colis,current_stock,damaged_stock")
      .eq("code", code)
      .maybeSingle();

    if (productError) return { content: [{ type: "text", text: productError.message }], isError: true };
    if (!product) {
      return { content: [{ type: "text", text: `Produto ${code} não encontrado.` }], isError: true };
    }

    const { data: counts, error: countsError } = await supabase
      .from("counts")
      .select("location,colis_number,quantity,updated_at")
      .eq("product_id", product.id)
      .order("location", { nullsFirst: true })
      .order("colis_number");

    if (countsError) return { content: [{ type: "text", text: countsError.message }], isError: true };

    const payload = { product, locations: counts ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
