import { z } from 'zod';

export const editProductSchema = z.object({
  code: z.string().trim().min(1),
  expected_updated_at: z.string().datetime({ offset: true }),
  name: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  confirm: z.literal(true),
}).strict().refine(value => value.name !== undefined || value.description !== undefined, {
  message: 'Indique nome ou descrição.',
});