export interface SpeakTextOptions {
    baseUrl: string;
    text: string;
    voiceId?: string;
    timeoutMs?: number;
}

export interface TranscribeSpeechOptions {
    baseUrl: string;
    audioBlob: Blob;
    language?: string;
    mimeType?: string;
    timeoutMs?: number;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let index = 0; index < bytes.length; index += 1) {
        binary += String.fromCharCode(bytes[index]);
    }
    return btoa(binary);
}

async function readErrorMessage(response: Response): Promise<string> {
    try {
        const payload = (await response.json()) as { error?: string };
        return payload.error ?? 'Speech generation failed';
    } catch {
        return 'Speech generation failed';
    }
}

export async function speakText({
    baseUrl,
    text,
    voiceId,
    timeoutMs = 20_000,
}: SpeakTextOptions): Promise<Blob> {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${baseUrl}/api/voice/tts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text,
                voiceId,
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(await readErrorMessage(response));
        }

        return await response.blob();
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new Error('Network timeout while generating speech audio');
        }
        throw error;
    } finally {
        window.clearTimeout(timeoutId);
    }
}

export async function transcribeSpeech({
    baseUrl,
    audioBlob,
    language,
    mimeType = audioBlob.type || 'audio/webm',
    timeoutMs = 30_000,
}: TranscribeSpeechOptions): Promise<string> {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
        const audioBase64 = arrayBufferToBase64(await audioBlob.arrayBuffer());
        const response = await fetch(`${baseUrl}/api/voice/stt`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                audioBase64,
                mimeType,
                language,
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(await readErrorMessage(response));
        }

        const data = (await response.json()) as { text?: string };
        return data.text?.trim() ?? '';
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new Error('Network timeout while transcribing audio');
        }
        throw error;
    } finally {
        window.clearTimeout(timeoutId);
    }
}