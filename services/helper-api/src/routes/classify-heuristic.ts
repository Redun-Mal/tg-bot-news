import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { heuristicClassify } from '../lib/heuristic-classify.js';

const bodySchema = z.object({
  title: z.string(),
  rawText: z.string(),
  interests: z.array(z.string()).default([]),
});

export async function classifyHeuristicRoute(app: FastifyInstance): Promise<void> {
  app.post('/classify-heuristic', async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    return heuristicClassify(parsed.data);
  });
}
