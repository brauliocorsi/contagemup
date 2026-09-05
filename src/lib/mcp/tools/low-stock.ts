import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_low_stock",
  title: "Produtos em rutura ou negativos",
  description:
    "Lista produtos com stock abaixo de zero ou abaixo de um limite indicado, para reposição e correções.",
  inputSchema: {
    threshold: z.number().int().default(0).describe("Mostrar produtos com stock igual ou inferior a este valor."),
    limit: z.number().int().min(1).max(200).default(50).describe("Número máximo de resultados."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ threshold, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("products")
      .select("code,name,category,current_stock,damaged_stock,min_stock")
      .lte("current_stock", threshold ?? 0)
      .order("current_stock")
      .limit(limit ?? 50);

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { products: data ?? [] },
    };
  },
});
