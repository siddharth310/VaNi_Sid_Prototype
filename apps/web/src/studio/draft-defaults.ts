import type { AgentSpec, TonePreset } from '@vhos/shared';
import { VHOS_LOCKED_GUARD_RULES } from '@vhos/shared';

const TONE_LABELS: Record<TonePreset, string> = {
  warm: 'Warm & caring',
  professional: 'Professional',
  clinical: 'Clinical & precise',
  directive: 'Directive & urgent',
};

export function tonePresetToString(preset: TonePreset | undefined): string {
  if (!preset) {
    return TONE_LABELS.warm;
  }
  return TONE_LABELS[preset];
}

export function createEmptyStudioDraft(): AgentSpec {
  return {
    name: '',
    personaName: '',
    domain: '',
    category: 'CONNECT',
    tone: TONE_LABELS.warm,
    tonePreset: 'warm',
    responseLength: 'Short (1-2 sentences per turn)',
    purpose: ' ',
    problemStatement: '',
    goal: {
      primary: '',
      successCondition: '',
      escalationTrigger: '',
    },
    openingLine: 'Hello! How can I help you today?',
    closingLine: 'Is there anything else I can help you with?',
    fallbackUtterance: "I didn't quite catch that — could you rephrase?",
    ambiguityPrompt: 'Could you tell me a bit more about what you need?',
    goalStickiness: true,
    humanInLoop: true,
    discoveryDepth: 1,
    discoveryScript: {
      q1: ' ',
    },
    guardrails: [...VHOS_LOCKED_GUARD_RULES],
    empathyLevel: 3,
    languages: ['en'],
    voiceId: 'alloy',
    llmModel: 'gpt-4o',
    voiceProvider: 'openai',
    behaviourToggles: {
      mirrorLanguage: true,
      acknowledgeFirst: true,
      stayOnTopic: true,
      offerHumanIfUnsure: true,
      summariseBeforeAction: true,
      patientLed: false,
    },
    contextAccess: {
      patientName: true,
      uhid: true,
      activeConditions: true,
      medications: true,
      allergies: true,
      treatingDoctor: true,
      dischargeDate: false,
      appointments: false,
      labFlags: false,
      insurance: false,
    },
    triggerModes: {
      inbound: true,
      outbound: true,
      emr: false,
      scheduled: false,
    },
    auth: {
      verifyUhidDob: true,
      otpSms: false,
      otpWhatsApp: false,
      onFail: 'human',
      requireForAppointments: true,
      requireForMedications: true,
      requireForLabs: true,
      requireForInsurance: true,
      requireForNotes: true,
      requireForVitals: false,
    },
    operations: {
      urgency: 'standard',
      escalationTeam: 'Human care coordinator',
      sessionTimeoutMins: 15,
      channelVoice: true,
      channelChat: true,
      channelPhone: false,
    },
    icon: '🤖',
    color: '#00D4AA',
  };
}

/**
 * Fills minimal defaults so `buildSystemPrompt` and voice preview can run safely.
 */
export function mergeAgentFromApi(raw: unknown): AgentSpec {
  const base = createEmptyStudioDraft();
  if (!raw || typeof raw !== 'object') {
    return base;
  }
  return { ...base, ...(raw as AgentSpec) };
}

export function normalizeDraftForRuntime(d: AgentSpec): AgentSpec {
  const base = createEmptyStudioDraft();
  const g = d.goal ?? base.goal;
  const merged: AgentSpec = {
    ...base,
    ...d,
    domain: d.domain?.trim() ? d.domain : 'General care',
    category: d.category?.trim() ? d.category : 'CONNECT',
    purpose:
      d.goal?.primary?.trim() ||
      d.purpose?.trim() ||
      d.problemStatement?.trim() ||
      base.purpose,
    goal: {
      primary: g?.primary?.trim() ?? '',
      successCondition: g?.successCondition?.trim() ?? '',
      escalationTrigger: g?.escalationTrigger?.trim() ?? '',
    },
    discoveryScript: {
      q1: d.discoveryScript?.q1?.trim()
        ? d.discoveryScript.q1
        : 'How can I help you today?',
      q2: d.discoveryScript?.q2,
      q3: d.discoveryScript?.q3,
    },
    guardrails:
      d.guardrails && d.guardrails.length > 0
        ? d.guardrails
        : [...VHOS_LOCKED_GUARD_RULES],
    languages: d.languages?.length ? d.languages : ['en'],
    empathyLevel: d.empathyLevel ?? 3,
    tone: d.tone?.trim() ? d.tone : tonePresetToString(d.tonePreset),
  };
  return merged;
}
