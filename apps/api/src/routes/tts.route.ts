import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';

const ELEVENLABS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const ELEVENLABS_STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text';
const TTS_TIMEOUT_MS = 20_000;
const STT_TIMEOUT_MS = 30_000;

function withTimeout(timeoutMs: number): AbortSignal {
    return AbortSignal.timeout(timeoutMs);
}

function getFileExtension(mimeType: string): string {
    if (mimeType.includes('webm')) {
        return 'webm';
    }
    if (mimeType.includes('ogg')) {
        return 'ogg';
    }
    if (mimeType.includes('mp4')) {
        return 'mp4';
    }
    if (mimeType.includes('mpeg')) {
        return 'mp3';
    }
    if (mimeType.includes('wav')) {
        return 'wav';
    }
    return 'webm';
}

function normalizeLanguageCode(language?: string): string | null {
    const code = language?.trim();
    if (!code) {
        return null;
    }
    const normalized = code.split('-')[0]?.toLowerCase();
    return normalized || null;
}

export async function registerTtsRoutes(
    app: FastifyInstance,
    deps: { cfg: AppConfig }
): Promise<void> {
    const { cfg } = deps;

    app.post<{
        Body: {
            text?: string;
            voiceId?: string;
        };
    }>('/api/voice/tts', async (req, reply) => {
        const text = req.body.text?.trim();
        if (!text) {
            return reply.status(400).send({ error: 'text is required' });
        }

        if (!cfg.ELEVENLABS_API_KEY) {
            return reply.status(503).send({ error: 'ElevenLabs is not configured on the server' });
        }

        const voiceId = req.body.voiceId?.trim() || cfg.ELEVENLABS_DEFAULT_VOICE_ID;
        if (!voiceId) {
            return reply.status(400).send({ error: 'voiceId is required' });
        }

        try {
            const response = await fetch(`${ELEVENLABS_URL}/${voiceId}`, {
                method: 'POST',
                headers: {
                    'xi-api-key': cfg.ELEVENLABS_API_KEY,
                    'Content-Type': 'application/json',
                    Accept: 'audio/mpeg',
                },
                body: JSON.stringify({
                    text,
                    model_id: cfg.ELEVENLABS_TTS_MODEL,
                }),
                signal: withTimeout(TTS_TIMEOUT_MS),
            });

            if (!response.ok) {

                console.log('ElevenLabs TTS request failed:', { status: response });

                const errorBody = await response.text().catch(() => '');
                req.log.error(
                    { status: response.status, errorBody },
                    'ElevenLabs TTS request failed'
                );
                return reply.status(502).send({
                    error: 'ElevenLabs failed to synthesize audio',
                });
            }

            const audioBuffer = Buffer.from(await response.arrayBuffer());

            console.log('ElevenLabs TTS request succeeded:', {
                status: response.status,
                contentType: response.headers.get('content-type'),
                audioSize: audioBuffer.length,
            });

            return reply
                .header('Content-Type', response.headers.get('content-type') ?? 'audio/mpeg')
                .header('Cache-Control', 'no-store')
                .send(audioBuffer);
        } catch (error) {
            req.log.error({ err: error }, 'Failed to reach ElevenLabs');
            return reply.status(504).send({ error: 'Timed out while generating speech audio' });
        }
    });

    app.post<{
        Body: {
            audioBase64?: string;
            mimeType?: string;
            language?: string;
        };
    }>('/api/voice/stt', async (req, reply) => {
        const audioBase64 = req.body.audioBase64?.trim();
        if (!audioBase64) {
            return reply.status(400).send({ error: 'audioBase64 is required' });
        }

        if (!cfg.ELEVENLABS_API_KEY) {
            return reply.status(503).send({ error: 'ElevenLabs is not configured on the server' });
        }

        const mimeType = req.body.mimeType?.trim() || 'audio/webm';
        const languageCode = normalizeLanguageCode(req.body.language);

        try {
            const audioBuffer = Buffer.from(audioBase64, 'base64');
            const formData = new FormData();
            formData.append(
                'file',
                new Blob([audioBuffer], { type: mimeType }),
                `recording.${getFileExtension(mimeType)}`
            );
            formData.append('model_id', cfg.ELEVENLABS_STT_MODEL);
            if (languageCode) {
                formData.append('language_code', languageCode);
            }

            const response = await fetch(ELEVENLABS_STT_URL, {
                method: 'POST',
                headers: {
                    'xi-api-key': cfg.ELEVENLABS_API_KEY,
                },
                body: formData,
                signal: withTimeout(STT_TIMEOUT_MS),
            });

            if (!response.ok) {
                const errorBody = await response.text().catch(() => '');
                req.log.error(
                    { status: response.status, errorBody },
                    'ElevenLabs STT request failed'
                );
                return reply.status(502).send({
                    error: 'ElevenLabs failed to transcribe audio',
                });
            }

            const data = (await response.json()) as {
                text?: string;
                language_code?: string;
            };
            return reply.send({
                text: data.text ?? '',
                languageCode: data.language_code ?? languageCode,
            });
        } catch (error) {
            req.log.error({ err: error }, 'Failed to reach ElevenLabs speech-to-text');
            return reply.status(504).send({ error: 'Timed out while transcribing audio' });
        }
    });
}