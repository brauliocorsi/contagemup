// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const sql = readFileSync(new URL('../../supabase/data-fixes/reset-product-minimums.sql', import.meta.url), 'utf8');
describe('requested product minimum reset in an isolated database', () => {
  it('sets every existing positive minimum to zero and leaves physical stock unchanged', async () => {
    const db = new PGlite();
    try {
      await db.exec('CREATE TABLE public.products (id integer PRIMARY KEY, min_stock integer, current_stock integer); INSERT INTO public.products VALUES (1,5,8),(2,12,-2),(3,0,0);');
      await db.query(sql);
      const { rows } = await db.query('SELECT min_stock, current_stock FROM public.products ORDER BY id');
      expect(rows).toEqual([{ min_stock: 0, current_stock: 8 }, { min_stock: 0, current_stock: -2 }, { min_stock: 0, current_stock: 0 }]);
      expect((await db.query(sql)).rows).toEqual([{ reset_products: 0 }]);
    } finally { await db.close(); }
  });
});
