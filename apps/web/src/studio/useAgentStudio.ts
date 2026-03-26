import { useCallback, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getApiBase } from '../lib/api.js';
import {
  clearDraftStorage,
  loadDraftFromStorage,
  persistDraftToStorage,
  useAgentStore,
} from '../store/agent.store.js';
import { createEmptyStudioDraft, mergeAgentFromApi } from './draft-defaults.js';

export function useAgentStudio(): {
  agentIdParam: string | undefined;
  loadFromServer: (id: string) => Promise<void>;
} {
  const params = useParams<{ id: string }>();
  const agentIdParam = params.id;
  const {
    draft,
    tab3Visited,
    setTab3Visited,
    resetStudio,
    setEditingAgentId,
    setRestoreBanner,
    setPendingLocalDraft,
  } = useAgentStore();
  const initRef = useRef(false);

  const loadFromServer = useCallback(
    async (id: string) => {
      const base = getApiBase();
      const res = await fetch(`${base}/api/agents/${id}`);
      if (!res.ok) {
        return;
      }
      const row = (await res.json()) as { specJson: unknown };
      const merged = mergeAgentFromApi(row.specJson);
      resetStudio(merged);
      setEditingAgentId(id);
    },
    [resetStudio, setEditingAgentId]
  );

  useEffect(() => {
    if (initRef.current) {
      return;
    }
    initRef.current = true;

    if (agentIdParam) {
      void loadFromServer(agentIdParam);
      return;
    }

    const { draft: stored, tab3Visited: t3 } = loadDraftFromStorage();
    if (stored && Object.keys(stored).length > 0) {
      setPendingLocalDraft(stored);
      setRestoreBanner(true);
      setTab3Visited(t3);
    } else {
      resetStudio(createEmptyStudioDraft());
    }
    setEditingAgentId(null);
  }, [
    agentIdParam,
    loadFromServer,
    resetStudio,
    setEditingAgentId,
    setPendingLocalDraft,
    setRestoreBanner,
    setTab3Visited,
  ]);

  useEffect(() => {
    const t = window.setInterval(() => {
      persistDraftToStorage(draft, tab3Visited);
    }, 30_000);
    return () => window.clearInterval(t);
  }, [draft, tab3Visited]);

  return { agentIdParam, loadFromServer };
}

export function acceptLocalRestore(): void {
  const { draft, tab3Visited } = loadDraftFromStorage();
  const store = useAgentStore.getState();
  if (draft) {
    store.resetStudio(mergeAgentFromApi(draft));
    store.setTab3Visited(tab3Visited);
  }
  store.setRestoreBanner(false);
  store.setPendingLocalDraft(null);
}

export function discardLocalRestore(): void {
  clearDraftStorage();
  const store = useAgentStore.getState();
  store.setRestoreBanner(false);
  store.setPendingLocalDraft(null);
  store.resetStudio(createEmptyStudioDraft());
}
