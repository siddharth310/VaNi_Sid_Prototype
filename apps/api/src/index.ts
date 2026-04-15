import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '../../.env') });
loadEnv({ path: resolve(__dirname, '../.env') });
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { loadConfig } from './config.js';
import { createRedisClient } from './lib/redis.js';
import { registerAgentRoutes } from './routes/agents.route.js';
import { registerSessionRoutes } from './routes/sessions.route.js';
import { registerStudioRoutes } from './routes/studio.route.js';
import { registerVoiceRoutes } from './routes/voice.route.js';
import { VoiceEventBus } from './runtime/voice/voice-event-bus.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const redis = createRedisClient(cfg);
  await redis.connect();

  const app = Fastify({ logger: true });
  await app.register(cors, { origin: cfg.FRONTEND_URL });
  await app.register(websocket);

  const bus = new VoiceEventBus();

  app.get('/health', async () => ({ status: 'ok' }));

  await registerAgentRoutes(app, { cfg });
  await registerStudioRoutes(app, { cfg });
  await registerSessionRoutes(app, { cfg, redis });
  await registerVoiceRoutes(app, { cfg, redis, bus });

  await app.listen({ port: cfg.PORT, host: '0.0.0.0' });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
