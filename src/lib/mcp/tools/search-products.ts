import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_products",
  title: "Procurar produtos",
  description:
    "Procura produtos por código, nome ou categoria e devolve stock atual, stock avariado e número de colis.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Código, nome ou parte do nome do produto."),
    limit: z.number().int().min(1).max(50).default(20).describe("Número máximo de resultados."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const term = query.replace(/[%,]/g, " ").trim();
    const { data, error } = await supabase
      .from("products")
      .select("code,name,category,total_colis,current_stock,damaged_stock,min_stock,location")
      .or(`code.ilike.%${term}%,name.ilike.%${term}%,category.ilike.%${term}%`)
      .order("name")
      .limit(limit ?? 20);

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { products: data ?? [] },
    };
  },
});
