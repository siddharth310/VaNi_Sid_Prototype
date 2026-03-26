import type { AgentSpec } from '@vhos/shared';
import { create } from 'zustand';
import { createEmptyStudioDraft } from '../studio/draft-defaults.js';
import type { PublishTestResultMap } from '../studio/mandatory-fields.js';

const LS_KEY = 'vhos_agent_studio_draft';
const LS_TAB3 = 'vhos_agent_studio_tab3';

export interface AgentStudioState {
  draft: AgentSpec;
  tab3Visited: boolean;
  activeTab: number;
  testResults: PublishTestResultMap;
  editingAgentId: string | null;
  restoreBanner: boolean;
  pendingLocalDraft: AgentSpec | null;
  setDraft: (patch: Partial<AgentSpec> | ((prev: AgentSpec) => AgentSpec)) => void;
  setTab3Visited: (v: boolean) => void;
  setActiveTab: (n: number) => void;
  setTestResult: (id: string, status: 'PASS' | 'FAIL' | 'WARN' | 'idle') => void;
  setEditingAgentId: (id: string | null) => void;
  setRestoreBanner: (v: boolean) => void;
  setPendingLocalDraft: (d: AgentSpec | null) => void;
  resetStudio: (draft: AgentSpec) => void;
}

export const useAgentStore = create<AgentStudioState>((set) => ({
  draft: createEmptyStudioDraft(),
  tab3Visited: false,
  activeTab: 1,
  testResults: {
    happy: 'idle',
    emergency: 'idle',
    phi: 'idle',
    clinical: 'idle',
    hindi: 'idle',
    adversarial: 'idle',
    ambiguous: 'idle',
    close: 'idle',
  },
  editingAgentId: null,
  restoreBanner: false,
  pendingLocalDraft: null,
  setDraft: (patch) =>
    set((s) => ({
      draft:
        typeof patch === 'function'
          ? patch(s.draft)
          : { ...s.draft, ...patch },
    })),
  setTab3Visited: (v) => set({ tab3Visited: v }),
  setActiveTab: (n) => set({ activeTab: n }),
  setTestResult: (id, status) =>
    set((s) => ({
      testResults: { ...s.testResults, [id]: status },
    })),
  setEditingAgentId: (id) => set({ editingAgentId: id }),
  setRestoreBanner: (v) => set({ restoreBanner: v }),
  setPendingLocalDraft: (d) => set({ pendingLocalDraft: d }),
  resetStudio: (draft) =>
    set({
      draft,
      activeTab: 1,
      testResults: {
        happy: 'idle',
        emergency: 'idle',
        phi: 'idle',
        clinical: 'idle',
        hindi: 'idle',
        adversarial: 'idle',
        ambiguous: 'idle',
        close: 'idle',
      },
    }),
}));

export function loadDraftFromStorage(): {
  draft: AgentSpec | null;
  tab3Visited: boolean;
} {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const t3 = localStorage.getItem(LS_TAB3);
    if (!raw) {
      return { draft: null, tab3Visited: t3 === '1' };
    }
    return {
      draft: JSON.parse(raw) as AgentSpec,
      tab3Visited: t3 === '1',
    };
  } catch {
    return { draft: null, tab3Visited: false };
  }
}

export function persistDraftToStorage(
  draft: AgentSpec,
  tab3Visited: boolean
): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(draft));
    localStorage.setItem(LS_TAB3, tab3Visited ? '1' : '0');
  } catch {
    /* quota */
  }
}

export function clearDraftStorage(): void {
  try {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_TAB3);
  } catch {
    /* ignore */
  }
}
