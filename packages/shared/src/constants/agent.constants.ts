/** Built-in agent keys used by seed and routing */
export const BUILT_IN_AGENT_KEYS = [
  'discharge-followup',
  'appointment',
  'chronic-checkin',
  'surgery-recovery',
  'lab-results',
  'emergency-triage',
] as const;

export type BuiltInAgentKey = (typeof BUILT_IN_AGENT_KEYS)[number];
