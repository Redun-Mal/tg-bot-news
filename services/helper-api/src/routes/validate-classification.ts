import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validateClassification } from '../lib/classification-schema.js';

const bodySchema = z.object({
  rawResponse: z.string(),
});

export async function validateClassificationRoute(app: FastifyInstance): Promise<void> {
  app.post('/validate-classification', async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    return validateClassification(parsed.data.rawResponse);
  });
}
