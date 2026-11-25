import { z } from 'zod';

const text = z.string().trim().min(1).max(255);
export const batchSchema = z.object({
  batch_id: text,
  items: z.array(z.object({
    order_number: text,
    product_code: text,
    barcode: z.string().trim().max(255),
    product_description: text.max(2000),
    measure: z.string().trim().max(255),
    fabric_type: z.string().trim().max(255),
    fabric_ref: z.string().trim().max(255),
    color: z.string().trim().max(255),
    quantity: z.number().int().positive().max(2147483647),
    dispatched_at: z.string().datetime({ offset: true }),
  }).strict()).min(1),
}).strict();

// Digest both inputs before comparing, including length, to avoid a prefix match.
export async function validToken(provided: string | null, expected: string | undefined): Promise<boolean> {
  if (!provided || !expected) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}