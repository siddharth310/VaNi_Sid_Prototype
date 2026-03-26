import { EventEmitter } from 'node:events';
import type {
  VoiceProvider,
  VoiceSessionConfig,
  VoiceSessionHandle,
} from '@vhos/shared';
import type { AppConfig } from '../../../config.js';

/**
 * ElevenLabs Conversational AI — stub for V1.
 * If `ELEVENLABS_API_KEY` is missing, operations log and no-op safely.
 */
export class ElevenLabsConversationalProvider implements VoiceProvider {
  private readonly bus = new EventEmitter();
  private handle: VoiceSessionHandle | null = null;

  constructor(private readonly cfg: AppConfig) {}

  async startSession(config: VoiceSessionConfig): Promise<VoiceSessionHandle> {
    const key = this.cfg.ELEVENLABS_API_KEY;
    if (!key) {
      console.warn(
        '[vhos] ElevenLabs voice provider: not configured — ELEVENLABS_API_KEY missing'
      );
    }
    const id = crypto.randomUUID();
    this.handle = { id };
    if (!key) {
      return this.handle;
    }
    void config;
    return this.handle;
  }

  async updateSession(
    handle: VoiceSessionHandle,
    patch: Partial<VoiceSessionConfig>
  ): Promise<void> {
    this.assertHandle(handle);
    if (!this.cfg.ELEVENLABS_API_KEY) {
      console.warn('[vhos] ElevenLabs updateSession skipped — provider not configured');
      return;
    }
    void patch;
  }

  async sendAudio(
    handle: VoiceSessionHandle,
    pcm16Base64: string
  ): Promise<void> {
    this.assertHandle(handle);
    if (!this.cfg.ELEVENLABS_API_KEY) {
      return;
    }
    void pcm16Base64;
  }

  async endSession(handle: VoiceSessionHandle): Promise<void> {
    this.assertHandle(handle);
    this.handle = null;
  }

  on(event: 'audio_chunk', cb: (audio: string) => void): void;
  on(event: 'agent_transcript', cb: (text: string) => void): void;
  on(event: 'patient_transcript', cb: (text: string) => void): void;
  on(event: 'turn_complete', cb: () => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  on(
    event: 'audio_chunk' | 'agent_transcript' | 'patient_transcript' | 'turn_complete' | 'error',
    cb: ((audio: string) => void) | ((text: string) => void) | (() => void) | ((err: Error) => void)
  ): void {
    this.bus.on(event, cb as (...args: unknown[]) => void);
  }

  private assertHandle(handle: VoiceSessionHandle): void {
    if (!this.handle || handle.id !== this.handle.id) {
      throw new Error('Invalid voice session handle');
    }
  }
}
