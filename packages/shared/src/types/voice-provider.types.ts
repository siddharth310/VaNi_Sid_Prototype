/**
 * Opaque handle returned by a voice provider for a started session.
 * Callers must not assume internal structure beyond passing it back to the provider.
 */
export interface VoiceSessionHandle {
  readonly id: string;
}

export interface VoiceSessionConfig {
  systemPrompt: string;
  /** Provider-specific voice ID */
  voice: string;
  /** ISO 639-1 language code */
  language: string;
  maxTokensPerTurn: number;
  silenceDurationMs: number;
}

type AudioChunkCallback = (audio: string) => void;
type TextCallback = (text: string) => void;
type VoidCallback = () => void;
type ErrorCallback = (err: Error) => void;

/**
 * Pluggable voice backend contract. All providers implement this interface.
 * Server code must obtain instances only via `createVoiceProvider()` (apps/api).
 */
export interface VoiceProvider {
  startSession(config: VoiceSessionConfig): Promise<VoiceSessionHandle>;

  updateSession(
    handle: VoiceSessionHandle,
    patch: Partial<VoiceSessionConfig>
  ): Promise<void>;

  sendAudio(handle: VoiceSessionHandle, pcm16Base64: string): Promise<void>;

  endSession(handle: VoiceSessionHandle): Promise<void>;

  on(event: 'audio_chunk', cb: AudioChunkCallback): void;
  on(event: 'agent_transcript', cb: TextCallback): void;
  on(event: 'patient_transcript', cb: TextCallback): void;
  on(event: 'turn_complete', cb: VoidCallback): void;
  on(event: 'error', cb: ErrorCallback): void;
}
