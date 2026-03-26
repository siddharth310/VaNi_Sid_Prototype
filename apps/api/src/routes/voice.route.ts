import { PassThrough } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import type { AgentSpec } from '@vhos/shared';
import type { AppConfig } from '../config.js';
import { STUDIO_DRAFT_AGENT_ID } from '../agents/builtin-registry.js';
import { prisma } from '../lib/prisma.js';
import { attachRealtimeProxy } from '../runtime/voice/realtime-proxy.js';
import type { VoiceEventBus } from '../runtime/voice/voice-event-bus.js';

function voiceSessionRedisKey(sessionId: string): string {
  return `voice:session:${sessionId}`;
}

function voiceDraftRedisKey(sessionId: string): string {
  return `voice:draft:${sessionId}`;
}

const DRAFT_TTL_SEC = 30 * 60;

export async function registerVoiceRoutes(
  app: FastifyInstance,
  deps: { cfg: AppConfig; redis: Redis; bus: VoiceEventBus }
): Promise<void> {
  const { cfg, redis, bus } = deps;

  app.post<{
    Body: {
      agentId?: string;
      draftSpec?: AgentSpec;
      isDraft?: boolean;
    };
  }>('/api/voice/session/start', async (req, reply) => {
    const { agentId, draftSpec, isDraft } = req.body;
    if (isDraft && draftSpec) {
      const agent = await prisma.agent.findUnique({
        where: { id: STUDIO_DRAFT_AGENT_ID },
      });
      if (!agent) {
        return reply.status(500).send({ error: 'Studio draft agent not seeded' });
      }
      const session = await prisma.session.create({
        data: {
          agentId: agent.id,
          mode: 'voice',
          status: 'active',
        },
      });
      await redis.set(
        voiceDraftRedisKey(session.id),
        JSON.stringify(draftSpec),
        'EX',
        DRAFT_TTL_SEC
      );
      await redis.set(
        voiceSessionRedisKey(session.id),
        JSON.stringify({ status: 'active' }),
        'EX',
        86_400
      );
      const host = cfg.PUBLIC_WS_HOST ?? `localhost:${cfg.PORT}`;
      const protocol = cfg.NODE_ENV === 'production' ? 'wss' : 'ws';
      const wsUrl = `${protocol}://${host}/api/voice/session/${session.id}`;
      return { sessionId: session.id, wsUrl };
    }

    if (!agentId) {
      return reply.status(400).send({ error: 'agentId is required' });
    }
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found' });
    }
    if (!agent.publishedAt) {
      return reply.status(403).send({
        error: 'Agent is not published or has been disabled',
      });
    }

    const session = await prisma.session.create({
      data: {
        agentId: agent.id,
        mode: 'voice',
        status: 'active',
      },
    });

    await redis.set(
      voiceSessionRedisKey(session.id),
      JSON.stringify({ status: 'active' }),
      'EX',
      86_400
    );

    const host = cfg.PUBLIC_WS_HOST ?? `localhost:${cfg.PORT}`;
    const protocol = cfg.NODE_ENV === 'production' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${host}/api/voice/session/${session.id}`;

    return {
      sessionId: session.id,
      wsUrl,
    };
  });

  app.get<{ Params: { id: string } }>(
    '/api/voice/session/:id/events',
    async (req, reply) => {
      const sessionId = req.params.id;
      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (!session) {
        return reply.status(404).send({ error: 'Session not found' });
      }

      const stream = new PassThrough();
      reply.header('Content-Type', 'text/event-stream; charset=utf-8');
      reply.header('Cache-Control', 'no-cache, no-transform');
      reply.header('Connection', 'keep-alive');

      const unsubscribe = bus.subscribe(sessionId, (payload) => {
        stream.write(`data: ${JSON.stringify(payload)}\n\n`);
      });

      req.raw.on('close', () => {
        unsubscribe();
        stream.end();
      });

      return reply.send(stream);
    }
  );

  app.post<{ Params: { id: string } }>(
    '/api/voice/session/:id/end',
    async (req, reply) => {
      const sessionId = req.params.id;
      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (!session) {
        return reply.status(404).send({ error: 'Session not found' });
      }

      const ended = new Date();
      const durationSecs = Math.max(
        0,
        Math.floor((ended.getTime() - session.startedAt.getTime()) / 1000)
      );

      await prisma.session.update({
        where: { id: sessionId },
        data: {
          status: 'ended',
          endedAt: ended,
          durationSecs,
        },
      });

      await redis.del(voiceSessionRedisKey(sessionId));
      await redis.del(voiceDraftRedisKey(sessionId));
      bus.publish(sessionId, { type: 'session_ended', sessionId: '[REDACTED]' });

      void req;
      return { ok: true };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/api/voice/session/:id',
    { websocket: true },
    (connection, req) => {
      const sessionId = req.params.id;
      void attachRealtimeProxy({
        cfg,
        sessionId,
        socket: connection,
        bus,
        redis,
      }).catch(() => {
        connection.close();
      });
    }
  );
}
