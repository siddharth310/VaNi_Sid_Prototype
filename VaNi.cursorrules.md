# VHOS · Virtual Hospital Operating System
## Cursor Full-Product Prompt — v4 Final
### Hospital AI Agent Platform · Greenfield Build · Single App · Pluggable Voice Provider

---

> **How to use:** Save as `.cursorrules` in your repo root. Cursor reads it automatically in every Composer session. Reference section names when asking for specific features (e.g. "build Section 5 — Voice Architecture").

---

## 1. PRODUCT VISION

**VHOS** is a voice-first, real-time, empathy-driven multi-agent platform for hospital automation.

**Two distinct user experiences live in this product:**

### Experience A — Agent Studio (Hospital Staff)
Hospital staff (care coordinators, clinical ops, IT) log in and:
- Build AI agents using an 8-tab workbook UI that matches the VHOS Agent Workbook spec
- See a live preview of the assembled system prompt, guardrail checklist, and interaction mix
- Test the agent in a built-in simulation before publishing
- Monitor deployed agents and sessions from a dashboard

### Experience B — Patient Demo Tab (same app, separate nav tab)
The patient-facing demo lives inside the same React app as the Agent Studio — accessible via a **"Try Agent"** or **"Patient Demo"** tab in the main nav. No separate deployment needed for V1.

From this tab, a staff member (or patient in demo) can interact with any published agent via:
- **Voice call** — an animated orb UI. User clicks "Start Call", the orb pulses, and they talk naturally like a phone call. The agent responds with its AI voice in real time. User clicks "End Call" to stop.
- **Chat** — standard WhatsApp-style chat bubbles. User types, agent responds. Visible on screen, building as the conversation flows.
- Both modes detect the user's language in real time and seamlessly mirror it — language, tone, and vocabulary complexity all adapt instantly, no confirmation prompt.

> **Future:** When deploying to real patients, this tab's UI can be extracted into a standalone `apps/patient` package with no logic changes — the components and hooks are self-contained.

**Core philosophy (enforce in every component):**
- Empathy is the entry point. Goals and decisions are the outcome.
- Understand deeply before suggesting anything — discovery before action.
- First-aid is proactive, not reactive — offer safety guidance before escalating.
- The voice call feels like a real phone call, not a chatbot with a mic button.
- HIPAA guardrails are non-negotiable. PHI is always gated. When in doubt, escalate.

**This is a greenfield build. No existing codebase to port or reference.**

---

## 2. CRITICAL ARCHITECTURE DECISION — VOICE PROVIDER ABSTRACTION

### The core principle: voice provider is a swappable plugin
The voice backend is hidden behind a `VoiceProvider` interface. Swapping from OpenAI Realtime to ElevenLabs Conversational AI (or any future provider) requires only:
1. Changing `VOICE_PROVIDER=openai` → `VOICE_PROVIDER=elevenlabs` in `.env`
2. No frontend changes
3. No agent spec changes
4. No session logic changes

### The interface every provider must implement
```typescript
// packages/shared/types/voice-provider.types.ts

interface VoiceProvider {
  // Called once when session starts
  startSession(config: VoiceSessionConfig): Promise<VoiceSessionHandle>;

  // Called to update system prompt mid-session (language change, auth, emotion)
  updateSession(handle: VoiceSessionHandle, patch: Partial<VoiceSessionConfig>): Promise<void>;

  // Called when patient audio chunk arrives from browser
  sendAudio(handle: VoiceSessionHandle, pcm16Base64: string): Promise<void>;

  // Called to end session cleanly
  endSession(handle: VoiceSessionHandle): Promise<void>;

  // Provider emits these events — backend relays to frontend via SSE
  on(event: 'audio_chunk', cb: (audio: string) => void): void;
  on(event: 'agent_transcript', cb: (text: string) => void): void;
  on(event: 'patient_transcript', cb: (text: string) => void): void;
  on(event: 'turn_complete', cb: () => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
}

interface VoiceSessionConfig {
  systemPrompt: string;
  voice: string;             // Provider-specific voice ID
  language: string;          // ISO 639-1 code
  maxTokensPerTurn: number;  // Controls response length
  silenceDurationMs: number; // VAD sensitivity
}
```

### Provider implementations

#### Provider A — OpenAI Realtime (DEFAULT, V1)
```typescript
// apps/api/src/runtime/voice/providers/openai-realtime.provider.ts
class OpenAIRealtimeProvider implements VoiceProvider {
  // Uses: wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview
  // Full-duplex WebSocket, server_vad, built-in barge-in
  // Voice options: alloy | echo | shimmer | fable | onyx | nova
  // Update mid-session via: { type: 'session.update', session: { instructions: ... } }
}
```

#### Provider B — ElevenLabs Conversational AI (READY TO SWAP, V1.x)
```typescript
// apps/api/src/runtime/voice/providers/elevenlabs-conversational.provider.ts
class ElevenLabsConversationalProvider implements VoiceProvider {
  // Uses: ElevenLabs Conversational AI SDK (@11labs/client)
  // Conversation class handles WebSocket, VAD, TTS, STT internally
  // Agent voice: configured per-agent via ElevenLabs voice_id
  // Mid-session update: via conversation.setVariables() or restart with new config
  // NOTE: ElevenLabs requires the agent to be pre-configured on their platform
  //       OR use dynamic variables injected at session start
}
```

#### Factory — reads VOICE_PROVIDER env var
```typescript
// apps/api/src/runtime/voice/voice-provider.factory.ts
export function createVoiceProvider(): VoiceProvider {
  switch (process.env.VOICE_PROVIDER) {
    case 'elevenlabs': return new ElevenLabsConversationalProvider();
    case 'openai':
    default:           return new OpenAIRealtimeProvider();
  }
}
```

### ❌ What we are NOT building
- A click-to-speak / push-to-talk UI
- A separate STT + TTS + VAD pipeline (the Realtime providers handle this end-to-end)
- Provider-specific logic in frontend or session logic

### ✅ What we ARE building
- A thin **backend proxy** (`RealtimeProxy`) that sits between the browser WebSocket and whichever `VoiceProvider` is active
- An **orb UI** driven by audio amplitude from the Web Audio API — it has no knowledge of which provider is running
- A **pluggable factory** so the provider is a one-line config change

