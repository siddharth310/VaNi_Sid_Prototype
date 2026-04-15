import type { FastifyInstance } from 'fastify';
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

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asNonEmptyString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(/\r?\n|,/)
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }
  return [];
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'agent';
}

function normalizeSpecForWebhook(spec: Record<string, unknown>): Record<string, unknown> {
  const goal = asRecord(spec.goal);
  const operations = asRecord(spec.operations);
  const contextAccess = asRecord(spec.contextAccess);
  const llm = asRecord(spec.llm);

  return {
    personaName: asNonEmptyString(spec.personaName, asNonEmptyString(spec.name, 'Unknown Persona')),
    tone: asNonEmptyString(spec.tone, asNonEmptyString(spec.tonePreset, 'Warm & caring')),
    empathyLevel: asNumber(spec.empathyLevel, 3),
    languages: asStringArray(spec.languages),
    domain: asNonEmptyString(spec.domain, 'General'),
    goal: {
      primary: asNonEmptyString(goal.primary, asNonEmptyString(spec.purpose, '')),
      successCondition: asNonEmptyString(goal.successCondition, ''),
      escalationTrigger: asStringArray(goal.escalationTrigger),
    },
    llm: {
      model: asNonEmptyString(spec.llmModel, asNonEmptyString(llm.model, 'gpt-4o')),
      temperature: asNumber(llm.temperature, 0.7),
      maxSteps: asNumber(llm.maxSteps, 20),
    },
    tools: asStringArray(spec.tools),
    guardrails: Array.isArray(spec.guardrails) ? spec.guardrails : [],
    operations: {
      channels: {
        chat: asBoolean(operations.channelChat, true),
        voice: asBoolean(operations.channelVoice, true),
        phone: asBoolean(operations.channelPhone, false),
      },
      humanInLoop: asBoolean(spec.humanInLoop, false),
      escalationTeam: asNonEmptyString(operations.escalationTeam, ''),
      sessionTimeoutMins: asNumber(operations.sessionTimeoutMins, 15),
    },
    conversation: {
      openingLine: asNonEmptyString(spec.openingLine, ''),
      closingLine: asNonEmptyString(spec.closingLine, ''),
      fallback: asNonEmptyString(spec.fallbackUtterance, ''),
      ambiguityPrompt: asNonEmptyString(spec.ambiguityPrompt, ''),
      responseLength: asNonEmptyString(spec.responseLength, 'short').toLowerCase(),
      discoveryDepth: asNumber(spec.discoveryDepth, 1),
    },
    contextAccess,
  };
}

function buildAgentCreateWebhookPayload(agent: PersistedAgent): Record<string, unknown> {
  const spec = asRecord(agent.specJson);
  const normalizedSpec = normalizeSpecForWebhook(spec);
  const description = asNonEmptyString(spec.problemStatement, asNonEmptyString(spec.purpose, ''));

  return {
    agent: {
      id: agent.id,
      name: agent.name,
      category: agent.category,
      slug: slugify(agent.name),
      description,
    },
    spec: normalizedSpec,
    ui: {
      icon: agent.icon,
      color: agent.color,
      voiceId: agent.voiceId,
    },
    lifecycle: {
      isBuiltIn: agent.isBuiltIn,
      version: agent.version,
      environment: agent.environment,
      publishedAt: agent.publishedAt?.toISOString() ?? null,
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
    },
  };
}

async function notifyAgentCreated(cfg: AppConfig, agent: PersistedAgent): Promise<void> {
  const response = await fetch(cfg.AGENT_CREATE_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildAgentCreateWebhookPayload(agent)),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    const detail = errorBody ? `: ${errorBody}` : '';
    throw new Error(`Agent create webhook failed with status ${response.status}${detail}`);
  }
}

async function deleteAgentAndRelatedData(agentId: string): Promise<void> {
  await prisma.$transaction(async (tx: typeof prisma) => {
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
      await notifyAgentCreated(cfg, agent);
    } catch (error) {
      await prisma.agent.delete({ where: { id: agent.id } });
      req.log.error({ err: error, agentId: agent.id }, 'Failed to notify agent create webhook');
      return reply.status(502).send({ error: 'Failed to sync created agent' });
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
        ? (gr as object[])
        : existing.guardrailsJson;
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
}
