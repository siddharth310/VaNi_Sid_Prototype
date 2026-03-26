import type { AgentSpec } from '@vhos/shared';
import { VHOS_LOCKED_GUARD_RULES } from '@vhos/shared';

/** Placeholder row for draft voice sessions — realtime spec comes from Redis */
export const studioDraftPlaceholderSpec: AgentSpec = {
  name: 'Studio Draft',
  personaName: 'Draft',
  domain: 'General',
  category: 'CONNECT',
  tone: 'Professional',
  responseLength: 'Short (1-2 sentences per turn)',
  purpose: 'Draft agent — system prompt supplied at session start.',
  openingLine: 'Hello.',
  closingLine: 'Goodbye.',
  fallbackUtterance: 'Sorry, could you repeat that?',
  ambiguityPrompt: 'Could you clarify?',
  goalStickiness: true,
  humanInLoop: true,
  discoveryDepth: 0,
  discoveryScript: { q1: 'How can I help?' },
  guardrails: [...VHOS_LOCKED_GUARD_RULES],
  voiceId: 'alloy',
  icon: '🛠️',
  color: '#64748b',
};
