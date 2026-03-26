import { z } from 'zod';
import type { AgentSpec, AgentSpecValidationResult } from '@vhos/shared';

const guardrailSchema = z.object({
  rule: z.string().min(1),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
});

const goalBlockSchema = z.object({
  primary: z.string(),
  successCondition: z.string(),
  escalationTrigger: z.string(),
});

const behaviourTogglesSchema = z.object({
  mirrorLanguage: z.boolean(),
  acknowledgeFirst: z.boolean(),
  stayOnTopic: z.boolean(),
  offerHumanIfUnsure: z.boolean(),
  summariseBeforeAction: z.boolean(),
  patientLed: z.boolean(),
});

const contextAccessSchema = z.object({
  patientName: z.boolean(),
  uhid: z.boolean(),
  activeConditions: z.boolean(),
  medications: z.boolean(),
  allergies: z.boolean(),
  treatingDoctor: z.boolean(),
  dischargeDate: z.boolean(),
  appointments: z.boolean(),
  labFlags: z.boolean(),
  insurance: z.boolean(),
});

const triggerModesSchema = z.object({
  inbound: z.boolean(),
  outbound: z.boolean(),
  emr: z.boolean(),
  scheduled: z.boolean(),
});

const authSchema = z.object({
  verifyUhidDob: z.boolean(),
  otpSms: z.boolean(),
  otpWhatsApp: z.boolean(),
  onFail: z.enum(['human', 'end', 'general_only']),
  requireForAppointments: z.boolean(),
  requireForMedications: z.boolean(),
  requireForLabs: z.boolean(),
  requireForInsurance: z.boolean(),
  requireForNotes: z.boolean(),
  requireForVitals: z.boolean(),
});

const operationsSchema = z.object({
  urgency: z.enum([
    'life_critical',
    'urgent_clinical',
    'standard',
    'non_urgent',
  ]),
  escalationTeam: z.string(),
  sessionTimeoutMins: z.number().int().positive(),
  channelVoice: z.boolean(),
  channelChat: z.boolean(),
  channelPhone: z.boolean(),
});

export const agentSpecSchema = z.object({
  personaName: z.string().optional(),
  name: z.string().min(1),
  domain: z.string().min(1),
  category: z.string().min(1),
  tone: z.string().min(1),
  responseLength: z.string().min(1),
  purpose: z.string().min(1),
  openingLine: z.string().min(1),
  closingLine: z.string().min(1),
  fallbackUtterance: z.string().min(1),
  ambiguityPrompt: z.string().min(1),
  goalStickiness: z.boolean(),
  humanInLoop: z.boolean(),
  discoveryDepth: z.number().int().min(0).max(10),
  discoveryScript: z.object({
    q1: z.string().min(1),
    q2: z.string().optional(),
    q3: z.string().optional(),
  }),
  guardrails: z.array(guardrailSchema).min(1),
  voiceId: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  problemStatement: z.string().optional(),
  goal: goalBlockSchema.optional(),
  empathyLevel: z.number().int().min(1).max(5).optional(),
  languages: z.array(z.string()).optional(),
  tonePreset: z
    .enum(['warm', 'professional', 'clinical', 'directive'])
    .optional(),
  behaviourToggles: behaviourTogglesSchema.optional(),
  contextAccess: contextAccessSchema.optional(),
  triggerModes: triggerModesSchema.optional(),
  auth: authSchema.optional(),
  operations: operationsSchema.optional(),
  llmModel: z.string().optional(),
  voiceProvider: z.enum(['openai', 'elevenlabs']).optional(),
});

export function validateAgentSpec(
  input: unknown
): AgentSpecValidationResult {
  const parsed = agentSpecSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.') || '_root';
      fieldErrors[path] = fieldErrors[path] ?? [];
      fieldErrors[path].push(issue.message);
    }
    return {
      valid: false,
      fieldErrors,
      tabStatus: computeTabStatus(input, fieldErrors),
    };
  }
  return {
    valid: true,
    fieldErrors: {},
    tabStatus: computeTabStatus(parsed.data, {}),
  };
}

function computeTabStatus(
  raw: unknown,
  fieldErrors: Record<string, string[]>
): Record<string, 'complete' | 'incomplete' | 'error'> {
  const hasErr = (prefix: string) =>
    Object.keys(fieldErrors).some((k) => k === prefix || k.startsWith(`${prefix}.`));

  const tabs: Record<string, 'complete' | 'incomplete' | 'error'> = {
    tab1: 'incomplete',
    tab2: 'incomplete',
    tab3: 'incomplete',
    tab4: 'incomplete',
    tab5: 'incomplete',
    tab6: 'incomplete',
    tab7: 'incomplete',
    tab8: 'incomplete',
  };

  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const t1Fields = ['name', 'domain', 'category', 'tone', 'responseLength', 'personaName'];
  if (t1Fields.some((f) => o[f] === undefined || o[f] === '')) {
    tabs.tab1 = hasErr('name') ? 'error' : 'incomplete';
  } else {
    tabs.tab1 = hasErr('name') || hasErr('domain') ? 'error' : 'complete';
  }

  const t2Fields = [
    'purpose',
    'openingLine',
    'closingLine',
    'fallbackUtterance',
    'ambiguityPrompt',
  ];
  if (t2Fields.some((f) => !o[f])) {
    tabs.tab2 = 'incomplete';
  } else {
    tabs.tab2 = t2Fields.some((f) => hasErr(f)) ? 'error' : 'complete';
  }

  const ds = o.discoveryScript as Record<string, unknown> | undefined;
  if (!ds || !ds.q1) {
    tabs.tab3 = 'incomplete';
  } else {
    tabs.tab3 = hasErr('discoveryScript') || hasErr('discoveryDepth') ? 'error' : 'complete';
  }

  const gr = o.guardrails;
  if (!Array.isArray(gr) || gr.length === 0) {
    tabs.tab4 = 'incomplete';
  } else {
    tabs.tab4 = hasErr('guardrails') ? 'error' : 'complete';
  }

  /** Tabs 5–8: workbook placeholders — mark complete when core tabs + guardrails valid */
  const coreOk =
    tabs.tab1 === 'complete' &&
    tabs.tab2 === 'complete' &&
    tabs.tab3 === 'complete' &&
    tabs.tab4 === 'complete';

  for (const k of ['tab5', 'tab6', 'tab7', 'tab8'] as const) {
    tabs[k] = coreOk ? 'complete' : 'incomplete';
  }

  return tabs;
}

export function assertAgentSpec(input: unknown): AgentSpec {
  return agentSpecSchema.parse(input) as AgentSpec;
}
