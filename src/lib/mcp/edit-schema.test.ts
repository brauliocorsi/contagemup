import { describe, it, expect } from 'vitest';
import { editProductSchema } from './edit-schema';

const input = { code: 'CAM19', expected_updated_at: '2026-11-15T09:59:00Z', name: 'Cama', confirm: true };
describe('Agent metadata editing boundaries', () => {
  it('requires explicit confirmation', () => {
    expect(editProductSchema.safeParse({ ...input, confirm: false }).success).toBe(false);
  });
  it('rejects stock and coli updates', () => {
    expect(editProductSchema.safeParse({ ...input, current_stock: 5 }).success).toBe(false);
    expect(editProductSchema.safeParse({ ...input, total_colis: 3 }).success).toBe(false);
  });
  it('requires the last observed product version', () => {
    expect(editProductSchema.safeParse({ ...input, expected_updated_at: undefined }).success).toBe(false);
  });
  it('accepts name and description without changing the code', () => {
    expect(editProductSchema.parse({ ...input, description: '' })).toEqual({ ...input, description: '' });
  });
  it('requires at least one editable field', () => {
    expect(editProductSchema.safeParse({ code: input.code, expected_updated_at: input.expected_updated_at, confirm: true }).success).toBe(false);
  });
});