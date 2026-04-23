import { useEffect, useRef, useState } from 'react';
import { speakText, transcribeSpeech } from '../utils/elevenlabs.js';

export type VoiceAssistantLanguage = 'en-US' | 'en-IN' | 'hi-IN';
export type VoiceAssistantStatus = 'idle' | 'listening' | 'processing' | 'speaking';

export interface UseVoiceAssistantOptions {
    baseUrl: string;
    voiceId?: string;
    defaultLanguage?: VoiceAssistantLanguage;
    onTranscript?: (text: string) => void;
    onResponse?: (text: string) => void;
    onError?: (message: string) => void;
    submitMessage: (text: string, options?: { force?: boolean }) => Promise<string>;
}

const TRANSCRIPT_PREVIEW_MS = 150;
const MAX_RECORDING_MS = 15_000;
const SILENCE_DURATION_MS = 1_200;
const SPEECH_THRESHOLD = 0.02;

function isVoiceCaptureSupported(): boolean {
    return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

function mapRecordingError(error: unknown): string {
    if (error instanceof DOMException) {
        switch (error.name) {
            case 'NotAllowedError':
            case 'SecurityError':
                return 'Microphone permission was denied.';
            case 'NotFoundError':
            case 'DevicesNotFoundError':
                return 'No microphone was found on this device.';
            case 'NotReadableError':
            case 'TrackStartError':
                return 'The microphone is busy or unavailable.';
            default:
                break;
        }
    }
    return 'Speech capture failed. Try again.';
}

function chooseRecorderMimeType(): string {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    for (const mimeType of candidates) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
            return mimeType;
        }
    }
    return '';
}

