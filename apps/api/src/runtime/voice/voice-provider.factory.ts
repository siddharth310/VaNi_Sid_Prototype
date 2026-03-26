import type { VoiceProvider } from '@vhos/shared';
import type { AppConfig } from '../../config.js';
import { ElevenLabsConversationalProvider } from './providers/elevenlabs-conversational.provider.js';
import { OpenAIRealtimeProvider } from './providers/openai-realtime.provider.js';

/**
 * Factory for voice providers — always use this instead of `new` in routes/runtime.
 */
export function createVoiceProvider(cfg: AppConfig): VoiceProvider {
  switch (cfg.VOICE_PROVIDER) {
    case 'elevenlabs':
      return new ElevenLabsConversationalProvider(cfg);
    case 'openai':
    default:
      return new OpenAIRealtimeProvider(cfg);
  }
}
