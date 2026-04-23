import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVoiceAssistant } from '../hooks/useVoiceAssistant.js';
import { getApiBase, getAutoAgentEndpoint } from '../lib/api.js';
import { VoiceButton } from './VoiceButton.js';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type Toast = {
  id: number;
  message: string;
};

// SVG Icons
const ChatIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
  </svg>
);

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>
  </svg>
);

const SendIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
  </svg>
);

const LANGUAGE_OPTIONS = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-IN', label: 'English (IN)' },
  { value: 'hi-IN', label: 'Hindi (IN)' },
] as const;

const REQUEST_TIMEOUT_MS = 20_000;

async function readAgentReply(response: Response): Promise<string> {
  const data = (await response.json()) as {
    final_response?: string;
    response?: string;
    message?: string;
    error?: string;
  };
  return (
    data.final_response ??
    data.response ??
    data.message ??
    data.error ??
    'No response returned from the agent.'
  );
}

export function AutoAgentChat(): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'assistant', content: 'Hi! I am your Auto Agent. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<number | null>(null);
  const base = getApiBase();
  const endpoint = getAutoAgentEndpoint();

  const showToast = (message: string) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    const nextToast = { id: Date.now(), message };
    setToast(nextToast);
    toastTimerRef.current = window.setTimeout(() => {
      setToast((current) => (current?.id === nextToast.id ? null : current));
    }, 4000);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const submitMessage = async (
    rawMessage: string,
    options?: { force?: boolean }
  ): Promise<string> => {
    const userMessage = rawMessage.trim();
    if (!userMessage || (isLoading && !options?.force)) {
      return '';
    }

    setInput('');
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-user`, role: 'user', content: userMessage },
    ]);
    setIsLoading(true);

    console.log("Submitting message to Auto Agent API:", { userMessage, endpoint });

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userMessage,
          model: 'llama3.2',
          max_rounds: 4
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await readAgentReply(response);
        throw new Error(errorText || `Server returned ${response.status}`);
      }

      const finalRes = await readAgentReply(response);

      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-assistant`, role: 'assistant', content: finalRes }
      ]);

      return finalRes;
    } catch (error) {
      const errorMessage =
        error instanceof DOMException && error.name === 'AbortError'
          ? 'The agent took too long to respond. Please try again.'
          : error instanceof Error
            ? error.message
            : 'Error connecting to the Auto Agent API.';

      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-assistant`, role: 'assistant', content: errorMessage }
      ]);
      showToast(errorMessage);
      throw new Error(errorMessage);
    } finally {
      window.clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  const voice = useVoiceAssistant({
    baseUrl: base,
    submitMessage,
    onTranscript: (text) => {
      setInput(text);
      if (!isOpen) {
        setIsOpen(true);
      }
    },
    onError: (message) => {
      showToast(message);
    },
  });

  const handleSend = async () => {
    if (!input.trim() || isLoading) {
      return;
    }

    try {
      await submitMessage(input);
    } catch {
      // Errors are surfaced in chat and toast already.
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            className="mb-3 max-w-[320px] rounded-2xl border border-rose-200 bg-white/95 px-4 py-3 text-sm text-slate-700 shadow-xl backdrop-blur"
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="mb-4 flex flex-col w-[350px] shadow-2xl h-[500px] overflow-hidden rounded-3xl border border-teal-100 bg-white/80 backdrop-blur-xl md:w-[400px]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-teal-100 bg-gradient-to-r from-teal-500 to-emerald-500 px-5 py-4 text-white">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                  🤖
                </div>
                <div>
                  <h3 className="font-semibold leading-tight">Auto Agent</h3>
                  <p className="text-xs text-teal-100">AI Assistant</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-full p-1.5 text-teal-50 transition-colors hover:bg-white/20"
                aria-label="Close chat"
              >
                <CloseIcon />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/50">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${m.role === 'user'
                      ? 'bg-gradient-to-br from-teal-500 to-cyan-600 text-white rounded-br-sm'
                      : 'bg-white border border-slate-100 text-slate-700 rounded-bl-sm'
                      }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-100 text-slate-500 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex gap-1">
                    <motion.div className="w-1.5 h-1.5 bg-slate-400 rounded-full" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0 }} />
                    <motion.div className="w-1.5 h-1.5 bg-slate-400 rounded-full" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }} />
                    <motion.div className="w-1.5 h-1.5 bg-slate-400 rounded-full" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }} />
                  </div>
                </div>
              )}
              {voice.status === 'listening' && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-cyan-100 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="voice-bars" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </span>
                      <div>
                        <p className="font-medium text-slate-700">Listening…</p>
                        <p className="text-xs text-slate-400">
                          {voice.interimTranscript || 'Start speaking naturally.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-slate-100 bg-white p-4">
              <div className="mb-2 flex items-center justify-between px-1 text-xs text-slate-400">
                <span>
                  {voice.status === 'speaking'
                    ? 'Speaking reply'
                    : voice.status === 'processing'
                      ? 'Processing voice request'
                      : voice.status === 'listening'
                        ? 'Listening'
                        : 'Voice ready'}
                </span>
                <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-500">
                  <span>Language</span>
                  <select
                    value={voice.language}
                    onChange={(event) => voice.setLanguage(event.target.value as (typeof LANGUAGE_OPTIONS)[number]['value'])}
                    className="bg-transparent text-xs font-medium text-slate-600 outline-none"
                    disabled={voice.status === 'listening' || voice.status === 'processing'}
                  >
                    {LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex items-center gap-2 rounded-[24px] border border-slate-200 bg-slate-50 p-1.5 pl-4 shadow-inner transition-colors focus-within:border-teal-300 focus-within:bg-white">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading || voice.status === 'processing'}
                  placeholder={voice.status === 'listening' ? 'Listening…' : 'Ask something...'}
                  className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                />
                <VoiceButton
                  status={voice.status}
                  disabled={!voice.isSupported && voice.status !== 'speaking'}
                  onClick={() => {
                    if (!voice.isSupported) {
                      showToast('This browser does not support speech recognition.');
                      return;
                    }
                    voice.toggleListening();
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={isLoading || voice.status === 'processing' || !input.trim()}
                  className="flex h-8 w-8 items-center flex-shrink-0 justify-center rounded-full bg-teal-500 text-white transition-transform disabled:opacity-50 hover:bg-teal-600 active:scale-95"
                  aria-label="Send message"
                >
                  <SendIcon />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-xl shadow-teal-500/30 transition-transform hover:shadow-teal-500/40"
        aria-label="Toggle auto agent chat"
      >
        {isOpen ? <CloseIcon /> : <ChatIcon />}
      </motion.button>
    </div>
  );
}
