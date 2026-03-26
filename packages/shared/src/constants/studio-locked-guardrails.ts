import type { AgentGuardrailRule } from '../types/agent.types.js';

/** Always-on VHOS rules — shown locked in Agent Studio Tab 3 */
export const VHOS_LOCKED_GUARD_RULES: readonly AgentGuardrailRule[] = [
  {
    rule: 'This agent will never diagnose or suggest a diagnosis.',
    severity: 'CRITICAL',
  },
  {
    rule: 'This agent will never advise stopping or changing medication.',
    severity: 'CRITICAL',
  },
  {
    rule: 'This agent will never share PHI without verifying identity.',
    severity: 'CRITICAL',
  },
  {
    rule: 'This agent will escalate emergency symptoms immediately.',
    severity: 'CRITICAL',
  },
  {
    rule: 'This agent will only provide verified hospital information.',
    severity: 'CRITICAL',
  },
] as const;
