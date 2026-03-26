import type { WebSocket } from 'ws';
import type { Redis } from 'ioredis';
import type { AppConfig } from '../../config.js';
import { prisma } from '../../lib/prisma.js';
import { agentSpecSchema } from '../../validation/agent-spec.schema.js';
import { buildSystemPrompt } from '../prompt-assembler.js';
import { detectLanguageCode } from '../language-detector.js';
import { createVoiceProvider } from './voice-provider.factory.js';
import type { VoiceEventBus } from './voice-event-bus.js';

function voiceDraftRedisKey(sessionId: string): string {
  return `voice:draft:${sessionId}`;
}

interface ClientMessage {
  type?: string;
  audio?: string;
}

/**
 * Bridges browser WebSocket messages to the active `VoiceProvider` for a DB session.
 * OpenAI API keys never leave the server.
 */
export async function attachRealtimeProxy(params: {
  cfg: AppConfig;
  sessionId: string;
  socket: WebSocket;
  bus: VoiceEventBus;
  redis: Redis;
}): Promise<void> {
  const { cfg, sessionId, socket, bus, redis } = params;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { agent: true },
  });

  if (!session) {
    socket.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
    socket.close();
    return;
  }

  const draftRaw = await redis.get(voiceDraftRedisKey(sessionId));
  const spec = draftRaw
    ? agentSpecSchema.parse(JSON.parse(draftRaw) as unknown)
    : agentSpecSchema.parse(session.agent.specJson);
  const provider = createVoiceProvider(cfg);
  const voiceId = spec.voiceId ?? session.agent.voiceId ?? cfg.OPENAI_DEFAULT_VOICE;

  const systemPrompt = buildSystemPrompt(spec, null, {
    language: 'en',
  });
  let currentLanguage = 'en';
  const selectedLanguages =
    spec.languages && spec.languages.length > 0 ? spec.languages : ['en'];
  let pendingLanguageCandidate: string | null = null;
  let pendingLanguageHits = 0;
  let lastLanguageSwitchAt = 0;

  let handle: Awaited<ReturnType<typeof provider.startSession>>;
  try {
    handle = await provider.startSession({
      systemPrompt,
      voice: voiceId,
      language: 'en',
      maxTokensPerTurn: 200,
      silenceDurationMs: 1200,
    });
  } catch {
    socket.send(
      JSON.stringify({
        type: 'error',
        message: 'Voice provider error',
      })
    );
    socket.close();
    return;
  }

  const forward = (type: string, payload: Record<string, unknown>) => {
    bus.publish(sessionId, { type, ...payload });
  };

  provider.on('audio_chunk', (audio) => {
    socket.send(JSON.stringify({ type: 'audio_chunk', audio }));
    forward('audio_chunk', { audio });
  });

  provider.on('agent_transcript', (text) => {
    socket.send(JSON.stringify({ type: 'agent_transcript', text }));
    forward('agent_transcript', { text });
  });

  provider.on('patient_transcript', (text) => {
    socket.send(JSON.stringify({ type: 'patient_transcript', text }));
    forward('patient_transcript', { text });
    void (async () => {
      // Ignore tiny fragments; language detection is noisy on very short text.
      if (text.trim().length < 6) {
        return;
      }
      const detected = detectLanguageCode(text);
      if (!detected) {
        return;
      }
      // Hybrid mode: only switch to user-selected languages; otherwise fallback to English.
      const nextLanguage = selectedLanguages.includes(detected) ? detected : 'en';
      if (nextLanguage === currentLanguage) {
        pendingLanguageCandidate = null;
        pendingLanguageHits = 0;
        return;
      }
      if (pendingLanguageCandidate === nextLanguage) {
        pendingLanguageHits += 1;
      } else {
        pendingLanguageCandidate = nextLanguage;
        pendingLanguageHits = 1;
      }
      const nowMs = Date.now();
      // Require 2 confirmations and a short cooldown to avoid oscillation (noise/code-switching).
      if (pendingLanguageHits < 2 || nowMs - lastLanguageSwitchAt < 3000) {
        return;
      }
      pendingLanguageCandidate = null;
      pendingLanguageHits = 0;
      lastLanguageSwitchAt = nowMs;
      currentLanguage = nextLanguage;
      const basePrompt = buildSystemPrompt(spec, null, { language: nextLanguage });
      const updatedPrompt =
        nextLanguage === 'en' && detected !== 'en' && !selectedLanguages.includes(detected)
          ? `${basePrompt}

LANGUAGE POLICY
- Respond in English.
- If user speaks an unsupported language, say: "I can assist you in ${selectedLanguages.join(', ')}. Please share your concern in one of these languages."
- Keep the response conversational and helpful.`
          : basePrompt;
      try {
        await provider.updateSession(handle, {
          language: nextLanguage,
          systemPrompt: updatedPrompt,
        });
        await prisma.session
          .update({
            where: { id: sessionId },
            data: { language: nextLanguage },
          })
          .catch(() => {
            /* non-blocking */
          });
        socket.send(JSON.stringify({ type: 'language_change', language: nextLanguage }));
        forward('language_change', { language: nextLanguage });
      } catch {
        /* non-blocking */
      }
    })();
  });

  provider.on('turn_complete', () => {
    socket.send(JSON.stringify({ type: 'turn_complete' }));
    forward('turn_complete', {});
  });

  provider.on('error', () => {
    socket.send(
      JSON.stringify({
        type: 'error',
        message: 'Voice provider error',
      })
    );
    forward('error', { message: 'voice_provider_error' });
  });

  socket.on('message', async (raw: Buffer | ArrayBuffer | Buffer[]) => {
    const text = Buffer.isBuffer(raw)
      ? raw.toString('utf8')
      : typeof raw === 'string'
        ? raw
        : Buffer.from(raw as ArrayBuffer).toString('utf8');
    let msg: ClientMessage;
    try {
      msg = JSON.parse(text) as ClientMessage;
    } catch {
      return;
    }

    if (msg.type === 'session.end') {
      await provider.endSession(handle);
      socket.close();
      return;
    }

    if (
      msg.type === 'input_audio_buffer.append' &&
      typeof msg.audio === 'string'
    ) {
      await provider.sendAudio(handle, msg.audio);
    }
  });

  socket.on('close', async () => {
    try {
      await provider.endSession(handle);
    } catch {
      /* ignore */
    }
  });
}
