/** Session interaction mode */
export type SessionMode = 'voice' | 'chat' | 'voice_fallback_chat';

/** Lifecycle status for a session */
export type SessionStatus = 'active' | 'ended' | 'escalated' | 'timeout' | 'error';

/** Emotion labels used for tone adaptation (aligned with workbook) */
export type EmotionState =
  | 'anxious'
  | 'confused'
  | 'in_pain'
  | 'calm'
  | 'urgent'
  | 'distressed';

export interface PatientContext {
  /** Never log raw UHID — only hashed or redacted references */
  uhidHash?: string;
  verified: boolean;
}
