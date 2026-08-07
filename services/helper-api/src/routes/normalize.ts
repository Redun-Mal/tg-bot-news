import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { computeContentHash, normalizeText } from '../lib/normalize.js';

const bodySchema = z.object({
  text: z.string(),
});

export async function normalizeRoute(app: FastifyInstance): Promise<void> {
  app.post('/normalize', async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const normalizedText = normalizeText(parsed.data.text);
    const contentHash = computeContentHash(normalizedText);

    return { normalizedText, contentHash };
  });
}