### Voice Session Flow (provider-agnostic)
```
User clicks "Start Call" (in Patient Demo tab)
  → Browser requests microphone permission
  → Frontend opens WebSocket to backend: /api/voice/session/:id
  → Backend: createVoiceProvider() → starts provider session with assembled system prompt
  → Browser streams raw PCM16 audio chunks → backend → VoiceProvider
  → VoiceProvider streams audio response chunks → backend → browser
  → Browser decodes PCM16 → plays via Web Audio API
  → Orb pulses from audio amplitude (Web Audio API AnalyserNode)
  → Transcript events → SSE → frontend (live transcript below orb)
  → Language/emotion changes → session.update (mid-session, no restart)
  → User clicks "End Call"
    → Backend calls provider.endSession()
    → PHI cleared from Redis
    → Full transcript saved to DB
    → Audit events logged
```

### Barge-in
OpenAI Realtime API handles this natively. When the patient speaks while the agent is responding, the API cuts the agent audio and processes the patient input. No custom interrupt logic needed.

---

## 3. TECH STACK

### Backend
| Layer | Choice | Notes |
|-------|--------|-------|
| Runtime | Node.js 20 + TypeScript strict | |
| Framework | Fastify | Better streaming + WebSocket support |
| ORM | Prisma | PostgreSQL prod / SQLite local dev |
| Orchestration | LangGraph (JS) | For chat mode and multi-step agent logic |
| Voice | OpenAI Realtime API | Full-duplex, replaces STT + TTS + VAD |
| Session memory | Redis | Session state, patient context, turn history |
| Long-term memory | Pinecone | Phase 2 |
| Infra | Docker Compose local → AWS ECS prod | |
| Monitoring | Prometheus + Grafana | |
| Audit/SIEM | Webhook → configurable endpoint | |

### AI
| Component | Choice | Notes |
|-----------|--------|-------|
| Voice + STT + TTS | OpenAI Realtime API `gpt-4o-realtime-preview` | Single API — replaces entire voice pipeline |
| LLM (chat mode) | OpenAI `gpt-4o` | Chat mode, Agent Studio preview simulation |
| LLM (routing) | OpenAI `gpt-4o-mini` | Intent classification, guardrail checks, cost |

### Frontend
| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | React 18 + Vite + TypeScript | |
| Styling | Tailwind CSS + shadcn/ui | Dark theme for Staff, clean light/neutral for Patient |
| State | Zustand | |
| Audio | Web Audio API | Orb animation from audio amplitude analysis |
| Chat | Custom chat UI | WhatsApp-style bubbles |

---

## 4. APP STRUCTURE — TWO DISTINCT UIs

```
vhos/
├── .cursorrules
├── docker-compose.yml
├── .env.example
│
├── packages/
│   └── shared/
│       ├── types/
│       │   ├── agent.types.ts
│       │   ├── session.types.ts
│       │   ├── voice-provider.types.ts   ← VoiceProvider interface (the contract)
│       │   └── fhir.types.ts
│       └── constants/
│           ├── guardrail.constants.ts
│           └── agent.constants.ts
│
├── apps/
│   ├── api/                              ← Fastify backend
│   │   └── src/
│   │       ├── index.ts
│   │       ├── config.ts
│   │       │
│   │       ├── agents/                   ← Built-in agent definitions
│   │       │   ├── _base.agent.ts
│   │       │   ├── discharge-followup.agent.ts
│   │       │   ├── appointment.agent.ts
│   │       │   ├── chronic-checkin.agent.ts
│   │       │   ├── surgery-recovery.agent.ts
│   │       │   ├── lab-results.agent.ts
│   │       │   └── emergency-triage.agent.ts
│   │       │
│   │       ├── runtime/
│   │       │   ├── voice/
│   │       │   │   ├── voice-provider.factory.ts    ← reads VOICE_PROVIDER env
│   │       │   │   ├── realtime-proxy.ts            ← browser WS ↔ VoiceProvider
│   │       │   │   └── providers/
│   │       │   │       ├── openai-realtime.provider.ts   ← DEFAULT (V1)
│   │       │   │       └── elevenlabs-conversational.provider.ts  ← READY (V1.x)
│   │       │   ├── chat/
│   │       │   │   ├── graph.ts                     ← LangGraph (chat mode)
│   │       │   │   └── nodes/
│   │       │   │       ├── intent-classifier.node.ts
│   │       │   │       ├── discovery.node.ts
│   │       │   │       ├── empathy.node.ts
│   │       │   │       ├── firstaid.node.ts
│   │       │   │       ├── phi-gate.node.ts
│   │       │   │       ├── llm-response.node.ts
│   │       │   │       ├── guardrail-check.node.ts
│   │       │   │       └── escalation.node.ts
│   │       │   ├── guardrails.ts
│   │       │   ├── empathy-layer.ts
│   │       │   ├── pain-discovery.ts
│   │       │   ├── firstaid.ts
│   │       │   ├── language-detector.ts
│   │       │   └── prompt-assembler.ts
│   │       │
│   │       ├── auth/
│   │       │   ├── patient-verifier.ts
│   │       │   └── otp.ts
│   │       │
│   │       ├── fhir/client.ts
│   │       │
│   │       ├── routes/
│   │       │   ├── agents.route.ts
│   │       │   ├── sessions.route.ts
│   │       │   ├── turns.route.ts
│   │       │   ├── voice.route.ts
│   │       │   └── studio.route.ts
│   │       │
│   │       ├── db/prisma/schema.prisma
│   │       └── audit/audit-logger.ts
│   │
│   └── web/                              ← SINGLE React app (staff + patient demo)
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           │
│           ├── pages/
│           │   ├── Dashboard.tsx
│           │   ├── Agents.tsx
│           │   ├── AgentStudio.tsx
│           │   ├── PatientDemo.tsx       ← "Try Agent" tab — orb + chat in one page
│           │   └── Patients.tsx
│           │
│           ├── components/
│           │   ├── orb/                  ← Self-contained; can be extracted to apps/patient later
│           │   │   ├── Orb.tsx
│           │   │   ├── OrbRing.tsx
│           │   │   ├── OrbState.tsx
│           │   │   └── CallControls.tsx
│           │   ├── chat/
│           │   │   ├── ChatBubble.tsx
│           │   │   ├── ChatInput.tsx
│           │   │   ├── TypingIndicator.tsx
│           │   │   └── LanguageBadge.tsx
│           │   ├── studio/
│           │   │   ├── WorkbookTabs.tsx
│           │   │   ├── tabs/             ← 8 tab components
│           │   │   ├── preview/
│           │   │   │   ├── PromptPreview.tsx
│           │   │   │   ├── GuardrailChecklist.tsx
│           │   │   │   └── SimulatedConvo.tsx
│           │   │   ├── ChecklistBanner.tsx
│           │   │   └── TestRunner.tsx
│           │   └── shared/
│           │       ├── AgentCard.tsx
│           │       ├── StatusBadge.tsx
│           │       ├── PHIAuthModal.tsx
│           │       └── EscalationBanner.tsx
│           │
│           ├── hooks/
│           │   ├── useRealtimeVoice.ts   ← provider-agnostic (talks to backend proxy)
│           │   ├── useAudioVisualiser.ts ← Web Audio API → orb amplitude
│           │   ├── useLanguageDetect.ts
│           │   ├── useChatSession.ts
│           │   ├── useAgentStudio.ts
│           │   └── useLivePrompt.ts
│           │
│           └── store/
│               ├── call.store.ts
│               ├── session.store.ts
│               └── agent.store.ts
│
└── scripts/
    ├── seed-agents.ts
    └── test-guardrails.ts
```

