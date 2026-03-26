import type { AgentSpec } from '@vhos/shared';
import { appointmentSpec } from './appointment.agent.js';
import { chronicCheckinSpec } from './chronic-checkin.agent.js';
import { dischargeFollowupSpec } from './discharge-followup.agent.js';
import { emergencyTriageSpec } from './emergency-triage.agent.js';
import { labResultsSpec } from './lab-results.agent.js';
import { studioDraftPlaceholderSpec } from './studio-draft.agent.js';
import { surgeryRecoverySpec } from './surgery-recovery.agent.js';

export interface BuiltInAgentSeed {
  id: string;
  spec: AgentSpec;
}

export const STUDIO_DRAFT_AGENT_ID = 'vhos_studio_draft' as const;

export const builtInAgents: BuiltInAgentSeed[] = [
  { id: STUDIO_DRAFT_AGENT_ID, spec: studioDraftPlaceholderSpec },
  { id: 'vhos_builtin_discharge_followup', spec: dischargeFollowupSpec },
  { id: 'vhos_builtin_appointment', spec: appointmentSpec },
  { id: 'vhos_builtin_chronic_checkin', spec: chronicCheckinSpec },
  { id: 'vhos_builtin_surgery_recovery', spec: surgeryRecoverySpec },
  { id: 'vhos_builtin_lab_results', spec: labResultsSpec },
  { id: 'vhos_builtin_emergency_triage', spec: emergencyTriageSpec },
];
