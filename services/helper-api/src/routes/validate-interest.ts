import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validateInterest } from '../lib/interests.js';

const bodySchema = z.object({
  interest: z.string(),
});

export async function validateInterestRoute(app: FastifyInstance): Promise<void> {
  app.post('/validate-interest', async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    return validateInterest(parsed.data.interest);
  });
}
