import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentSpec } from '@vhos/shared';
import { getApiBase } from '../lib/api.js';

export type OrbUiState = 'idle' | 'listening' | 'speaking' | 'thinking';

export interface TranscriptLine {
  role: 'agent' | 'patient';
  text: string;
}

function floatToPcm16Base64(input: Float32Array): string {
  const buf = new ArrayBuffer(input.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < input.length; i += 1) {
    let s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Provider-agnostic voice hook — only talks to VHOS backend WebSocket proxy.
 * Backend uses `OPENAI_API_KEY` for Realtime; browser never sees the key.
 */
export function useRealtimeVoice(): {
  orbState: OrbUiState;
  transcript: TranscriptLine[];
  language: string;
  mute: boolean;
  setMute: (v: boolean) => void;
  startCall: (agentId: string) => Promise<string | null>;
  startDraftCall: (draftSpec: AgentSpec) => Promise<string | null>;
  endCall: () => void;
  playbackAnalyser: AnalyserNode | null;
  micAnalyser: AnalyserNode | null;
  error: string | null;
} {
  const [orbState, setOrbState] = useState<OrbUiState>('idle');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [language, setLanguage] = useState('en');
  const [mute, setMute] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playbackAnalyser, setPlaybackAnalyser] = useState<AnalyserNode | null>(
    null
  );
  const [micAnalyser, setMicAnalyser] = useState<AnalyserNode | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playGainRef = useRef<GainNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const muteRef = useRef(false);
  const nextPlaybackTimeRef = useRef(0);

  useEffect(() => {
    muteRef.current = mute;
  }, [mute]);

  const endCall = useCallback(() => {
    const sid = sessionIdRef.current;
    const base = getApiBase();
    try {
      wsRef.current?.send(JSON.stringify({ type: 'session.end' }));
    } catch {
      /* ignore */
    }
    wsRef.current?.close();
    wsRef.current = null;
    esRef.current?.close();
    esRef.current = null;
    processorRef.current?.disconnect();
    processorRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    playGainRef.current = null;
    sessionIdRef.current = null;
    setPlaybackAnalyser(null);
    setMicAnalyser(null);
    setOrbState('idle');
    if (sid) {
      void fetch(`${base}/api/voice/session/${sid}/end`, { method: 'POST' });
    }
  }, []);

  const establishVoiceSession = useCallback(
    async (startBody: Record<string, unknown>) => {
      setError(null);
      endCall();
      const base = getApiBase();
      const res = await fetch(`${base}/api/voice/session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(startBody),
      });
      if (!res.ok) {
        setError('Could not start voice session');
        return null;
      }
      const data = (await res.json()) as { sessionId: string; wsUrl: string };
      sessionIdRef.current = data.sessionId;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Match Realtime expected PCM cadence more closely for stable VAD/transcription.
      const ctx = new AudioContext({ sampleRate: 24_000 });
      audioCtxRef.current = ctx;
      nextPlaybackTimeRef.current = 0;

      const playGain = ctx.createGain();
      playGain.gain.value = 1;
      playGainRef.current = playGain;
      const playAnalyser = ctx.createAnalyser();
      playAnalyser.fftSize = 1024;
      setPlaybackAnalyser(playAnalyser);
      playGain.connect(playAnalyser);
      playAnalyser.connect(ctx.destination);

      const source = ctx.createMediaStreamSource(stream);
      const micA = ctx.createAnalyser();
      micA.fftSize = 1024;
      setMicAnalyser(micA);
      source.connect(micA);

      const proc = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = proc;
      proc.onaudioprocess = (e) => {
        const ws = wsRef.current;
        if (
          muteRef.current ||
          !ws ||
          ws.readyState !== WebSocket.OPEN
        ) {
          return;
        }
        const input = e.inputBuffer.getChannelData(0);
        const copy = new Float32Array(input.length);
        copy.set(input);
        const b64 = floatToPcm16Base64(copy);
        ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: b64 }));
      };
      source.connect(proc);
      proc.connect(ctx.destination);

      const ws = new WebSocket(data.wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setOrbState('listening');
      };

      let agentBuf = '';

      ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as {
          type?: string;
          audio?: string;
          text?: string;
        };
        const gain = playGainRef.current;
        const actx = audioCtxRef.current;
        if (!gain || !actx) {
          return;
        }
        switch (msg.type) {
          case 'audio_chunk': {
            if (!msg.audio) {
              break;
            }
            setOrbState('speaking');
            const bin = atob(msg.audio);
            const len = bin.length / 2;
            const i16 = new Int16Array(len);
            for (let i = 0; i < len; i += 1) {
              i16[i] =
                (bin.charCodeAt(i * 2 + 1) << 8) | bin.charCodeAt(i * 2);
            }
            const f32 = new Float32Array(len);
            for (let i = 0; i < len; i += 1) {
              f32[i] = i16[i] / 32768;
            }
            const ab = actx.createBuffer(1, f32.length, 24_000);
            ab.copyToChannel(f32, 0);
            const srcN = actx.createBufferSource();
            srcN.buffer = ab;
            srcN.connect(gain);
            // Queue each chunk to a small rolling buffer to avoid jitter and A/V drift.
            const now = actx.currentTime;
            if (nextPlaybackTimeRef.current < now) {
              nextPlaybackTimeRef.current = now + 0.03;
            }
            const startAt = nextPlaybackTimeRef.current;
            srcN.start(startAt);
            nextPlaybackTimeRef.current += ab.duration;
            break;
          }
          case 'agent_transcript': {
            if (msg.text) {
              agentBuf += msg.text;
            }
            break;
          }
          case 'patient_transcript': {
            if (msg.text) {
              setTranscript((t) => {
                const next: TranscriptLine[] = [...t];
                const last = next[next.length - 1];
                const chunk = msg.text ?? '';
                if (last?.role === 'patient') {
                  next[next.length - 1] = {
                    role: 'patient' as const,
                    text: chunk,
                  };
                } else {
                  next.push({ role: 'patient', text: chunk });
                }
                return next.slice(-6);
              });
              setOrbState('listening');
            }
            break;
          }
          case 'turn_complete': {
            if (agentBuf) {
              setTranscript((t) => {
                const line: TranscriptLine = {
                  role: 'agent',
                  text: agentBuf,
                };
                return [...t, line].slice(-6);
              });
              agentBuf = '';
            }
            setOrbState('listening');
            break;
          }
          case 'error':
            setError('Voice error');
            setOrbState('idle');
            break;
          default:
            break;
        }
      };

      ws.onerror = () => {
        setError('WebSocket error');
      };

      const es = new EventSource(
        `${base}/api/voice/session/${data.sessionId}/events`
      );
      esRef.current = es;
      es.onmessage = (ev) => {
        try {
          const p = JSON.parse(ev.data as string) as {
            type?: string;
            language?: string;
          };
          if (p.type === 'language_change' && p.language) {
            setLanguage(p.language);
          }
        } catch {
          /* ignore */
        }
      };

      return data.sessionId;
    },
    [endCall]
  );

  const startCall = useCallback(
    async (agentId: string) => establishVoiceSession({ agentId }),
    [establishVoiceSession]
  );

  const startDraftCall = useCallback(
    async (draftSpec: AgentSpec) =>
      establishVoiceSession({ isDraft: true, draftSpec }),
    [establishVoiceSession]
  );

  return {
    orbState,
    transcript,
    language,
    mute,
    setMute,
    startCall,
    startDraftCall,
    endCall,
    playbackAnalyser,
    micAnalyser,
    error,
  };
}
