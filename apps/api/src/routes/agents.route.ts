import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import type { AgentSpec } from '@vhos/shared';
import type { AppConfig } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { buildSystemPrompt } from '../runtime/prompt-assembler.js';
import {
  agentSpecSchema,
  validateAgentSpec,
} from '../validation/agent-spec.schema.js';

type PersistedAgent = {
  id: string;
  name: string;
  category: string;
  icon: string;
  color: string;
  voiceId: string;
  isBuiltIn: boolean;
  version: string;
  environment: string | null;
  specJson: unknown;
  guardrailsJson: unknown;
  systemPromptCache: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function serializeAgent(agent: PersistedAgent): Record<string, unknown> {
  return {
    id: agent.id,
    name: agent.name,
    category: agent.category,
    icon: agent.icon,
    color: agent.color,
    voiceId: agent.voiceId,
    isBuiltIn: agent.isBuiltIn,
    version: agent.version,
    environment: agent.environment,
    specJson: agent.specJson,
    guardrailsJson: agent.guardrailsJson,
    systemPromptCache: agent.systemPromptCache,
    publishedAt: agent.publishedAt?.toISOString() ?? null,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  };
}

async function notifyAgentCatalogRefresh(cfg: AppConfig): Promise<void> {
  const response = await fetch(cfg.AGENT_CATALOG_REFRESH_URL, {
    method: 'POST'
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    const detail = errorBody ? `: ${errorBody}` : '';
    throw new Error(`Agent catalog refresh webhook failed with status ${response.status}${detail}`);
  }
}

async function deleteAgentAndRelatedData(agentId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const sessions = await tx.session.findMany({
      where: { agentId },
      select: { id: true },
    });
    const sessionIds = sessions.map((s: { id: string }) => s.id);
    if (sessionIds.length > 0) {
      await tx.turn.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await tx.escalation.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await tx.auditEvent.deleteMany({ where: { sessionId: { in: sessionIds } } });
    }
    await tx.session.deleteMany({ where: { agentId } });
    await tx.scheduledSession.deleteMany({ where: { agentId } });
    await tx.agent.delete({ where: { id: agentId } });
  });
}

