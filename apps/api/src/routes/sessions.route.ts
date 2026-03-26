import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { verifyPatientCredentials } from '../auth/patient-verifier.js';
import { writeAuditEvent } from '../audit/audit-logger.js';
import type { AppConfig } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { getChatScope, mergeChatScope } from '../lib/session-redis.js';
import { runChatTurn } from '../runtime/chat/run-chat-turn.js';

const createSessionBody = z.object({
  agentId: z.string().min(1),
  mode: z.enum(['chat', 'voice', 'voice_fallback_chat']),
});

const turnBody = z.object({
  message: z.string().min(1).max(16_000),
});

const authBody = z.object({
  uhid: z.string().min(4).max(64),
  dob: z.string().min(8).max(32),
});

const escalateBody = z.object({
  reason: z.string().min(1).max(2000),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
});

export async function registerSessionRoutes(
  app: FastifyInstance,
  deps: { cfg: AppConfig; redis: Redis }
): Promise<void> {
  const { cfg, redis } = deps;

  app.post('/api/sessions', async (req, reply) => {
    const parsed = createSessionBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body' });
    }
    const agent = await prisma.agent.findUnique({
      where: { id: parsed.data.agentId },
    });
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
        mode: parsed.data.mode,
        status: 'active',
      },
    });
    await mergeChatScope(redis, session.id, {
      isVerified: false,
      authAttempts: 0,
      language: 'en',
      phiIntentPending: false,
    });
    await writeAuditEvent(prisma, session.id, 'session_created', {
      mode: parsed.data.mode,
    });
    return reply.status(201).send({ id: session.id });
  });

  app.get<{ Params: { id: string } }>('/api/sessions/:id', async (req, reply) => {
    const session = await prisma.session.findUnique({
      where: { id: req.params.id },
      include: { agent: true },
    });
    if (!session) {
      return reply.status(404).send({ error: 'Not found' });
    }
    const scope = await getChatScope(redis, session.id);
    return {
      id: session.id,
      agentId: session.agentId,
      mode: session.mode,
      status: session.status,
      language: session.language,
      isVerified: session.isVerified || scope.isVerified,
      emotionState: session.emotionState,
      discoveryTurns: session.discoveryTurns,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      agent: {
        id: session.agent.id,
        name: session.agent.name,
        publishedAt: session.agent.publishedAt?.toISOString() ?? null,
      },
    };
  });

  app.post<{ Params: { id: string } }>(
    '/api/sessions/:id/turns',
    async (req, reply) => {
      const parsed = turnBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid body' });
      }
      const session = await prisma.session.findUnique({
        where: { id: req.params.id },
        include: { agent: true },
      });
      if (!session || session.status !== 'active') {
        return reply.status(404).send({ error: 'Session not found' });
      }
      if (session.mode !== 'chat' && session.mode !== 'voice_fallback_chat') {
        return reply.status(400).send({ error: 'Not a chat session' });
      }

      const scope = await getChatScope(redis, session.id);
      const isVerified = session.isVerified || scope.isVerified;

      const result = await runChatTurn(
        { cfg, redis },
        {
          userMessage: parsed.data.message,
          session: {
            id: session.id,
            discoveryTurns: session.discoveryTurns,
            language: scope.language || session.language,
            isVerified,
          },
          agent: session.agent,
        }
      );

      const t0 = Date.now();
      await prisma.turn.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: parsed.data.message,
          language: result.language,
          emotionDetected: result.emotion ?? undefined,
          guardrailHit: result.guardrailHit,
        },
      });

      await prisma.turn.create({
        data: {
          sessionId: session.id,
          role: 'agent',
          content: result.reply,
          language: result.language,
          guardrailHit: result.guardrailHit,
          escalationTriggered: result.escalated,
          totalLatencyMs: Date.now() - t0,
        },
      });

      await prisma.session.update({
        where: { id: session.id },
        data: {
          language: result.language,
          emotionState: result.emotion ?? session.emotionState,
          discoveryTurns: result.discoveryTurns,
        },
      });

      await mergeChatScope(redis, session.id, {
        ...scope,
        language: result.language,
        phiIntentPending: result.needsPhiAuth,
      });

      if (result.escalated) {
        await prisma.escalation.create({
          data: {
            sessionId: session.id,
            reason: 'runtime_escalation',
            severity: 'HIGH',
          },
        });
      }

      await writeAuditEvent(prisma, session.id, 'chat_turn', {
        guardrailHit: result.guardrailHit,
        escalated: result.escalated,
        needsPhiAuth: result.needsPhiAuth,
      });

      return {
        reply: result.reply,
        language: result.language,
        needsPhiAuth: result.needsPhiAuth,
        escalated: result.escalated,
        guardrailHit: result.guardrailHit,
      };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/api/sessions/:id/turns',
    async (req, reply) => {
      const session = await prisma.session.findUnique({
        where: { id: req.params.id },
      });
      if (!session) {
        return reply.status(404).send({ error: 'Not found' });
      }
      const turns = await prisma.turn.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          role: true,
          content: true,
          language: true,
          createdAt: true,
          guardrailHit: true,
        },
      });
      return turns.map((t) => ({
        id: t.id,
        role: t.role,
        content: t.content,
        language: t.language,
        createdAt: t.createdAt.toISOString(),
        guardrailHit: t.guardrailHit,
      }));
    }
  );

  app.post<{ Params: { id: string } }>(
    '/api/sessions/:id/end',
    async (req, reply) => {
      const session = await prisma.session.findUnique({
        where: { id: req.params.id },
      });
      if (!session) {
        return reply.status(404).send({ error: 'Not found' });
      }
      const ended = new Date();
      await prisma.session.update({
        where: { id: session.id },
        data: {
          status: 'ended',
          endedAt: ended,
          durationSecs: Math.max(
            0,
            Math.floor((ended.getTime() - session.startedAt.getTime()) / 1000)
          ),
        },
      });
      await redis.del(`chat:scope:${session.id}`);
      await writeAuditEvent(prisma, session.id, 'session_ended', {});
      void reply;
      return { ok: true };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/api/sessions/:id/auth',
    async (req, reply) => {
      const parsed = authBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid body' });
      }
      const session = await prisma.session.findUnique({
        where: { id: req.params.id },
      });
      if (!session) {
        return reply.status(404).send({ error: 'Not found' });
      }
      const scope = await getChatScope(redis, session.id);
      if (scope.authAttempts >= cfg.MAX_AUTH_ATTEMPTS) {
        await writeAuditEvent(prisma, session.id, 'phi_auth_locked', {});
        return reply.status(429).send({ error: 'Too many attempts' });
      }
      const v = verifyPatientCredentials(
        parsed.data.uhid,
        parsed.data.dob,
        cfg,
        session.patientUhidHash
      );
      if (!v.ok) {
        await mergeChatScope(redis, session.id, {
          ...scope,
          authAttempts: scope.authAttempts + 1,
        });
        await writeAuditEvent(prisma, session.id, 'phi_auth_failed', {
          attempt: scope.authAttempts + 1,
        });
        return reply.status(401).send({ ok: false });
      }
      await prisma.session.update({
        where: { id: session.id },
        data: {
          isVerified: true,
          patientUhidHash: v.uhidHash,
        },
      });
      await mergeChatScope(redis, session.id, {
        ...scope,
        isVerified: true,
        authAttempts: 0,
        phiIntentPending: false,
      });
      await writeAuditEvent(prisma, session.id, 'phi_auth_ok', {});
      return { ok: true };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/api/sessions/:id/escalate',
    async (req, reply) => {
      const parsed = escalateBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid body' });
      }
      const session = await prisma.session.findUnique({
        where: { id: req.params.id },
      });
      if (!session) {
        return reply.status(404).send({ error: 'Not found' });
      }
      await prisma.escalation.create({
        data: {
          sessionId: session.id,
          reason: parsed.data.reason,
          severity: parsed.data.severity,
        },
      });
      await prisma.session.update({
        where: { id: session.id },
        data: { status: 'escalated' },
      });
      await writeAuditEvent(prisma, session.id, 'manual_escalation', {
        severity: parsed.data.severity,
      });
      void reply;
      return { ok: true };
    }
  );
}
