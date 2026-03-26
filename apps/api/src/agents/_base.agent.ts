import type { AgentGuardrailRule } from '@vhos/shared';

/** Global-style guardrails merged into every built-in agent spec */
export const baseGuardrails: AgentGuardrailRule[] = [
  {
    rule: 'Never provide a medical diagnosis or interpret labs without clinician context.',
    severity: 'CRITICAL',
  },
  {
    rule: 'Never instruct the patient to stop or change medications without a clinician.',
    severity: 'CRITICAL',
  },
  {
    rule: 'Never share or guess PHI; verify identity before accessing records.',
    severity: 'HIGH',
  },
  {
    rule: 'If emergency keywords appear, prioritize first-aid and escalation.',
    severity: 'HIGH',
  },
];