---

## 5. VOICE ARCHITECTURE — OPENAI REALTIME API

### 5.1 How it works
The OpenAI Realtime API uses a persistent WebSocket connection with bidirectional audio:
- Input: raw PCM16 audio at 24kHz, base64-encoded, sent as `input_audio_buffer.append` events
- Output: audio delta events streamed back, decoded and played via Web Audio API
- Transcripts: delivered via `conversation.item.input_audio_transcription.completed` and `response.audio_transcript.delta` events

### 5.2 Backend — Realtime Proxy
The backend acts as a **secure proxy** between the browser and OpenAI. The API key never touches the browser.

```typescript
// realtime-proxy.ts
// Browser WebSocket ↔ Backend ↔ OpenAI Realtime WebSocket

class RealtimeProxy {
  private openaiWs: WebSocket;
  private clientWs: WebSocket;
  private session: VHOSSession;

  async init(agentSpec: AgentSpec, patientContext: PatientContext | null) {
    // 1. Connect to OpenAI Realtime
    this.openaiWs = new WebSocket(
      'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview',
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'realtime=v1',
        }
      }
    );

    // 2. On connect, configure the session
    this.openaiWs.on('open', () => {
      this.send({
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: buildSystemPrompt(agentSpec, patientContext),
          voice: agentSpec.voiceId ?? 'alloy',       // per-agent voice
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: { model: 'whisper-1' },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 800,    // 800ms silence = patient done speaking
          },
          temperature: 0.7,
          max_response_output_tokens: 200, // Keep responses short — voice-first
        }
      });
    });

    // 3. Pipe OpenAI events → client (audio deltas, transcripts, function calls)
    this.openaiWs.on('message', (data) => {
      const event = JSON.parse(data.toString());
      this.handleOpenAIEvent(event);
    });
  }

  handleOpenAIEvent(event: RealtimeEvent) {
    switch (event.type) {
      case 'response.audio.delta':
        // Stream audio chunks to browser
        this.clientWs.send(JSON.stringify({ type: 'audio_chunk', audio: event.delta }));
        break;

      case 'response.audio_transcript.delta':
        // Stream agent transcript to browser (for LiveTranscript below orb)
        this.clientWs.send(JSON.stringify({ type: 'agent_transcript', text: event.delta }));
        break;

      case 'conversation.item.input_audio_transcription.completed':
        // Patient speech transcript — run guardrails, detect language, detect emotion
        const transcript = event.transcript;
        this.processPatientTranscript(transcript);
        break;

      case 'response.done':
        // Agent turn complete — save to DB
        this.saveTurn();
        break;

      case 'error':
        this.handleError(event.error);
        break;
    }
  }

  async processPatientTranscript(transcript: string) {
    // 1. Detect language → notify frontend
    const lang = await detectLanguage(transcript);
    if (lang !== this.session.currentLanguage) {
      this.session.currentLanguage = lang;
      this.clientWs.send(JSON.stringify({ type: 'language_change', language: lang }));
      // Inject language instruction into Realtime session
      this.send({
        type: 'session.update',
        session: {
          instructions: buildSystemPrompt(this.session.agentSpec, this.session.patientContext, {
            language: lang,
            toneProfile: getToneForLanguage(lang),
          })
        }
      });
    }

    // 2. Detect emotion → notify frontend
    const emotion = await detectEmotion(transcript);
    this.clientWs.send(JSON.stringify({ type: 'emotion_detected', emotion }));

    // 3. Check emergency keywords → escalate immediately if hit
    if (hasEmergencyKeywords(transcript)) {
      await this.triggerEmergencyProtocol(transcript);
    }

    // 4. Check first-aid triggers → inject first-aid context if hit
    if (hasFirstAidTriggers(transcript)) {
      await this.injectFirstAid(transcript);
    }

    // 5. Run guardrail pre-check on patient input
    const guardrailResult = await checkGuardrails(transcript, this.session);
    if (!guardrailResult.pass) {
      await this.handleGuardrailViolation(guardrailResult);
    }
  }
}
```

