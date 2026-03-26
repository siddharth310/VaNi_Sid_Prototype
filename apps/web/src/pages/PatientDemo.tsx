import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiBase } from '../lib/api.js';
import { useAudioVisualiser } from '../hooks/useAudioVisualiser.js';
import { useRealtimeVoice } from '../hooks/useRealtimeVoice.js';
import { useDemoStore } from '../store/demo.store.js';
import { Orb } from '../components/orb/Orb.js';
import { CallControls } from '../components/orb/CallControls.js';
import { ChatBubble } from '../components/chat/ChatBubble.js';
import { ChatInput } from '../components/chat/ChatInput.js';
import { LanguageBadge } from '../components/chat/LanguageBadge.js';
import { TypingIndicator } from '../components/chat/TypingIndicator.js';
import { PHIAuthModal } from '../components/shared/PHIAuthModal.js';
import { EscalationBanner } from '../components/shared/EscalationBanner.js';

interface AgentRow {
  id: string;
  name: string;
  color: string;
  publishedAt: string | null;
}

export type PatientDemoProps = {
  /** When set, voice/chat use this agent only (no agent picker). */
  lockedAgentId?: string;
};

export function PatientDemo({
  lockedAgentId,
}: PatientDemoProps = {}): JSX.Element {
  const base = getApiBase();
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [agentId, setAgentId] = useState('');
  const [mode, setMode] = useState<'voice' | 'chat'>('voice');
  const [chatLang, setChatLang] = useState('en');
  const [voiceLive, setVoiceLive] = useState(false);

  const {
    chatSessionId,
    setChatSessionId,
    setVoiceSessionId,
    messages,
    pushMessage,
    resetChat,
    needsPhiAuth,
    setNeedsPhiAuth,
    escalationVisible,
    setEscalationVisible,
    typing,
    setTyping,
} = useDemoStore();

  const voice = useRealtimeVoice();
  const outAmp = useAudioVisualiser(
    voice.orbState === 'speaking' ? voice.playbackAnalyser : voice.micAnalyser
  );

  const accent = useMemo(() => {
    const a = agents.find((x) => x.id === agentId);
    return a?.color ?? '#00D4AA';
  }, [agents, agentId]);

  const publishedAgents = useMemo(
    () => agents.filter((a) => a.publishedAt !== null),
    [agents]
  );
  const selectableAgents = useMemo(
    () => (publishedAgents.length > 0 ? publishedAgents : agents),
    [agents, publishedAgents]
  );

  const lockedAgentName = useMemo(() => {
    if (!lockedAgentId) {
      return null;
    }
    return agents.find((a) => a.id === lockedAgentId)?.name ?? 'Agent';
  }, [agents, lockedAgentId]);

  useEffect(() => {
    void fetch(`${base}/api/agents`)
      .then((r) => r.json() as Promise<AgentRow[]>)
      .then((rows) => {
        setAgents(rows);
        if (!lockedAgentId) {
          const pub = rows.find((x) => x.publishedAt) ?? rows[0];
          if (pub) {
            setAgentId(pub.id);
          }
        }
      })
      .catch(() => {
        /* ignore */
      });
  }, [base, lockedAgentId]);

  useEffect(() => {
    if (!lockedAgentId) {
      return;
    }
    setAgentId(lockedAgentId);
    resetChat();
    setVoiceSessionId(null);
    setVoiceLive(false);
    voice.endCall();
  }, [lockedAgentId, resetChat, setVoiceSessionId, voice.endCall]);

  const ensureChatSession = useCallback(async () => {
    if (chatSessionId) {
      return chatSessionId;
    }
    const res = await fetch(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, mode: 'chat' }),
    });
    if (!res.ok) {
      throw new Error('session');
    }
    const j = (await res.json()) as { id: string };
    setChatSessionId(j.id);
    return j.id;
  }, [agentId, base, chatSessionId, setChatSessionId]);

  const sendChat = useCallback(
    async (text: string) => {
      const sid = await ensureChatSession();
      pushMessage({ role: 'user', text });
      setTyping(true);
      try {
        const res = await fetch(`${base}/api/sessions/${sid}/turns`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text }),
        });
        const data = (await res.json()) as {
          reply: string;
          language?: string;
          needsPhiAuth?: boolean;
          escalated?: boolean;
        };
        if (data.language) {
          setChatLang(data.language);
        }
        pushMessage({ role: 'agent', text: data.reply });
        if (data.needsPhiAuth) {
          setNeedsPhiAuth(true);
        }
        if (data.escalated) {
          setEscalationVisible(true);
        }
      } finally {
        setTyping(false);
      }
    },
    [
      base,
      ensureChatSession,
      pushMessage,
      setEscalationVisible,
      setNeedsPhiAuth,
      setTyping,
    ]
  );

  const onPhiSubmit = useCallback(
    async (uhid: string, dob: string) => {
      const sid = chatSessionId;
      if (!sid) {
        throw new Error('no session');
      }
      const res = await fetch(`${base}/api/sessions/${sid}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uhid, dob }),
      });
      if (!res.ok) {
        throw new Error('auth');
      }
      setNeedsPhiAuth(false);
    },
    [base, chatSessionId, setNeedsPhiAuth]
  );

  const startVoice = async () => {
    resetChat();
    setVoiceSessionId(null);
    setVoiceLive(false);
    const id = await voice.startCall(agentId);
    setVoiceSessionId(id);
    setVoiceLive(Boolean(id));
  };

  const endVoice = () => {
    voice.endCall();
    setVoiceSessionId(null);
    setVoiceLive(false);
  };

  const lines = voice.transcript.slice(-2);

  return (
    <div className="min-h-[calc(100vh-4rem)] text-slate-800">
      <EscalationBanner
        visible={escalationVisible}
        onDismiss={() => setEscalationVisible(false)}
      />
      <PHIAuthModal
        open={needsPhiAuth}
        onClose={() => setNeedsPhiAuth(false)}
        onSubmit={onPhiSubmit}
      />

      <div className="relative flex flex-wrap items-center justify-between gap-4 border-b border-teal-100 bg-white/60 px-4 py-3 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-3">
          {lockedAgentId ? (
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/agents"
                className="text-sm font-medium text-teal-700 hover:text-teal-900 hover:underline"
              >
                ← All agents
              </Link>
              <span className="text-sm text-slate-600">
                <span className="text-slate-500">Agent</span>{' '}
                <span className="font-semibold text-slate-800">
                  {lockedAgentName}
                </span>
              </span>
            </div>
          ) : (
            <>
              {publishedAgents.length === 0 && agents.length > 0 ? (
                <span className="text-xs font-medium text-amber-700">
                  No published agents — showing drafts until you publish.
                </span>
              ) : null}
              <label className="text-sm text-slate-600">
                Agent
                <select
                  className="ml-2 rounded-lg border border-teal-200 bg-white px-2 py-1 text-slate-800 shadow-sm"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                >
                  {selectableAgents.length === 0 ? (
                    <option value="">— no agents —</option>
                  ) : (
                    selectableAgents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                        {a.publishedAt ? '' : ' (draft)'}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </>
          )}
          <div className="flex rounded-lg bg-teal-50 p-0.5 ring-1 ring-teal-100">
            <button
              type="button"
              className={`rounded-md px-3 py-1 text-sm font-medium ${
                mode === 'voice'
                  ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-sm'
                  : 'text-slate-600'
              }`}
              onClick={() => {
                resetChat();
                setMode('voice');
              }}
            >
              Voice
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1 text-sm font-medium ${
                mode === 'chat'
                  ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-sm'
                  : 'text-slate-600'
              }`}
              onClick={() => {
                endVoice();
                setMode('chat');
              }}
            >
              Chat
            </button>
          </div>
        </div>
        <LanguageBadge code={mode === 'voice' ? voice.language : chatLang} />
      </div>

      {voice.error ? (
        <p className="px-4 py-2 text-sm font-medium text-rose-600">{voice.error}</p>
      ) : null}

      {mode === 'voice' ? (
        <div className="flex min-h-[calc(100vh-8rem)] flex-col bg-gradient-to-b from-slate-100 via-teal-50/80 to-cyan-50">
          <div className="flex flex-1 flex-col">
            <Orb
              state={voice.orbState}
              amplitude={outAmp}
              accentColor={accent}
            />
            <div className="pointer-events-none flex min-h-[4.5rem] flex-col items-center justify-end px-6 pb-2">
              {lines.map((line, i) => (
                <p
                  key={`${line.role}-${i}-${line.text.slice(0, 12)}`}
                  className="max-w-xl text-center text-sm text-slate-600 motion-safe:animate-[fadeUp_0.4s_ease-out]"
                  style={{ opacity: 1 - i * 0.35 }}
                >
                  <span className="text-slate-500">
                    {line.role === 'agent' ? 'Agent: ' : 'You: '}
                  </span>
                  {line.text}
                </p>
              ))}
            </div>
          </div>
          <CallControls
            mute={voice.mute}
            active={voiceLive}
            onToggleMute={() => voice.setMute(!voice.mute)}
            onStart={startVoice}
            onEnd={endVoice}
          />
        </div>
      ) : (
        <div className="flex min-h-[calc(100vh-8rem)] flex-col bg-white/40">
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
            {messages.map((m) => (
              <ChatBubble
                key={m.id}
                role={m.role}
                text={m.text}
                accentColor={accent}
              />
            ))}
            {typing ? <TypingIndicator /> : null}
          </div>
          <ChatInput
            disabled={!agentId || typing}
            onSend={(t) => void sendChat(t)}
          />
        </div>
      )}
    </div>
  );
}
