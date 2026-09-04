import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "recent_stock_movements",
  title: "Movimentos de stock recentes",
  description:
    "Lista os movimentos de stock mais recentes (entradas, saídas, ajustes), opcionalmente filtrados por código de produto.",
  inputSchema: {
    code: z.string().trim().min(1).optional().describe("Código exato do produto (opcional)."),
    limit: z.number().int().min(1).max(100).default(25).describe("Número máximo de movimentos."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ code, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);

    let productId: string | undefined;
    if (code) {
      const { data: product, error } = await supabase
        .from("products")
        .select("id")
        .eq("code", code)
        .maybeSingle();
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      if (!product) {
        return { content: [{ type: "text", text: `Produto ${code} não encontrado.` }], isError: true };
      }
      productId = product.id;
    }

    let query = supabase
      .from("stock_movements_unified")
      .select("created_at,movement_type,quantity,reason,reference,notes,origem,product_id")
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (productId) query = query.eq("product_id", productId);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { movements: data ?? [] },
    };
  },
});
