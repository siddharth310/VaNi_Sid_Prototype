/** Severity for workbook guardrails and runtime checks */
export type GuardrailSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface AgentGuardrailRule {
  rule: string;
  severity: GuardrailSeverity;
}

export interface DiscoveryScript {
  q1: string;
  q2?: string;
  q3?: string;
}

export type StudioCategory = 'CONNECT' | 'CARE' | 'ASSIST' | 'EMERGENCY';

export type TonePreset = 'warm' | 'professional' | 'clinical' | 'directive';

export interface AgentGoalBlock {
  primary: string;
  successCondition: string;
  escalationTrigger: string;
}

export interface StudioBehaviourToggles {
  mirrorLanguage: boolean;
  acknowledgeFirst: boolean;
  stayOnTopic: boolean;
  offerHumanIfUnsure: boolean;
  summariseBeforeAction: boolean;
  patientLed: boolean;
}

export interface StudioContextAccess {
  patientName: boolean;
  uhid: boolean;
  activeConditions: boolean;
  medications: boolean;
  allergies: boolean;
  treatingDoctor: boolean;
  dischargeDate: boolean;
  appointments: boolean;
  labFlags: boolean;
  insurance: boolean;
}

export interface StudioTriggerModes {
  inbound: boolean;
  outbound: boolean;
  emr: boolean;
  scheduled: boolean;
}

export type StudioAuthFailureMode = 'human' | 'end' | 'general_only';

export interface StudioAuthConfig {
  verifyUhidDob: boolean;
  otpSms: boolean;
  otpWhatsApp: boolean;
  onFail: StudioAuthFailureMode;
  requireForAppointments: boolean;
  requireForMedications: boolean;
  requireForLabs: boolean;
  requireForInsurance: boolean;
  requireForNotes: boolean;
  requireForVitals: boolean;
}

export type StudioUrgency =
  | 'life_critical'
  | 'urgent_clinical'
  | 'standard'
  | 'non_urgent';

export interface StudioOperations {
  urgency: StudioUrgency;
  escalationTeam: string;
  sessionTimeoutMins: number;
  channelVoice: boolean;
  channelChat: boolean;
  channelPhone: boolean;
}

/**
 * Full agent specification used for CRUD, validation, and prompt assembly.
 * Stored in DB as `specJson` and validated on write.
 */
export interface AgentSpec {
  personaName?: string;
  name: string;
  domain: string;
  category: string;
  tone: string;
  responseLength: string;
  purpose: string;
  openingLine: string;
  closingLine: string;
  fallbackUtterance: string;
  ambiguityPrompt: string;
  goalStickiness: boolean;
  humanInLoop: boolean;
  discoveryDepth: number;
  discoveryScript: DiscoveryScript;
  guardrails: AgentGuardrailRule[];
  /** OpenAI Realtime voice id or provider-specific voice */
  voiceId?: string;
  icon?: string;
  color?: string;
  /** Agent Studio — detailed problem description (min words enforced in UI) */
  problemStatement?: string;
  goal?: AgentGoalBlock;
  empathyLevel?: number;
  languages?: string[];
  tonePreset?: TonePreset;
  behaviourToggles?: StudioBehaviourToggles;
  contextAccess?: StudioContextAccess;
  triggerModes?: StudioTriggerModes;
  auth?: StudioAuthConfig;
  operations?: StudioOperations;
  llmModel?: string;
  voiceProvider?: 'openai' | 'elevenlabs';
}

export interface AgentSpecValidationResult {
  valid: boolean;
  fieldErrors: Record<string, string[]>;
  tabStatus: Record<string, 'complete' | 'incomplete' | 'error'>;
}

export interface AgentListItem {
  id: string;
  name: string;
  category: string;
  icon: string;
  color: string;
  voiceId: string;
  isBuiltIn: boolean;
  version: string;
  environment: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
