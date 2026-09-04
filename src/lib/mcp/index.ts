import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchProductsTool from "./tools/search-products";
import productStockTool from "./tools/product-stock";
import lowStockTool from "./tools/low-stock";
import recentMovementsTool from "./tools/recent-movements";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "contagem-stock-up",
  title: "Contagem Stock UP",
  version: "0.1.0",
  instructions:
    "Ferramentas de consulta do armazém Contagem Stock UP: procurar produtos, ver stock por localização e coli, listar produtos em rutura ou negativos e consultar movimentos de stock recentes. Todas as consultas correm com a conta do utilizador autenticado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchProductsTool, productStockTool, lowStockTool, recentMovementsTool],
});
