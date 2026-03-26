import type { Agent } from '@prisma/client';
import type { AgentSpec } from '@vhos/shared';
import { detectLanguageCode } from '../language-detector.js';
import { checkGuardrails } from '../guardrails.js';
import { agentSpecSchema } from '../../validation/agent-spec.schema.js';
import type { ChatGraphDeps } from './deps.js';
import { buildChatGraph } from './graph.js';

export interface RunChatTurnInput {
  userMessage: string;
  session: {
    id: string;
    discoveryTurns: number;
    language: string;
    isVerified: boolean;
  };
  agent: Agent;
}

export interface RunChatTurnResult {
  reply: string;
  language: string;
  needsPhiAuth: boolean;
  escalated: boolean;
  guardrailHit: boolean;
  emotion?: string;
  discoveryTurns: number;
}

/**
 * Runs pre-input guardrails, LangGraph, returns agent reply. Uses `OPENAI_API_KEY` for all model calls inside the graph.
 */
export async function runChatTurn(
  deps: ChatGraphDeps,
  data: RunChatTurnInput
): Promise<RunChatTurnResult> {
  const pre = checkGuardrails(data.userMessage);
  if (!pre.pass && pre.safeResponse) {
    return {
      reply: pre.safeResponse,
      language: data.session.language,
      needsPhiAuth: false,
      escalated: pre.action === 'flag_and_escalate',
      guardrailHit: true,
      discoveryTurns: data.session.discoveryTurns,
    };
  }

  const spec = agentSpecSchema.parse(data.agent.specJson) as AgentSpec;
  const lang = detectLanguageCode(data.userMessage) || data.session.language;
  const isEmergency =
    data.agent.category.toLowerCase().includes('emergency') ||
    data.agent.name.toLowerCase().includes('emergency');

  const graph = buildChatGraph(deps);
  const out = await graph.invoke({
    userInput: data.userMessage,
    agentSpecJson: JSON.stringify(spec),
    detectedLanguage: lang,
    discoveryTurns: data.session.discoveryTurns,
    isVerified: data.session.isVerified,
    isEmergencyAgent: isEmergency,
    agentReply: '',
    intentLabel: 'general',
    phiIntent: false,
    emotionLabel: 'calm',
    firstAidTrigger: null,
    firstAidContext: '',
    phiBlocked: false,
    needsPhiAuth: false,
    guardrailHit: false,
    escalate: false,
    escalationReason: '',
    empathyInstruction: '',
    skipLlm: false,
  });

  return {
    reply: out.agentReply,
    language: out.detectedLanguage,
    needsPhiAuth: out.needsPhiAuth,
    escalated: out.escalate,
    guardrailHit: out.guardrailHit,
    emotion: out.emotionLabel,
    discoveryTurns: out.discoveryTurns,
  };
}
