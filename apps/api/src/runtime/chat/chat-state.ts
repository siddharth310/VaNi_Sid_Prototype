import { Annotation } from '@langchain/langgraph';

/**
 * LangGraph state for one chat turn (VHOS chat runtime).
 */
export const ChatStateAnnotation = Annotation.Root({
  userInput: Annotation<string>({
    reducer: (_p, n) => n,
    default: () => '',
  }),
  agentReply: Annotation<string>({
    reducer: (_p, n) => n,
    default: () => '',
  }),
  detectedLanguage: Annotation<string>({
    reducer: (_p, n) => n,
    default: () => 'en',
  }),
  intentLabel: Annotation<string>({
    reducer: (_p, n) => n,
    default: () => 'general',
  }),
  phiIntent: Annotation<boolean>({
    reducer: (_p, n) => n,
    default: () => false,
  }),
  emotionLabel: Annotation<string>({
    reducer: (_p, n) => n,
    default: () => 'calm',
  }),
  discoveryTurns: Annotation<number>({
    reducer: (_p, n) => n,
    default: () => 0,
  }),
  firstAidTrigger: Annotation<string | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
  firstAidContext: Annotation<string>({
    reducer: (_p, n) => n,
    default: () => '',
  }),
  phiBlocked: Annotation<boolean>({
    reducer: (_p, n) => n,
    default: () => false,
  }),
  needsPhiAuth: Annotation<boolean>({
    reducer: (_p, n) => n,
    default: () => false,
  }),
  guardrailHit: Annotation<boolean>({
    reducer: (_p, n) => n,
    default: () => false,
  }),
  escalate: Annotation<boolean>({
    reducer: (_p, n) => n,
    default: () => false,
  }),
  escalationReason: Annotation<string>({
    reducer: (_p, n) => n,
    default: () => '',
  }),
  empathyInstruction: Annotation<string>({
    reducer: (_p, n) => n,
    default: () => '',
  }),
  /** JSON string of AgentSpec */
  agentSpecJson: Annotation<string>({
    reducer: (_p, n) => n,
    default: () => '{}',
  }),
  isEmergencyAgent: Annotation<boolean>({
    reducer: (_p, n) => n,
    default: () => false,
  }),
  isVerified: Annotation<boolean>({
    reducer: (_p, n) => n,
    default: () => false,
  }),
  skipLlm: Annotation<boolean>({
    reducer: (_p, n) => n,
    default: () => false,
  }),
});

export type ChatState = typeof ChatStateAnnotation.State;