### 5.3 Frontend — useRealtimeVoice Hook
```typescript
// useRealtimeVoice.ts
export function useRealtimeVoice(sessionId: string) {
  const [orbState, setOrbState] = useState<'idle' | 'listening' | 'speaking' | 'thinking'>('idle');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [language, setLanguage] = useState<string>('en');
  const [emotion, setEmotion] = useState<EmotionState>('calm');

  const audioContextRef = useRef<AudioContext>();
  const analyserRef = useRef<AnalyserNode>();      // For orb amplitude
  const wsRef = useRef<WebSocket>();

  const startCall = async () => {
    // 1. Get microphone
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // 2. Connect to backend WebSocket proxy
    wsRef.current = new WebSocket(`wss://api.vhos.io/voice/${sessionId}`);

    // 3. Setup Web Audio API for orb visualisation
    audioContextRef.current = new AudioContext();
    const source = audioContextRef.current.createMediaStreamSource(stream);
    analyserRef.current = audioContextRef.current.createAnalyser();
    source.connect(analyserRef.current);

    // 4. Stream microphone PCM to backend
    const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      const pcm = e.inputBuffer.getChannelData(0);
      const pcm16 = convertFloat32ToPCM16(pcm);
      const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
      wsRef.current?.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: base64,
      }));
    };
    source.connect(processor);
    processor.connect(audioContextRef.current.destination);

    setOrbState('listening');

    // 5. Handle incoming events from backend
    wsRef.current.onmessage = (msg) => {
      const event = JSON.parse(msg.data);
      switch (event.type) {
        case 'audio_chunk':
          playAudioChunk(event.audio);     // Decode PCM16 → play via Web Audio
          setOrbState('speaking');
          break;
        case 'agent_transcript':
          appendTranscript('agent', event.text);
          break;
        case 'patient_transcript':
          appendTranscript('patient', event.text);
          setOrbState('listening');
          break;
        case 'language_change':
          setLanguage(event.language);
          break;
        case 'emotion_detected':
          setEmotion(event.emotion);
          break;
        case 'thinking':
          setOrbState('thinking');
          break;
        case 'escalation':
          handleEscalation(event);
          break;
      }
    };
  };

  const endCall = () => {
    wsRef.current?.send(JSON.stringify({ type: 'session.end' }));
    wsRef.current?.close();
    audioContextRef.current?.close();
    setOrbState('idle');
  };

  return { startCall, endCall, orbState, transcript, language, emotion };
}
```

### 5.4 Orb UI Component
```typescript
// Orb.tsx
// The orb is a full-screen centred animated circle.
// It has 3 visual states:
//   idle      → static, dim, no rings
//   listening → slow pulse, accent rings expanding outward
//   speaking  → amplitude-driven animation (larger = louder agent voice)
//   thinking  → gentle rotating ring, waiting for response

export function Orb({ state, amplitude }: { state: OrbState; amplitude: number }) {
  // amplitude: 0–1 from Web Audio API analyser (agent audio output)
  // Use framer-motion or CSS keyframes for ring animations
  // Core: a gradient sphere (#00D4AA → #818CF8 or per-agent accent colour)
  // Rings: 2-3 concentric SVG circles that pulse outward
  // State-driven CSS classes swap animation presets

  return (
    <div className="orb-container">   {/* Full screen, dark bg */}
      <div className={`orb orb--${state}`} style={{ '--amplitude': amplitude }}>
        <div className="orb__core" />
        <div className="orb__ring orb__ring--1" />
        <div className="orb__ring orb__ring--2" />
        <div className="orb__ring orb__ring--3" />
      </div>
    </div>
  );
}

