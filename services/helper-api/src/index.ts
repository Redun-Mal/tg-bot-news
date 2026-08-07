import Fastify from 'fastify';
import { config } from './config.js';
import { healthRoute } from './routes/health.js';

const app = Fastify({ logger: true });

await app.register(healthRoute);

await app.listen({ port: config.port, host: '0.0.0.0' });
