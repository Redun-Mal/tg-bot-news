import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { filterCheck } from '../lib/filter.js';

// Takes already-normalized text (see POST /normalize) so normalization logic
// stays in one place and callers don't pay for it twice.
const bodySchema = z.object({
  normalizedText: z.string(),
});

export async function filterCheckRoute(app: FastifyInstance): Promise<void> {
  app.post('/filter-check', async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    return filterCheck(parsed.data.normalizedText);
  });
}