export function useVoiceAssistant({
    baseUrl,
    voiceId,
    defaultLanguage = 'en-US',
    onTranscript,
    onResponse,
    onError,
    submitMessage,
}: UseVoiceAssistantOptions): {
    isSupported: boolean;
    status: VoiceAssistantStatus;
    language: VoiceAssistantLanguage;
    transcript: string;
    interimTranscript: string;
    setLanguage: (value: VoiceAssistantLanguage) => void;
    toggleListening: () => void;
    startListening: () => void;
    stopListening: () => void;
    stopSpeaking: () => void;
} {
    const [status, setStatus] = useState<VoiceAssistantStatus>('idle');
    const [language, setLanguage] = useState<VoiceAssistantLanguage>(defaultLanguage);
    const [transcript, setTranscript] = useState('');
    const [interimTranscript, setInterimTranscript] = useState('');

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const hasDetectedSpeechRef = useRef(false);
    const lastSpeechAtRef = useRef<number | null>(null);
    const recordingAnimationFrameRef = useRef<number | null>(null);
    const recordingTimeoutRef = useRef<number | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const mediaSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioUrlRef = useRef<string | null>(null);
    const mountedRef = useRef(true);

    const isSupported = isVoiceCaptureSupported();

    const cleanupRecordingResources = () => {
        if (recordingAnimationFrameRef.current !== null) {
            window.cancelAnimationFrame(recordingAnimationFrameRef.current);
            recordingAnimationFrameRef.current = null;
        }
        if (recordingTimeoutRef.current !== null) {
            window.clearTimeout(recordingTimeoutRef.current);
            recordingTimeoutRef.current = null;
        }
        mediaRecorderRef.current = null;
        analyserRef.current?.disconnect();
        analyserRef.current = null;
        mediaSourceRef.current?.disconnect();
        mediaSourceRef.current = null;
        if (audioContextRef.current) {
            void audioContextRef.current.close();
            audioContextRef.current = null;
        }
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
    };

    useEffect(() => {
        return () => {
            mountedRef.current = false;
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
            cleanupRecordingResources();
            audioRef.current?.pause();
            if (audioUrlRef.current) {
                URL.revokeObjectURL(audioUrlRef.current);
            }
        };
    }, []);

    const stopSpeaking = () => {
        const audio = audioRef.current;
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
            audioRef.current = null;
        }
        if (audioUrlRef.current) {
            URL.revokeObjectURL(audioUrlRef.current);
            audioUrlRef.current = null;
        }
        setStatus((current) => (current === 'speaking' ? 'idle' : current));
    };

    const playAudioBlob = async (audioBlob: Blob): Promise<void> => {
        if (!mountedRef.current) {
            return;
        }

        stopSpeaking();
        const url = URL.createObjectURL(audioBlob);
        audioUrlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
            if (!mountedRef.current) {
                return;
            }
            stopSpeaking();
        };
        audio.onerror = () => {
            stopSpeaking();
            onError?.('Generated audio could not be played.');
        };

        setStatus('speaking');
        await audio.play();
    };

    const stopListening = () => {
        const mediaRecorder = mediaRecorderRef.current;
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
    };

    const processTranscript = async (text: string) => {

        try {
            console.log('Processing transcript:', { text });

            // if (!text || !mountedRef.current) {
            //     return;
            // }

            setStatus('processing');
            setTranscript(text);
            setInterimTranscript('');
            onTranscript?.(text);
            await new Promise((resolve) => window.setTimeout(resolve, TRANSCRIPT_PREVIEW_MS));

            console.log('Submitting transcript to API:', { text });

            try {
                const responseText = await submitMessage(text, { force: true });
                onResponse?.(responseText);

                const audioBlob = await speakText({
                    baseUrl,
                    text: responseText,
                    voiceId,
                });
                await playAudioBlob(audioBlob);
            } catch (error) {
                stopSpeaking();
                onError?.(error instanceof Error ? error.message : 'Voice request failed.');
                setStatus('idle');
            }
        } catch (error) {
            console.error('Error during transcript processing:', error);
            onError?.(error instanceof Error ? error.message : 'An unexpected error occurred while processing speech.');
            setStatus('idle');
        }
    };

    const startListening = () => {
        if (!isSupported) {
            onError?.('This browser does not support microphone recording.');
            return;
        }

        if (status === 'processing') {
            return;
        }

        if (status === 'speaking') {
            stopSpeaking();
        }

        setTranscript('');
        setInterimTranscript('Listening...');
        recordedChunksRef.current = [];
        hasDetectedSpeechRef.current = false;
        lastSpeechAtRef.current = null;

        void (async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaStreamRef.current = stream;

                const recorder = new MediaRecorder(stream, chooseRecorderMimeType() ? { mimeType: chooseRecorderMimeType() } : undefined);
                mediaRecorderRef.current = recorder;

                recorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        recordedChunksRef.current.push(event.data);
                    }
                };

                recorder.onerror = () => {
                    cleanupRecordingResources();
                    setInterimTranscript('');
                    setStatus('idle');
                    onError?.('Audio recording failed.');
                };

                recorder.onstop = () => {
                    const mimeType = recorder.mimeType || 'audio/webm';
                    const audioBlob = new Blob(recordedChunksRef.current, { type: mimeType });
                    cleanupRecordingResources();
                    setInterimTranscript('');

                    if (!audioBlob.size || !hasDetectedSpeechRef.current) {
                        setStatus('idle');
                        onError?.('No speech was detected. Try again.');
                        return;
                    }

                    void (async () => {
                        try {
                            setStatus('processing');
                            const transcriptText = await transcribeSpeech({
                                baseUrl,
                                audioBlob,
                                mimeType,
                                language,
                            });

                            if (!transcriptText.trim()) {
                                setStatus('idle');
                                onError?.('No speech was detected. Try again.');
                                return;
                            }

                            console.log('Transcribed text:', transcriptText);

                            await processTranscript(transcriptText);
                        } catch (error) {
                            setStatus('idle');
                            onError?.(error instanceof Error ? error.message : 'Speech-to-text failed.');
                        }
                    })();
                };

                const audioContext = new AudioContext();
                audioContextRef.current = audioContext;
                const source = audioContext.createMediaStreamSource(stream);
                mediaSourceRef.current = source;
                const analyser = audioContext.createAnalyser();
                analyser.fftSize = 2048;
                analyserRef.current = analyser;
                source.connect(analyser);
                const samples = new Uint8Array(analyser.fftSize);

                const monitorAudioLevel = () => {
                    const node = analyserRef.current;
                    const activeRecorder = mediaRecorderRef.current;
                    if (!node || !activeRecorder || activeRecorder.state === 'inactive') {
                        return;
                    }

                    node.getByteTimeDomainData(samples);
                    let sumSquares = 0;
                    for (let index = 0; index < samples.length; index += 1) {
                        const normalized = (samples[index] - 128) / 128;
                        sumSquares += normalized * normalized;
                    }
                    const rms = Math.sqrt(sumSquares / samples.length);
                    const now = Date.now();

                    if (rms >= SPEECH_THRESHOLD) {
                        hasDetectedSpeechRef.current = true;
                        lastSpeechAtRef.current = now;
                        setInterimTranscript('Recording...');
                    } else if (
                        hasDetectedSpeechRef.current &&
                        lastSpeechAtRef.current !== null &&
                        now - lastSpeechAtRef.current >= SILENCE_DURATION_MS
                    ) {
                        activeRecorder.stop();
                        return;
                    }

                    recordingAnimationFrameRef.current = window.requestAnimationFrame(monitorAudioLevel);
                };

                recorder.start(250);
                setStatus('listening');
                recordingAnimationFrameRef.current = window.requestAnimationFrame(monitorAudioLevel);
                recordingTimeoutRef.current = window.setTimeout(() => {
                    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                        mediaRecorderRef.current.stop();
                    }
                }, MAX_RECORDING_MS);
            } catch (error) {
                cleanupRecordingResources();
                setInterimTranscript('');
                setStatus('idle');
                onError?.(mapRecordingError(error));
            }
        })();
    };

    const toggleListening = () => {
        if (status === 'listening') {
            stopListening();
            return;
        }
        startListening();
    };

    return {
        isSupported,
        status,
        language,
        transcript,
        interimTranscript,
        setLanguage,
        toggleListening,
        startListening,
        stopListening,
        stopSpeaking,
    };
}