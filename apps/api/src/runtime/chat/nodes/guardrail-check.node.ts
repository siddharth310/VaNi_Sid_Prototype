import type { AgentSpec } from '@vhos/shared';
import {
  checkAgentConfiguredGuardrails,
  checkGuardrails,
} from '../../guardrails.js';
import { agentSpecSchema } from '../../../validation/agent-spec.schema.js';
import type { ChatStateAnnotation } from '../chat-state.js';

type State = (typeof ChatStateAnnotation)['State'];
type Update = Partial<(typeof ChatStateAnnotation)['Update']>;

export function guardrailCheckNode(state: State): Update {
  if (state.skipLlm) {
    return {};
  }
  const gUser = checkGuardrails(state.userInput);
  if (!gUser.pass && gUser.safeResponse) {
    return {
      agentReply: gUser.safeResponse,
      guardrailHit: true,
      escalate: gUser.action === 'flag_and_escalate' ? true : state.escalate,
    };
  }

  const spec = agentSpecSchema.parse(JSON.parse(state.agentSpecJson)) as AgentSpec;
  const agentRules = spec.guardrails.map((x) => ({
    rule: x.rule,
    severity: x.severity,
  }));
  const gAgent = checkAgentConfiguredGuardrails(state.agentReply, agentRules);
  if (!gAgent.pass && gAgent.safeResponse) {
    return {
      agentReply: gAgent.safeResponse,
      guardrailHit: true,
    };
  }

  const gOut = checkGuardrails(state.agentReply);
  if (!gOut.pass && gOut.safeResponse) {
    return {
      agentReply: gOut.safeResponse,
      guardrailHit: true,
      escalate: true,
      escalationReason: 'output_guardrail',
    };
  }
  return { guardrailHit: false };
}
