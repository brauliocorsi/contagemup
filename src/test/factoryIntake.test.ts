// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createHandler } from '../../supabase/functions/factory-intake/handler';

const PRODUCT = '00000000-0000-0000-0000-000000000001';
const TEST_TOKEN = 'isolated-test-value-not-a-project-secret';
const item = {
  order_number: 'TEST-ORDER', product_code: 'TEST-BED', barcode: 'TEST-BARCODE',
  product_description: 'Produto de teste', measure: '195x150',
  fabric_type: 'Teste', fabric_ref: 'REF', color: 'Teste',
  quantity: 1, dispatched_at: '2026-11-25T00:00:00Z',
};
let db: PGlite;
let handler: ReturnType<typeof createHandler>;
const queryCount = async (table: string) => {
  const result = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
  return result.rows[0].n;
};
function request(payload: unknown, token: string | null = TEST_TOKEN) {
  return new Request('https://example.test/factory-intake', {
    method: 'POST', headers: token === null ? {} : { 'x-up-token': token },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('test.role',true) $$;
    CREATE TABLE products(id uuid PRIMARY KEY,code text UNIQUE,barcode text,total_colis int);
    CREATE TABLE product_barcodes(product_id uuid,barcode text);
    CREATE TABLE warehouse_locations(code text,location_type text);
    CREATE TABLE counts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid,colis_number int,quantity int,session_id uuid,location text,counted_by uuid,updated_at timestamptz);
    CREATE TABLE stock_movements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid,movement_type text,quantity int,reason text,reference text,notes text,supplier_name text);
    CREATE TABLE stock_movement_lines(movement_id uuid,product_id uuid,colis_number int,quantity int,location text);
    CREATE FUNCTION effective_total_colis(p uuid) RETURNS int LANGUAGE sql AS $$ SELECT total_colis FROM products WHERE id=p $$;
    INSERT INTO products VALUES('${PRODUCT}','TEST-BED','TEST-BARCODE',3);
    INSERT INTO warehouse_locations VALUES('CONF','conferencia');
  `);
  await db.exec(readFileSync('drizzle/migrations/0008_factory_intake_atomic_batches.sql', 'utf8'));
  handler = createHandler({}, {
    expectedToken: () => TEST_TOKEN,
    processBatch: async (payload) => {
      try {
        const result = await db.query<{ result: unknown }>('SELECT receive_factory_batch($1::jsonb) AS result', [JSON.stringify(payload)]);
        return { data: result.rows[0].result, error: null };
      } catch (error) {
        return { data: null, error: error as { code: string; message: string } };
      }
    },
  });
}, 30000);
beforeEach(async () => {
  await db.exec(`TRUNCATE factory_intake_items,factory_intake_batches,stock_movements,stock_movement_lines,counts; SET test.role='service_role';`);
});
afterAll(async () => { await db.close(); });

describe('factory intake: real SQL in isolated database and HTTP handler', () => {
  it('rejects missing token with 401 and creates no stock', async () => {
    expect((await handler(request({ batch_id: 'b', items: [item] }, null))).status).toBe(401);
    expect(await queryCount('counts')).toBe(0);
  });
  it('rejects mismatched token with 401', async () => {
    expect((await handler(request({}, 'wrong'))).status).toBe(401);
  });
  it('rejects token prefixes with 401', async () => {
    expect((await handler(request({}, TEST_TOKEN.slice(0, -1)))).status).toBe(401);
  });
  it('fails closed when the project token is unset', async () => {
    const unavailable = createHandler({}, { expectedToken: () => undefined, processBatch: async () => { throw new Error('must not run'); } });
    expect((await unavailable(request({}))).status).toBe(401);
  });
  it('accepts only POST (except CORS preflight)', async () => {
    expect((await handler(new Request('https://example.test', { method: 'GET' }))).status).toBe(405);
  });
  it('allows x-up-token in browser preflight', async () => {
    const response = await handler(new Request('https://example.test', { method: 'OPTIONS' }));
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('x-up-token');
  });
  it('rejects malformed JSON', async () => {
    expect((await handler(request('{'))).status).toBe(400);
  });
  it.each([0, -1, 1.5])('rejects invalid quantity %s', async (quantity) => {
    expect((await handler(request({ batch_id: 'b', items: [{ ...item, quantity }] }))).status).toBe(400);
    expect(await queryCount('counts')).toBe(0);
  });
  it('rejects an empty batch', async () => {
    expect((await handler(request({ batch_id: 'b', items: [] }))).status).toBe(400);
  });
  it('rejects invalid dispatch dates', async () => {
    expect((await handler(request({ batch_id: 'b', items: [{ ...item, dispatched_at: 'yesterday' }] }))).status).toBe(400);
  });
  it('receives two complete products as 2 of each of the 3 colis in CONF', async () => {
    const response = await handler(request({ batch_id: 'b', items: [{ ...item, quantity: 2 }] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, batch_id: 'b', processed_items: 1 });
    const counts = await db.query('SELECT colis_number,quantity,location FROM counts ORDER BY colis_number');
    expect(counts.rows).toEqual([1, 2, 3].map(colis_number => ({ colis_number, quantity: 2, location: 'CONF' })));
    expect((await db.query('SELECT quantity FROM stock_movements')).rows).toEqual([{ quantity: 6 }]);
    expect(await queryCount('stock_movement_lines')).toBe(3);
  });
  it('retains every factory field and the order number', async () => {
    await handler(request({ batch_id: 'b', items: [item] }));
    const result = await db.query('SELECT order_number,product_code,barcode,product_description,measure,fabric_type,fabric_ref,color,quantity FROM factory_intake_items');
    const { dispatched_at: _, ...expected } = item;
    expect(result.rows).toEqual([expected]);
  });
  it('returns saved result on batch retry without duplicate stock or movements', async () => {
    const payload = { batch_id: 'retry', items: [item] };
    await handler(request(payload));
    const response = await handler(request(payload));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, batch_id: 'retry', processed_items: 1, already_processed: true });
    expect(await queryCount('stock_movements')).toBe(1);
    expect((await db.query('SELECT sum(quantity)::int AS total FROM counts')).rows[0]).toEqual({ total: 3 });
  });
  it('does not silently process a new payload under an already used batch_id', async () => {
    await handler(request({ batch_id: 'retry', items: [item] }));
    await handler(request({ batch_id: 'retry', items: [{ ...item, quantity: 20 }] }));
    expect((await db.query('SELECT sum(quantity)::int AS total FROM counts')).rows[0]).toEqual({ total: 3 });
  });
  it('rolls back earlier valid items if another item has an unknown code', async () => {
    const response = await handler(request({ batch_id: 'bad', items: [item, { ...item, product_code: 'UNKNOWN' }] }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('UNKNOWN');
    expect(await queryCount('counts')).toBe(0);
    expect(await queryCount('stock_movements')).toBe(0);
    expect(await queryCount('factory_intake_batches')).toBe(0);
  });
  it('allows corrected resubmission after a fully rolled back batch', async () => {
    await handler(request({ batch_id: 'bad', items: [{ ...item, product_code: 'UNKNOWN' }] }));
    expect((await handler(request({ batch_id: 'bad', items: [item] }))).status).toBe(200);
  });
  it('accumulates repeated product lines instead of dropping items', async () => {
    const response = await handler(request({ batch_id: 'b', items: [item, { ...item, quantity: 2 }] }));
    expect((await response.json()).processed_items).toBe(2);
    expect(await queryCount('stock_movements')).toBe(2);
    expect((await db.query('SELECT sum(quantity)::int AS total FROM counts')).rows[0]).toEqual({ total: 9 });
  });
  it('adds to CONF without touching another location', async () => {
    await db.exec(`INSERT INTO counts(product_id,colis_number,quantity,location) VALUES('${PRODUCT}',1,5,'A1');`);
    await handler(request({ batch_id: 'b', items: [item] }));
    expect((await db.query("SELECT quantity FROM counts WHERE location='A1'")).rows).toEqual([{ quantity: 5 }]);
  });
  it('denies a non-service database caller even when bypassing the HTTP handler', async () => {
    await db.exec("SET test.role='authenticated';");
    await expect(db.query('SELECT receive_factory_batch($1::jsonb)', [JSON.stringify({ batch_id: 'b', items: [item] })])).rejects.toMatchObject({ code: '42501' });
  });
});