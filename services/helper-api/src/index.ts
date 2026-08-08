import Fastify from 'fastify';
import { config } from './config.js';
import { healthRoute } from './routes/health.js';
import { normalizeRoute } from './routes/normalize.js';
import { filterCheckRoute } from './routes/filter-check.js';
import { validateClassificationRoute } from './routes/validate-classification.js';
import { formatDigestRoute } from './routes/format-digest.js';
import { validateInterestRoute } from './routes/validate-interest.js';
import { classifyHeuristicRoute } from './routes/classify-heuristic.js';

const app = Fastify({ logger: true });

await app.register(healthRoute);
await app.register(normalizeRoute);
await app.register(filterCheckRoute);
await app.register(validateClassificationRoute);
await app.register(formatDigestRoute);
await app.register(validateInterestRoute);
await app.register(classifyHeuristicRoute);

await app.listen({ port: config.port, host: '0.0.0.0' });
