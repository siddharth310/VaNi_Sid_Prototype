import { create } from 'zustand';

export interface ChatLine {
  id: string;
  role: 'user' | 'agent';
  text: string;
}

interface DemoState {
  chatSessionId: string | null;
  voiceSessionId: string | null;
  messages: ChatLine[];
  language: string;
  needsPhiAuth: boolean;
  escalationVisible: boolean;
  typing: boolean;
  setChatSessionId: (id: string | null) => void;
  setVoiceSessionId: (id: string | null) => void;
  pushMessage: (m: Omit<ChatLine, 'id'>) => void;
  setLanguage: (l: string) => void;
  setNeedsPhiAuth: (v: boolean) => void;
  setEscalationVisible: (v: boolean) => void;
  setTyping: (v: boolean) => void;
  resetChat: () => void;
}

export const useDemoStore = create<DemoState>((set) => ({
  chatSessionId: null,
  voiceSessionId: null,
  messages: [],
  language: 'en',
  needsPhiAuth: false,
  escalationVisible: false,
  typing: false,
  setChatSessionId: (id) => set({ chatSessionId: id }),
  setVoiceSessionId: (id) => set({ voiceSessionId: id }),
  pushMessage: (m) =>
    set((s) => ({
      messages: [...s.messages, { ...m, id: crypto.randomUUID() }],
    })),
  setLanguage: (language) => set({ language }),
  setNeedsPhiAuth: (needsPhiAuth) => set({ needsPhiAuth }),
  setEscalationVisible: (escalationVisible) => set({ escalationVisible }),
  setTyping: (typing) => set({ typing }),
  resetChat: () =>
    set({
      messages: [],
      chatSessionId: null,
      needsPhiAuth: false,
      escalationVisible: false,
      typing: false,
    }),
}));
