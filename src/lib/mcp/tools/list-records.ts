import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser } from '../supabase';

const catalogs = {
  products: { table: 'products', columns: 'id,code,name,description,category,total_colis,current_stock,damaged_stock,colis_orfaos,updated_at' },
  locations: { table: 'warehouse_locations', columns: 'id,code,location_type,plate,is_staging,updated_at' },
  audits: { table: 'location_audits', columns: 'id,name,status,scope,locations,assigned_to,completed_at,delivered_at,updated_at' },
  damages: { table: 'product_damages', columns: 'id,product_id,colis_number,quantity,damage_type,description,location,status,updated_at' },
  picking: { table: 'scanner_picking_tasks', columns: 'id,name,reference,status,route_id,updated_at' },
  deliveries: { table: 'delivery_notes', columns: 'id,order_number,status,dock_location,vehicle_location,route_id,updated_at' },
  routes: { table: 'route_schedules', columns: 'id,name,scheduled_date,status,driver_id,vehicle_location_id,updated_at' },
} as const;

export default defineTool({
  name: 'list_warehouse_records',
  title: 'Consultar dados do armazém',
  description: 'Consulta produtos, localizações, conferências, avarias, picking, notas de entrega ou rotas em páginas, respeitando as permissões da conta.',
  inputSchema: {
    kind: z.enum(['products', 'locations', 'audits', 'damages', 'picking', 'deliveries', 'routes']).describe('Tipo de informação.'),
    offset: z.number().int().min(0).default(0).describe('Início da página; use next_offset para continuar.'),
    limit: z.number().int().min(1).max(100).default(50).describe('Registos por página.'),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ kind, offset, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: 'text', text: 'Não autenticado' }], isError: true };
    const catalog = catalogs[kind];
    const table: string = catalog.table;
    const columns: string = catalog.columns;
    const { data, error } = await supabaseForUser(ctx).from(table)
      .select(columns).order('id').range(offset, offset + limit - 1);
    if (error) return { content: [{ type: 'text', text: error.message }], isError: true };
    const payload = { records: data ?? [], next_offset: data?.length === limit ? offset + limit : null };
    return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
  },
});