export async function registerAgentRoutes(
  app: FastifyInstance,
  deps: { cfg: AppConfig }
): Promise<void> {
  const { cfg } = deps;

  app.get('/api/agents', async () => {
    const rows = await prisma.agent.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(serializeAgent);
  });

  app.post<{ Body: Record<string, unknown> }>('/api/agents', async (req, reply) => {
    const body = req.body;
    const validation = validateAgentSpec(body.specJson ?? body);
    if (!validation.valid) {
      return reply.status(400).send({
        error: 'Invalid agent spec',
        fieldErrors: validation.fieldErrors,
        tabStatus: validation.tabStatus,
      });
    }
    const spec = agentSpecSchema.parse(body.specJson ?? body) as AgentSpec;
    const agent = await prisma.agent.create({
      data: {
        name: spec.name,
        category: spec.category,
        icon: spec.icon ?? '🤖',
        color: spec.color ?? '#00D4AA',
        voiceId: spec.voiceId ?? 'alloy',
        isBuiltIn: false,
        specJson: spec as object,
        guardrailsJson: spec.guardrails as object,
      },
    });

    try {
      await notifyAgentCatalogRefresh(cfg);
    } catch (error) {
      req.log.error({ err: error, agentId: agent.id }, 'Failed to notify agent catalog refresh webhook');
    }

    return reply.status(201).send({ id: agent.id });
  });

  app.get<{ Params: { id: string } }>('/api/agents/:id', async (req, reply) => {
    const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!agent) {
      return reply.status(404).send({ error: 'Not found' });
    }
    return serializeAgent(agent);
  });

  app.put<{ Params: { id: string }; Body: { specJson?: unknown } & Record<string, unknown> }>(
    '/api/agents/:id',
    async (req, reply) => {
      const existing = await prisma.agent.findUnique({ where: { id: req.params.id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Not found' });
      }
      if (existing.isBuiltIn) {
        return reply.status(403).send({ error: 'Built-in agents cannot be modified' });
      }
      const rawSpec = req.body.specJson ?? req.body;
      const validation = validateAgentSpec(rawSpec);
      if (!validation.valid) {
        return reply.status(400).send({
          error: 'Invalid agent spec',
          fieldErrors: validation.fieldErrors,
          tabStatus: validation.tabStatus,
        });
      }
      const spec = agentSpecSchema.parse(rawSpec) as AgentSpec;
      const agent = await prisma.agent.update({
        where: { id: req.params.id },
        data: {
          name: spec.name,
          category: spec.category,
          icon: spec.icon ?? '🤖',
          color: spec.color ?? '#00D4AA',
          voiceId: spec.voiceId ?? 'alloy',
          specJson: spec as object,
          guardrailsJson: spec.guardrails as object,
        },
      });
      return { id: agent.id, updatedAt: agent.updatedAt.toISOString() };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/api/agents/:id/validate',
    async (req, reply) => {
      const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
      if (!agent) {
        return reply.status(404).send({ error: 'Not found' });
      }
      const result = validateAgentSpec(agent.specJson);
      return reply.send(result);
    }
  );

  app.patch<{ Params: { id: string }; Body: { specJson: unknown } }>(
    '/api/agents/:id/draft',
    async (req, reply) => {
      const existing = await prisma.agent.findUnique({ where: { id: req.params.id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Not found' });
      }
      if (existing.isBuiltIn) {
        return reply.status(403).send({ error: 'Built-in agents cannot be modified' });
      }
      const raw = req.body.specJson;
      const specObj =
        raw && typeof raw === 'object'
          ? (raw as Record<string, unknown>)
          : {};
      const gr = specObj.guardrails;
      const guardrailsJson = Array.isArray(gr)
        ? (gr as Prisma.InputJsonValue)
        : existing.guardrailsJson === null
          ? Prisma.JsonNull
          : (existing.guardrailsJson as Prisma.InputJsonValue);
      await prisma.agent.update({
        where: { id: req.params.id },
        data: {
          specJson: specObj as object,
          guardrailsJson,
          name: typeof specObj.name === 'string' ? specObj.name : existing.name,
          category: typeof specObj.category === 'string' ? specObj.category : existing.category,
        },
      });
      return { ok: true };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/api/agents/:id/publish',
    async (req, reply) => {
      const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
      if (!agent) {
        return reply.status(404).send({ error: 'Not found' });
      }
      const validation = validateAgentSpec(agent.specJson);
      if (!validation.valid) {
        return reply.status(400).send({
          error: 'Cannot publish invalid spec',
          ...validation,
        });
      }
      const spec = agentSpecSchema.parse(agent.specJson) as AgentSpec;
      const systemPrompt = buildSystemPrompt(spec, null, {});
      const updated = await prisma.agent.update({
        where: { id: req.params.id },
        data: {
          publishedAt: new Date(),
          systemPromptCache: systemPrompt,
        },
      });
      return { publishedAt: updated.publishedAt?.toISOString() ?? null };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/api/agents/:id/unpublish',
    async (req, reply) => {
      const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
      if (!agent) {
        return reply.status(404).send({ error: 'Not found' });
      }
      if (!agent.publishedAt) {
        return reply.status(400).send({ error: 'Agent is not published' });
      }
      const updated = await prisma.agent.update({
        where: { id: req.params.id },
        data: { publishedAt: null },
      });
      return { publishedAt: updated.publishedAt?.toISOString() ?? null };
    }
  );

  app.delete<{ Params: { id: string } }>('/api/agents/:id', async (req, reply) => {
    const existing = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return reply.status(404).send({ error: 'Not found' });
    }
    if (existing.isBuiltIn) {
      return reply.status(403).send({ error: 'Built-in agents cannot be deleted' });
    }
    await deleteAgentAndRelatedData(req.params.id);

    try {
      await notifyAgentCatalogRefresh(cfg);
    } catch (error) {
      req.log.error({ err: error, agentId: req.params.id }, 'Failed to notify agent catalog refresh webhook');
    }

    return reply.status(204).send();
  });

  app.post<{ Params: { id: string } }>('/api/agents/:id/test', async (req, reply) => {
    void req;
    return reply.status(501).send({
      error: 'Test suite runs in Phase 3 (LangGraph runtime)',
    });
  });

  app.get<{ Params: { id: string } }>(
    '/api/agents/:id/prompt-preview',
    async (req, reply) => {
      const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
      if (!agent) {
        return reply.status(404).send({ error: 'Not found' });
      }
      const validation = validateAgentSpec(agent.specJson);
      if (!validation.valid) {
        return reply.status(400).send(validation);
      }
      const spec = agentSpecSchema.parse(agent.specJson) as AgentSpec;
      const prompt = buildSystemPrompt(spec, null, {});
      return { prompt };
    }
  );

  app.post<{ Body: { message: string; model: string; max_rounds: number } }>(
    '/api/agents/auto',
    async (req, reply) => {
      try {
        const response = await fetch(`${cfg.ORCHESTRATION_BASE_URL}/v1/agents/auto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req.body),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          return reply.status(response.status).send({ error: text || 'Orchestration layer error' });
        }

        const data = await response.json();
        return reply.send(data);
      } catch (error) {
        req.log.error({ err: error }, 'Failed to reach orchestration layer');
        return reply.status(502).send({ error: 'Failed to reach orchestration layer' });
      }
    }
  );
}