// useAudioVisualiser.ts
// Reads amplitude from Web Audio API analyser node
// Returns 0–1 normalised amplitude value at ~60fps
export function useAudioVisualiser(analyserRef: RefObject<AnalyserNode>) {
  const [amplitude, setAmplitude] = useState(0);

  useEffect(() => {
    const raf = requestAnimationFrame(function loop() {
      if (!analyserRef.current) return;
      const data = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteTimeDomainData(data);
      const rms = Math.sqrt(data.reduce((s, v) => s + (v - 128) ** 2, 0) / data.length) / 128;
      setAmplitude(rms);
      requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  return amplitude;
}
```

---

## 6. PATIENT PORTAL — FULL UX SPEC

### 6.1 VoiceCall.tsx — Full-Screen Orb Page
```
┌─────────────────────────────────────────────────┐
│                                                 │
│           [Agent name]  •  [Language badge]     │  ← top bar
│                                                 │
│                                                 │
│                   ◉  ◎  ◎                      │  ← Orb (centred)
│                  (pulsing rings)                │
│                                                 │
│         "I understand you're experiencing..."   │  ← Live transcript
│         (last 2 lines, fade out upward)         │     below orb
│                                                 │
│                                                 │
│   [Mute 🎤]        [End Call ✕]                │  ← bottom controls
└─────────────────────────────────────────────────┘
```

**Design rules:**
- Full-screen dark background (`#0A0A0F`)
- Orb: gradient sphere, accent colour from agent's `color` field in spec
- Rings: SVG, animate outward on speech, amplitude-driven on agent speaking
- Transcript: max 2 lines visible, fades upward as new lines come in — not a scrollable log
- Language badge: top right — shows "EN" or "HI" etc, updates seamlessly when language switches
- No heavy chrome — just orb + controls. Patient shouldn't be reading anything during the call.
- Orb states and CSS:
  - `idle`: static, dim gradient, no rings
  - `listening`: slow breathing pulse on core, faint rings
  - `speaking`: rings animate with amplitude, core brightens
  - `thinking`: single rotating dashed ring, core dims slightly

### 6.2 ChatSession.tsx — WhatsApp-Style Chat
```
┌─────────────────────────────────────────────────┐
│  [Agent icon]  Priya — Discharge Follow-up  [🌐EN]│  ← header + lang badge
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────────────┐                       │
│  │ Hello! How can I    │  ← Agent bubble (left) │
│  │ help you today?     │     accent colour bg   │
│  └─────────────────────┘                       │
│                                                 │
│                    ┌───────────────────────┐    │
│                    │ I've been feeling     │    │  ← Patient bubble (right)
│                    │ dizzy since yesterday │    │     white/light bg
│                    └───────────────────────┘    │
│                                                 │
│  ┌────────────────────────────────────────┐    │
│  │  ● ● ●  (typing indicator)             │    │  ← Agent thinking
│  └────────────────────────────────────────┘    │
│                                                 │
│  ┌──────────────────────────────────┐ [Send]   │  ← Input bar
│  │ Type your message...             │           │
│  └──────────────────────────────────┘           │
└─────────────────────────────────────────────────┘
```

**Design rules:**
- Agent bubbles: left-aligned, agent accent colour background, white text
- Patient bubbles: right-aligned, white/light background, dark text
- Typing indicator: three animated dots when agent is generating
- Language badge: updates seamlessly when language detected from patient input
- Emotion is NOT shown to the patient — it's used internally for tone adaptation only
- PHI auth: if an intent requires PHI, a modal appears mid-chat asking for UHID + DOB before continuing

### 6.3 PatientHome.tsx — Landing / Agent Selection
```
┌─────────────────────────────────────────────────┐
│  VHOS Patient Portal                            │
│  [Hospital logo]                                │
├─────────────────────────────────────────────────┤
│                                                 │
│  How would you like to connect?                 │
│                                                 │
│  ┌──────────────┐    ┌──────────────┐           │
│  │    🎤 Voice  │    │   💬 Chat    │           │
│  │    Call      │    │              │           │
│  └──────────────┘    └──────────────┘           │
│                                                 │
│  — or select an agent —                         │
│                                                 │
│  [Discharge Follow-up] [Appointments] [Lab...]  │
│                                                 │
└─────────────────────────────────────────────────┘
```

The patient selects a mode. If the hospital has only one published agent, skip selection and go directly to voice/chat. If multiple agents are published, show the selection.

---

## 7. LANGUAGE DETECTION + ADAPTATION

### Detection
Language is detected from the live transcript using `langdetect` (Node.js) or OpenAI's Whisper transcription (which returns a detected language field automatically when using the Realtime API's `input_audio_transcription`).

For chat mode: detect from each incoming patient message using `franc` (lightweight JS language detection library).

### Adaptation — what changes when language switches
When a language change is detected, **all three** of the following update simultaneously, with no confirmation prompt from the agent:

| What changes | How |
|---|---|
| Response language | System prompt updated: `"Respond only in {language}"` |
| Conversation tone | Vocabulary simplified for Hindi/regional languages; more formal for some languages |
| Vocabulary complexity | Medical jargon reduced; plain language enforced more strictly |

The system prompt is updated mid-session via `session.update` (Realtime API) or a new system message injection (chat mode).

```typescript
// language-detector.ts

const languageProfiles: Record<string, LanguageProfile> = {
  'en': {
    name: 'English',
    code: 'en',
    systemInstruction: 'Respond in English.',
    toneAdjustment: 'standard',
    vocabularyLevel: 'standard',
  },
  'hi': {
    name: 'Hindi',
    code: 'hi',
    systemInstruction: 'Respond in Hindi (Devanagari script). Use simple, conversational Hindi — avoid formal or bureaucratic language. If a medical term has no clear Hindi equivalent, use the English term with a brief Hindi explanation.',
    toneAdjustment: 'warmer',        // Hindi speakers respond better to warmer tone
    vocabularyLevel: 'simplified',
  },
  // Add more as needed: Tamil (ta), Telugu (te), Marathi (mr), Bengali (bn), etc.
};

export async function detectLanguage(text: string): Promise<string> {
  // Use Whisper's language_code from Realtime API events, or franc for chat
  // Return ISO 639-1 code: 'en', 'hi', etc.
}

export function buildLanguageInstruction(langCode: string): string {
  const profile = languageProfiles[langCode] ?? languageProfiles['en'];
  return profile.systemInstruction;
}
```

---

## 8. CONVERSATION ENGINE

### 8.1 System Prompt Assembly
The system prompt is built from the AgentSpec for every new session. It is structured in sections that the LLM can parse and follow.

```typescript
function buildSystemPrompt(
  spec: AgentSpec,
  patientCtx: PatientContext | null,
  opts: { language?: string; emotion?: EmotionState } = {}
): string {
  return `
## IDENTITY
You are ${spec.personaName ?? spec.name}, a healthcare AI assistant for ${spec.domain}.
Category: ${spec.category}
Tone: ${spec.tone}
Response length: ${spec.responseLength}

## YOUR GOAL
${spec.purpose}

## CONVERSATION RULES
- Opening line (say this exactly first): "${spec.openingLine}"
- Closing line (say when goal is achieved): "${spec.closingLine}"
- Fallback (when you don't understand): "${spec.fallbackUtterance}"
- Ambiguity (when intent unclear): "${spec.ambiguityPrompt}"
- Goal stickiness: ${spec.goalStickiness ? 'Stay focused on your purpose. Gently redirect off-topic inputs.' : 'Flexible'}
- Human handoff: ${spec.humanInLoop ? 'Offer to connect to a human agent if confidence is low.' : 'Handle independently'}

## DISCOVERY PROTOCOL
Before making any recommendation or taking any action:
- Ask ${spec.discoveryDepth} questions to understand the patient's situation
- Mirror back what the patient says before responding
- Summarise your understanding before taking any action: "So what I'm understanding is... — is that right?"
- Exception: if you detect an emergency, skip discovery and act immediately

## LANGUAGE
${opts.language ? buildLanguageInstruction(opts.language) : 'Auto-detect the patient\'s language from their speech and respond in the same language. Match their vocabulary complexity.'}

## EMPATHY
- Acknowledge the patient's concern or statement BEFORE giving information or redirecting
- Never shame or judge lifestyle choices or missed doses
- Use the patient's first name throughout the conversation
- Adapt your tone to the patient's emotional state:
  ${opts.emotion ? getEmotionInstruction(opts.emotion) : 'Start warm and adjust as needed'}

## PATIENT CONTEXT
${patientCtx ? formatPatientContext(patientCtx) : 'Patient identity not yet verified. Do not reference any personal medical information until identity is confirmed.'}

## GUARDRAILS (FOLLOW STRICTLY — THESE ARE NON-NEGOTIABLE)
CRITICAL — if any of these are triggered, stop immediately and use the safe fallback:
${spec.guardrails.filter(g => g.severity === 'CRITICAL').map(g => `- ${g.rule}`).join('\n')}

HIGH — flag and escalate:
${spec.guardrails.filter(g => g.severity === 'HIGH').map(g => `- ${g.rule}`).join('\n')}

MEDIUM — adjust response:
${spec.guardrails.filter(g => g.severity === 'MEDIUM').map(g => `- ${g.rule}`).join('\n')}

## FIRST-AID PROTOCOL
If the patient mentions: chest pain, difficulty breathing, severe bleeding, loss of consciousness, seizure, stroke symptoms, severe burns, poisoning, or suicidal ideation:
1. Acknowledge with empathy immediately
2. Give relevant first-aid guidance from your knowledge base
3. Tell them to call emergency services (112 in India) if life-threatening
4. Alert the medical team
Do this BEFORE anything else, in the first response.

## SAFE FALLBACKS
If asked for clinical advice: "${SAFE_FALLBACKS.clinical_advice}"
If asked for PHI without auth: "${SAFE_FALLBACKS.phi_blocked}"
If emergency detected: "${SAFE_FALLBACKS.emergency}"
If confidence low: "${SAFE_FALLBACKS.low_confidence}"

## FORMAT
You are speaking aloud in a real-time voice call (or text chat).
- Keep responses to 1-2 sentences unless clinical detail is required
- No bullet points or numbered lists in voice responses
- No markdown formatting in voice responses
- Ask only ONE question per turn
- Never give a purely refusal response — always offer a guided next step
`.trim();
}
```

### 8.2 Discovery Protocol
```typescript
class DiscoveryEngine {
  maxTurns: number;  // From AgentSpec (0 for Emergency, 2-3 for others)

  // Q1: scripted from AgentSpec.discoveryScript.q1
  // Q2+: GPT-4o-mini generates dynamically from patient response
  // Exception: emotion === 'urgent' | 'in_pain' → end discovery early
  // Exception: emergency keywords detected → skip discovery entirely

  mirrorBack(statement: string): string {
    // "It sounds like [statement]. Let me ask a bit more about that."
  }

  summariseBeforeAction(understanding: string): string {
    // "So what I'm understanding is [understanding] — is that right?"
  }
}
```

### 8.3 Emotion Detection (chat mode — voice uses Realtime tone natively)
```typescript
type EmotionState = 'anxious' | 'confused' | 'in_pain' | 'calm' | 'urgent' | 'distressed';

const emotionInstructions: Record<EmotionState, string> = {
  anxious: 'The patient sounds anxious. Start responses with strong validation. Use phrases like "That\'s completely understandable" and "You\'re doing the right thing by reaching out." Keep sentences short.',
  confused: 'The patient sounds confused. Use very simple language. Offer 2-3 clear options. After explaining, ask "Does that make sense?" before moving forward.',
  in_pain: 'The patient is in pain. Acknowledge it immediately: "I can hear you\'re in pain — let\'s get you help." Triage immediately. Do not delay with questions.',
  calm: 'Standard warm, professional flow.',
  urgent: 'Move immediately to action. No pleasantries. One confirming question maximum, then escalate or assist.',
  distressed: 'Slow down. Say "I\'m here with you." Validate emotions fully before any practical response.',
};
```

### 8.4 First-Aid Knowledge Base
```typescript
// firstaid.ts
// Inject into system prompt when trigger keywords detected

const firstAidGuidance: Record<string, string> = {
  chest_pain: 'If experiencing chest pain: sit or lie down in a comfortable position, loosen tight clothing, do not eat or drink anything, chew an aspirin if available and not allergic, and call 112 immediately if pain is severe or spreading to arm/jaw.',
  breathing_difficulty: 'If having difficulty breathing: sit upright, lean slightly forward, try to stay calm and breathe slowly, use your rescue inhaler if prescribed for asthma, and call 112 if not improving.',
  severe_bleeding: 'If bleeding severely: apply firm direct pressure with a clean cloth, do not remove the cloth if it soaks through — add more on top, elevate the injured area if possible, and call 112.',
  loss_of_consciousness: 'If someone has lost consciousness: check if they are breathing, place them in the recovery position (on their side), do not give anything by mouth, and call 112 immediately.',
  seizure: 'If someone is having a seizure: clear the area of hard objects, do not restrain them, place something soft under their head, time the seizure, and call 112 if it lasts more than 5 minutes.',
  stroke: 'Use FAST: Face drooping? Arm weakness? Speech slurred? Time to call 112 immediately. Do not give anything by mouth.',
  high_fever_child: 'For high fever in a child: remove extra clothing, give age-appropriate fever medication if available, offer fluids, and go to emergency if temperature is above 104°F/40°C or the child is very lethargic.',
  allergic_reaction: 'For severe allergic reaction: use epinephrine auto-injector (EpiPen) if available, call 112 immediately, lay the person flat with legs elevated unless breathing is difficult.',
  suicidal: 'I hear you, and I\'m here with you. You\'re not alone in this. Please reach out to iCall: 9152987821 (India) or go to your nearest emergency room. I\'m also alerting our care team right now.',
};
```

---

## 9. GUARDRAIL RUNTIME

### checkGuardrails() — runs on every patient input AND every agent response
```typescript
interface GuardrailResult {
  pass: boolean;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  action: 'block_immediately' | 'flag_and_escalate' | 'log_and_warn' | 'log_only';
  rule: string;
  reason: string;
  safeResponse?: string;
}

// Global guardrails (always enforced regardless of agent config)
const GLOBAL_GUARDRAILS = [
  // CRITICAL
  { pattern: /diagnos/i, rule: 'No diagnosis', severity: 'CRITICAL', action: 'block_immediately', safe: SAFE_FALLBACKS.clinical_advice },
  { pattern: /stop.*(medication|medicine|drug|dose)/i, rule: 'No medication changes', severity: 'CRITICAL', action: 'block_immediately', safe: SAFE_FALLBACKS.clinical_advice },
  { pattern: /lab.*(result|value|number).*(normal|abnormal|high|low)/i, rule: 'No lab interpretation', severity: 'CRITICAL', action: 'block_immediately', safe: SAFE_FALLBACKS.clinical_advice },
  // Add all guardrails from Section 4 of the workbook
];

const SAFE_FALLBACKS = {
  clinical_advice: "That's a great question for your doctor. I can help you book an appointment to discuss this — would that be helpful?",
  phi_blocked: "To keep your information safe, I need to verify your identity first. Could you please share your UHID and date of birth?",
  emergency: "This sounds urgent. Please call 112 right away. I'm alerting our medical team now. Are you safe at this moment?",
  low_confidence: "I want to make sure you get exactly the right help. Let me connect you with one of our staff members — one moment.",
  clinical_boundary: "I'm not able to advise on that, but your doctor absolutely can. Would you like me to help you schedule an appointment?",
};
```

---

## 10. AGENT STUDIO — STAFF APP

### Layout
Split-pane, fixed:
- **Left 60%:** 8-tab workbook form
- **Right 40%:** Live preview panel (3 views in V1)

### 8 Tabs
*(Identical to v2 prompt — tabs 1-8 matching Excel workbook sheets exactly)*

### Right Panel — Live Preview (3 views in V1, expand in V2)

**View 1: Assembled System Prompt**
Live preview of `buildSystemPrompt(currentDraftSpec, null)` updating on every keystroke. Syntax-highlighted sections. Read-only.

**View 2: Guardrail Checklist**
All guardrails from Tab 4 + global guardrails as a formatted list:
- 🔴 CRITICAL / 🟠 HIGH / 🟡 MEDIUM / 🟢 LOW severity badges
- Green ✓ = rule is configured | Red ✗ = recommended but missing
- Click any guardrail → jumps to its row in Tab 4

**View 3: Simulated Conversation**
Live chat preview powered by `gpt-4o-mini` using the assembled prompt.
- Test persona selector: Default / Anxious patient / Hindi speaker / Non-compliant / Emergency
- "Re-run" button
- Shows exactly how the agent would behave — NOT a mock, uses real API call

### Test Runner (in Tab 8)
Runs all 8 test cases against the live LangGraph chat runtime (NOT Realtime API — cost efficiency).
Shows per test: PASS / FAIL / WARN, actual LLM response, guardrail check result, latency.
"Publish" unlocks only when all CRITICAL test cases pass.

---

## 11. DATABASE SCHEMA (Prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Agent {
  id                String    @id @default(cuid())
  name              String
  category          String
  icon              String    @default("🤖")
  color             String    @default("#00D4AA")
  voiceId           String    @default("alloy")    // OpenAI Realtime voice
  isBuiltIn         Boolean   @default(false)
  version           String    @default("1.0")
  environment       String    @default("Testing")
  specJson          Json
  systemPromptCache String?   // Cached on publish
  guardrailsJson    Json
  publishedAt       DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  sessions          Session[]

  @@map("agents")
}

model Session {
  id                String    @id @default(cuid())
  agentId           String
  agent             Agent     @relation(fields: [agentId], references: [id])
  patientUhidHash   String?
  isVerified        Boolean   @default(false)
  mode              String    // voice | chat | voice_fallback_chat
  status            String    // active | ended | escalated | timeout | error
  language          String    @default("en")
  emotionState      String?
  discoveryPhase    Boolean   @default(true)
  discoveryTurns    Int       @default(0)
  startedAt         DateTime  @default(now())
  endedAt           DateTime?
  durationSecs      Int?
  realtimeSessionId String?   // OpenAI Realtime session ID
  turns             Turn[]
  escalations       Escalation[]
  auditEvents       AuditEvent[]

  @@map("sessions")
}

model Turn {
  id                  String   @id @default(cuid())
  sessionId           String
  session             Session  @relation(fields: [sessionId], references: [id])
  role                String   // user | agent
  content             String
  language            String   @default("en")
  emotionDetected     String?
  isBargeIn           Boolean  @default(false)
  guardrailHit        Boolean  @default(false)
  guardrailDetail     Json?
  firstAidInjected    Boolean  @default(false)
  escalationTriggered Boolean  @default(false)
  realtimeEventId     String?  // OpenAI Realtime event ID for tracing
  llmLatencyMs        Int?
  totalLatencyMs      Int?
  createdAt           DateTime @default(now())

  @@map("turns")
}

model Escalation {
  id          String    @id @default(cuid())
  sessionId   String
  session     Session   @relation(fields: [sessionId], references: [id])
  reason      String
  severity    String
  handledBy   String?
  resolvedAt  DateTime?
  createdAt   DateTime  @default(now())

  @@map("escalations")
}

model AuditEvent {
  id          String   @id @default(cuid())
  sessionId   String
  session     Session  @relation(fields: [sessionId], references: [id])
  eventType   String
  detail      Json     // No raw PHI — hashed/redacted always
  createdAt   DateTime @default(now())

  @@map("audit_events")
}

model ScheduledSession {
  id              String    @id @default(cuid())
  agentId         String
  patientUhidHash String
  triggerType     String    // emr_event | scheduled_day_N | staff_manual
  scheduledFor    DateTime
  status          String    // pending | fired | completed | failed | cancelled
  sessionId       String?
  createdAt       DateTime  @default(now())

  @@map("scheduled_sessions")
}
```

---

## 12. API CONTRACTS

```
# Agents
GET    /api/agents                    → list all
POST   /api/agents                    → create custom agent
GET    /api/agents/:id                → full spec
PUT    /api/agents/:id                → update
POST   /api/agents/:id/validate       → { valid, fieldErrors, tabStatus }
POST   /api/agents/:id/publish        → requires critical tests pass
POST   /api/agents/:id/test           → run test suite
GET    /api/agents/:id/prompt-preview → assembled system prompt

# Sessions (chat mode)
POST   /api/sessions                  → start { agentId, mode }
GET    /api/sessions/:id              → details
POST   /api/sessions/:id/turns        → send text turn
GET    /api/sessions/:id/turns        → history
POST   /api/sessions/:id/end          → end
POST   /api/sessions/:id/auth         → verify identity { uhid, dob }
POST   /api/sessions/:id/escalate     → manual escalation

# Voice (OpenAI Realtime proxy)
POST   /api/voice/session/start       → { sessionId, wsUrl }
WS     /api/voice/session/:id         → bidirectional audio proxy to OpenAI Realtime
SSE    /api/voice/session/:id/events  → transcript, language, emotion, escalation events
POST   /api/voice/session/:id/end     → end + save transcript

# Studio
POST   /api/studio/preview            → assemble prompt from partial spec
POST   /api/studio/simulate           → simulate convo with test persona
```

---

## 13. ENVIRONMENT VARIABLES

```bash
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:5173     # Single app URL

DATABASE_URL=postgresql://vhos:vhos@localhost:5432/vhos
REDIS_URL=redis://localhost:6379

# LLM
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
OPENAI_ROUTING_MODEL=gpt-4o-mini

# ─── VOICE PROVIDER (swap here — no code changes needed) ───────────────────
VOICE_PROVIDER=openai                  # "openai" | "elevenlabs"

# OpenAI Realtime (active when VOICE_PROVIDER=openai)
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview
OPENAI_DEFAULT_VOICE=alloy             # alloy | echo | shimmer | fable | onyx | nova
                                       # Override per-agent in specJson.voiceId

# ElevenLabs Conversational AI (active when VOICE_PROVIDER=elevenlabs)
ELEVENLABS_API_KEY=                    # Add when credits are available
ELEVENLABS_DEFAULT_AGENT_ID=           # ElevenLabs pre-configured agent ID (if used)
ELEVENLABS_DEFAULT_VOICE_ID=           # ElevenLabs voice ID for dynamic mode
# ───────────────────────────────────────────────────────────────────────────

# Auth / PHI
PATIENT_HASH_SECRET=                   # 32+ chars — for UHID hashing
OTP_EXPIRY_SECONDS=120
MAX_AUTH_ATTEMPTS=3

# Twilio (OTP SMS + telephony scaffold)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# FHIR (read-only)
FHIR_BASE_URL=
FHIR_AUTH_TOKEN=

# Audit / SIEM
SIEM_WEBHOOK_URL=
SIEM_WEBHOOK_SECRET=

# Monitoring
PROMETHEUS_PORT=9090
```

---

## 14. BUILD ORDER

```
Phase 1 — Foundation
  1. Monorepo: pnpm workspaces (packages/shared, apps/api, apps/web)
  2. VoiceProvider interface in packages/shared/types/voice-provider.types.ts
  3. Prisma schema + migration + seed (6 built-in agents)
  4. Fastify server + config validation (zod) + health check
  5. Agent CRUD API + spec validation + prompt assembler

Phase 2 — Voice Provider Layer (build this BEFORE any UI)
  6. OpenAIRealtimeProvider (implements VoiceProvider)
  7. ElevenLabsConversationalProvider stub (implements VoiceProvider — logs "not configured" if ELEVENLABS_API_KEY missing)
  8. VoiceProviderFactory (reads VOICE_PROVIDER env)
  9. RealtimeProxy (browser WS ↔ VoiceProvider)
  10. SSE event stream (/api/voice/session/:id/events)
  11. Voice session start/end routes

Phase 3 — Chat Runtime
  12. LangGraph graph + all nodes
  13. Guardrail engine + global rules + safe fallbacks
  14. Language detection
  15. Full chat turn endpoint + session management
  16. PHI auth gate + Redis session scoping + audit logger

Phase 4 — Single React App (apps/web)
  17. App skeleton + Tailwind dark theme + nav (Dashboard | Agents | Studio | Try Agent | Patients)
  18. Agent library page
  19. useRealtimeVoice hook (provider-agnostic — just talks to backend proxy)
  20. useAudioVisualiser hook (Web Audio API amplitude)
  21. Orb.tsx + OrbRing animations (4 states: idle / listening / speaking / thinking)
  22. CallControls.tsx (Start Call / End Call / Mute)
  23. PatientDemo.tsx — "Try Agent" tab:
        - Agent selector dropdown (published agents only)
        - Toggle: Voice / Chat
        - Voice: full-screen orb + last 2 transcript lines + controls
        - Chat: WhatsApp-style bubbles + input
        - Language badge (top right, updates seamlessly)
  24. ChatBubble, ChatInput, TypingIndicator, LanguageBadge components
  25. PHIAuthModal (appears mid-session when PHI intent detected)
  26. EscalationBanner

Phase 5 — Agent Studio
  27. AgentStudio.tsx — split pane (60/40)
  28. All 8 WorkbookTab components + field validation
  29. ChecklistBanner (per-tab + global progress)
  30. Right panel View 1: PromptPreview (live, updates on keystroke)
  31. Right panel View 2: GuardrailChecklist
  32. Right panel View 3: SimulatedConvo (gpt-4o-mini, real API)
  33. TestRunner in Tab 8

Phase 6 — Built-in Agents + Scheduling
  34. All 6 agents defined, typed, seeded
  35. Condition-specific question banks (Chronic agent)
  36. BullMQ scheduler for Discharge + Surgery agents
  37. EMR webhook endpoint

Phase 7 — Hardening
  38. Rate limiting + CORS + API security
  39. Prometheus instrumentation
  40. Docker Compose (api + web + postgres + redis)
  41. Error boundaries in React app
  42. Telephony framework scaffold (Twilio)
```

---

## 15. CURSOR CODING RULES

1. **No PHI in logs** — always `[REDACTED]`. No exceptions.
2. **Guardrails on every turn** — `checkGuardrails()` is not optional.
3. **Discovery before action** — no recommendation until discovery complete, unless `urgent`/`in_pain`/emergency.
4. **First-aid cannot be blocked** — injects before anything else when triggers are detected.
5. **Emergency never gated** — Emergency Triage agent never requires auth.
6. **Language mirrors patient** — system adapts to the patient; never ask them to change language.
7. **Orb state is truth** — orb must accurately reflect actual audio pipeline state at all times.
8. **Voice provider is always accessed through the factory** — `createVoiceProvider()`. Never instantiate `OpenAIRealtimeProvider` or `ElevenLabsConversationalProvider` directly in routes or session logic.
9. **Mid-session updates via `provider.updateSession()`** — language change, auth completion, emotion shift. Never restart the session; always update in place.
10. **Voice responses: 1-2 sentences** — enforce via `maxTokensPerTurn` in VoiceSessionConfig (set to 150–200 tokens).
11. **Patient Demo tab is a tab, not a route** — it lives inside the main nav. No separate React router layout needed.
12. **Orb and chat components are self-contained** — no imports from studio/. They must be extractable to a standalone patient app in V2 with zero changes.
13. **TypeScript strict** — no `any` without `// reason:` comment.

---

## 16. OUT OF SCOPE — V1

- Separate patient-facing deployment (Patient Demo is a tab in the staff app for now)
- ElevenLabs provider full wiring (stub is built, wired when API credits are available — just set `VOICE_PROVIDER=elevenlabs`)
- Separate VAD library (provider handles VAD natively)
- Full Twilio telephony wiring (scaffold only)
- Pinecone long-term memory (Redis session only)
- Grafana dashboard UI (metrics collected, no UI)
- Multi-hospital tenancy
- Native mobile app
- Mental health triage agent (V2)

---

*VHOS · Virtual Hospital Operating System · Cursor Prompt v4 Final*
*Stack: OpenAI GPT-4o + gpt-4o-realtime-preview (swappable → ElevenLabs) · LangGraph · Fastify · Prisma · AWS ECS*
*Single React app: Agent Studio + Patient Demo tab · Orb UI (Web Audio API) · WhatsApp chat*
*HIPAA compliant · Empathy-first · Voice-native · Language-adaptive · Provider-agnostic*
