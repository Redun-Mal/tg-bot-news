import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CATEGORIES } from '../lib/classification-schema.js';
import { formatDigest } from '../lib/digest-format.js';

const bodySchema = z.object({
  items: z.array(
    z.object({
      title: z.string(),
      summary: z.string(),
      whyItMatters: z.string().nullish(),
      categories: z.array(z.enum(CATEGORIES)),
      importance: z.number(),
      relevance: z.number(),
      sourceUrl: z.string(),
    }),
  ),
});

export async function formatDigestRoute(app: FastifyInstance): Promise<void> {
  app.post('/format-digest', async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    return { messages: formatDigest(parsed.data.items) };
  });
}
