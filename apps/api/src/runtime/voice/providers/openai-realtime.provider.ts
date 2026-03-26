import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type {
  VoiceProvider,
  VoiceSessionConfig,
  VoiceSessionHandle,
} from '@vhos/shared';
import type { AppConfig } from '../../../config.js';

type RealtimeEvent = {
  type?: string;
  delta?: string;
  transcript?: string;
  error?: { message?: string };
};

/**
 * OpenAI Realtime API provider — one active session per instance.
 */
export class OpenAIRealtimeProvider implements VoiceProvider {
  private readonly bus = new EventEmitter();
  private ws: WebSocket | null = null;
  private handle: VoiceSessionHandle | null = null;

  constructor(private readonly cfg: AppConfig) {}

  async startSession(config: VoiceSessionConfig): Promise<VoiceSessionHandle> {
    if (this.ws) {
      throw new Error('Session already active');
    }
    const apiKey = this.cfg.OPENAI_API_KEY;
    if (!apiKey) {
      const err = new Error('OPENAI_API_KEY is not configured');
      this.bus.emit('error', err);
      throw err;
    }

    const id = crypto.randomUUID();
    this.handle = { id };

    const model = encodeURIComponent(this.cfg.OPENAI_REALTIME_MODEL);
    const url = `wss://api.openai.com/v1/realtime?model=${model}`;

    this.ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
      this.handleOpenAIMessage(data.toString());
    });

    this.ws.on('error', (err: Error) => {
      this.bus.emit('error', err);
    });

    await new Promise<void>((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('WebSocket missing'));
        return;
      }
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });

    this.sendJson({
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: config.systemPrompt,
        voice: config.voice,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.55,
          prefix_padding_ms: 450,
          silence_duration_ms: config.silenceDurationMs,
        },
        temperature: 0.7,
        max_response_output_tokens: config.maxTokensPerTurn,
      },
    });

    return this.handle;
  }

  async updateSession(
    handle: VoiceSessionHandle,
    patch: Partial<VoiceSessionConfig>
  ): Promise<void> {
    this.assertHandle(handle);
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const session: Record<string, unknown> = {};
    if (patch.systemPrompt !== undefined) {
      session.instructions = patch.systemPrompt;
    }
    if (patch.voice !== undefined) {
      session.voice = patch.voice;
    }
    if (patch.maxTokensPerTurn !== undefined) {
      session.max_response_output_tokens = patch.maxTokensPerTurn;
    }
    if (patch.silenceDurationMs !== undefined && session.turn_detection === undefined) {
      session.turn_detection = {
        type: 'server_vad',
        threshold: 0.55,
        prefix_padding_ms: 450,
        silence_duration_ms: patch.silenceDurationMs,
      };
    }
    if (Object.keys(session).length === 0) {
      return;
    }
    this.sendJson({ type: 'session.update', session });
  }

  async sendAudio(
    handle: VoiceSessionHandle,
    pcm16Base64: string
  ): Promise<void> {
    this.assertHandle(handle);
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.sendJson({
      type: 'input_audio_buffer.append',
      audio: pcm16Base64,
    });
  }

  async endSession(handle: VoiceSessionHandle): Promise<void> {
    this.assertHandle(handle);
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
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

  private sendJson(payload: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify(payload));
  }

  private handleOpenAIMessage(raw: string): void {
    let event: RealtimeEvent;
    try {
      event = JSON.parse(raw) as RealtimeEvent;
    } catch {
      this.bus.emit('error', new Error('Invalid Realtime JSON payload'));
      return;
    }

    const t = event.type;
    if (!t) {
      return;
    }

    if (t === 'response.audio.delta' && typeof event.delta === 'string') {
      this.bus.emit('audio_chunk', event.delta);
      return;
    }

    if (t === 'response.audio_transcript.delta' && typeof event.delta === 'string') {
      this.bus.emit('agent_transcript', event.delta);
      return;
    }

    if (
      t === 'conversation.item.input_audio_transcription.completed' &&
      typeof event.transcript === 'string'
    ) {
      this.bus.emit('patient_transcript', event.transcript);
      return;
    }

    if (t === 'response.done') {
      this.bus.emit('turn_complete');
      return;
    }

    if (t === 'error') {
      const msg = event.error?.message ?? 'Realtime error';
      this.bus.emit('error', new Error(msg));
    }
  }
}
