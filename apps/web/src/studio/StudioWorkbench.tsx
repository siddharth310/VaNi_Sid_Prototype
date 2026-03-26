import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useNavigate } from 'react-router-dom';
import type { AgentSpec } from '@vhos/shared';
import { buildSystemPrompt, VHOS_LOCKED_GUARD_RULES } from '@vhos/shared';
import { ChatBubble } from '../components/chat/ChatBubble.js';
import { ChatInput } from '../components/chat/ChatInput.js';
import { LanguageBadge } from '../components/chat/LanguageBadge.js';
import { TypingIndicator } from '../components/chat/TypingIndicator.js';
import { Orb } from '../components/orb/Orb.js';
import { CallControls } from '../components/orb/CallControls.js';
import { useAudioVisualiser } from '../hooks/useAudioVisualiser.js';
import { useRealtimeVoice } from '../hooks/useRealtimeVoice.js';
import { getApiBase } from '../lib/api.js';
import { useAgentStore, persistDraftToStorage } from '../store/agent.store.js';
import {
  createEmptyStudioDraft,
  normalizeDraftForRuntime,
  tonePresetToString,
} from './draft-defaults.js';
import {
  getMandatoryFieldStatus,
  getTabCompletionStatus,
  isPublishUnlocked,
  isTestUnlocked,
  missingMandatoryLabels,
  type PublishTestResultMap,
} from './mandatory-fields.js';
import {
  acceptLocalRestore,
  discardLocalRestore,
  useAgentStudio,
} from './useAgentStudio.js';

const LANG_CHIPS = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'Hindi' },
  { id: 'ta', label: 'Tamil' },
  { id: 'te', label: 'Telugu' },
  { id: 'mr', label: 'Marathi' },
  { id: 'bn', label: 'Bengali' },
] as const;

const TEST_ROWS: {
  id: keyof PublishTestResultMap;
  label: string;
  critical: boolean;
}[] = [
  { id: 'happy', label: 'Happy path — standard query', critical: false },
  { id: 'emergency', label: 'Emergency escalation', critical: true },
  { id: 'phi', label: 'PHI gate — unverified caller', critical: true },
  { id: 'clinical', label: 'Clinical advice boundary', critical: true },
  { id: 'hindi', label: 'Language switch (Hindi)', critical: false },
  { id: 'adversarial', label: 'Adversarial — prompt injection', critical: true },
  { id: 'ambiguous', label: 'Ambiguous input', critical: false },
  { id: 'close', label: 'Session close', critical: false },
];

function mergeLockedGuardrails(rules: AgentSpec['guardrails']): AgentSpec['guardrails'] {
  const byRule = new Map<string, (typeof rules)[0]>();
  for (const r of VHOS_LOCKED_GUARD_RULES) {
    byRule.set(r.rule, r);
  }
  for (const r of rules) {
    byRule.set(r.rule, r);
  }
  return [...byRule.values()];
}

function toPublishableSpec(d: AgentSpec): AgentSpec {
  const g = d.goal;
  const purpose =
    g?.primary?.trim() ||
    d.purpose.trim() ||
    d.problemStatement?.trim() ||
    'Agent purpose';
  return {
    ...d,
    domain: d.domain?.trim() || 'General care',
    category: d.category?.trim() || 'CONNECT',
    purpose,
    discoveryScript: {
      q1: d.discoveryScript.q1?.trim() || 'How can I help you today?',
      q2: d.discoveryScript.q2,
      q3: d.discoveryScript.q3,
    },
    guardrails: mergeLockedGuardrails(d.guardrails ?? []),
  };
}

export function StudioWorkbench(): JSX.Element {
  const navigate = useNavigate();
  const base = getApiBase();
  useAgentStudio();
  const {
    draft,
    setDraft,
    tab3Visited,
    setTab3Visited,
    activeTab,
    setActiveTab,
    testResults,
    setTestResult,
    editingAgentId,
    restoreBanner,
    setRestoreBanner,
    resetStudio,
  } = useAgentStore();

  const [previewTab, setPreviewTab] = useState<'prompt' | 'guardrails' | 'simulate'>(
    'prompt'
  );
  const [toast, setToast] = useState<string | null>(null);
  const [guardrailDraft, setGuardrailDraft] = useState<{
    always: string[];
    never: string[];
  }>({ always: [''], never: [''] });
  const [convertConfirm, setConvertConfirm] = useState<{
    rules: { rule: string; severity: string }[];
    preview: string[];
  } | null>(null);
  const [personaSim, setPersonaSim] = useState('default');
  const [simMessages, setSimMessages] = useState<{ role: 'user' | 'agent'; text: string }[]>(
    []
  );
  const [simTyping, setSimTyping] = useState(false);
  const [voiceModal, setVoiceModal] = useState(false);
  const [voiceLive, setVoiceLive] = useState(false);
  const [expandedTest, setExpandedTest] = useState<string | null>(null);
  const [testDetails, setTestDetails] = useState<Record<string, unknown>>({});

  const voice = useRealtimeVoice();
  const outAmp = useAudioVisualiser(
    voice.orbState === 'speaking' ? voice.playbackAnalyser : voice.micAnalyser
  );

  useEffect(() => {
    if (activeTab === 3) {
      setTab3Visited(true);
    }
  }, [activeTab, setTab3Visited]);

  const mandatory = useMemo(
    () => getMandatoryFieldStatus(draft, tab3Visited),
    [draft, tab3Visited]
  );
  const tabStat = useMemo(
    () => getTabCompletionStatus(draft, tab3Visited),
    [draft, tab3Visited]
  );
  const completeCount = mandatory.filter((m) => m.complete).length;
  const testOk = isTestUnlocked(draft, tab3Visited);
  const publishOk = isPublishUnlocked(draft, tab3Visited, testResults);

  const normalizedPrompt = useMemo(() => {
    try {
      return buildSystemPrompt(normalizeDraftForRuntime(draft), null, {});
    } catch {
      return '';
    }
  }, [draft]);

  const promptSections = useMemo(() => {
    const p = normalizedPrompt;
    if (!p.trim()) {
      return [];
    }
    return p.split(/\n(?=## )/g).map((chunk) => {
      const title = chunk.match(/^## ([^\n]+)/)?.[1] ?? 'Section';
      let border = 'border-slate-200';
      if (/IDENTITY/i.test(title)) {
        border = 'border-blue-500';
      } else if (/GOAL|PROBLEM/i.test(title)) {
        border = 'border-emerald-500';
      } else if (/DISCOVERY/i.test(title)) {
        border = 'border-amber-400';
      } else if (/GUARDRAIL/i.test(title)) {
        border = 'border-rose-500';
      } else if (/CONVERSATION|FORMAT/i.test(title)) {
        border = 'border-slate-400';
      }
      return { title, body: chunk, border };
    });
  }, [normalizedPrompt]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const runGuardrailConvert = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/studio/guardrails/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          always: guardrailDraft.always.filter((x) => x.trim()),
          never: guardrailDraft.never.filter((x) => x.trim()),
          empathyLevel: draft.empathyLevel ?? 3,
        }),
      });
      if (!res.ok) {
        showToast('Suggestion unavailable — fill manually.');
        return;
      }
      const data = (await res.json()) as {
        rules: { rule: string; severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' }[];
        preview: string[];
      };
      setConvertConfirm(data);
    } catch {
      showToast('Suggestion unavailable — fill manually.');
    }
  }, [base, draft.empathyLevel, guardrailDraft, showToast]);

  const handleSaveDraft = useCallback(async () => {
    const merged = {
      ...draft,
      guardrails: mergeLockedGuardrails(draft.guardrails ?? []),
    };
    setDraft(merged);
    persistDraftToStorage(merged, tab3Visited);
    if (editingAgentId) {
      try {
        await fetch(`${base}/api/agents/${editingAgentId}/draft`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ specJson: merged }),
        });
        showToast('Draft saved');
      } catch {
        showToast('Could not save to server');
      }
    } else {
      showToast('Draft saved locally');
    }
  }, [base, draft, editingAgentId, setDraft, showToast, tab3Visited]);

  const handlePublish = useCallback(async () => {
    const spec = toPublishableSpec(draft);
    try {
      if (editingAgentId) {
        const put = await fetch(`${base}/api/agents/${editingAgentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ specJson: spec }),
        });
        if (!put.ok) {
          showToast('Publish failed validation');
          return;
        }
        const pub = await fetch(`${base}/api/agents/${editingAgentId}/publish`, {
          method: 'POST',
        });
        if (!pub.ok) {
          showToast('Publish failed');
          return;
        }
      } else {
        const res = await fetch(`${base}/api/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ specJson: spec }),
        });
        if (!res.ok) {
          showToast('Publish failed validation');
          return;
        }
        const { id } = (await res.json()) as { id: string };
        await fetch(`${base}/api/agents/${id}/publish`, { method: 'POST' });
        navigate(`/studio/${id}`);
      }
      showToast('Published');
    } catch {
      showToast('Publish failed');
    }
  }, [base, draft, editingAgentId, navigate, showToast]);

  const runStudioTest = async (testId: keyof PublishTestResultMap) => {
    try {
      const res = await fetch(`${base}/api/studio/test/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: normalizeDraftForRuntime(draft),
          testId,
        }),
      });
      if (!res.ok) {
        setTestResult(testId, 'WARN');
        setTestDetails((prev) => ({
          ...prev,
          [testId]: {
            status: 'WARN',
            fixHint: 'Test service temporarily unavailable. Retry once.',
          },
        }));
        return;
      }
      const data = (await res.json()) as {
        status: string;
        agentResponse?: string;
        expected?: string;
        guardrailCheck?: string;
        latencyMs?: number;
        fixHint?: string;
      };
      setTestResult(
        testId,
        data.status === 'PASS' ? 'PASS' : data.status === 'WARN' ? 'WARN' : 'FAIL'
      );
      setTestDetails((prev) => ({
        ...prev,
        [testId]: data,
      }));
    } catch {
      setTestResult(testId, 'WARN');
      setTestDetails((prev) => ({
        ...prev,
        [testId]: {
          status: 'WARN',
          fixHint: 'Network issue while running test. Retry once.',
        },
      }));
    }
  };

  const empathyPhrase = (n: number): string => {
    if (n <= 2) {
      return 'Let me help you with that.';
    }
    if (n === 3) {
      return 'I understand — let me help you with that.';
    }
    return "That sounds really difficult. I'm here with you. Let's take this one step at a time.";
  };

  const toggleLang = (code: string) => {
    const cur = draft.languages ?? ['en'];
    const has = cur.includes(code);
    const next = has ? cur.filter((c) => c !== code) : [...cur, code];
    if (next.length === 0) {
      return;
    }
    setDraft({ languages: next });
  };

  const accent = draft.color ?? '#00D4AA';

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-gradient-to-b from-white via-teal-50/20 to-cyan-50/50">
      {restoreBanner && (
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950">
          <span>Unsaved draft found in this browser.</span>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-amber-500 px-3 py-1 text-white shadow-sm hover:bg-amber-600"
              onClick={() => {
                acceptLocalRestore();
              }}
            >
              Restore
            </button>
            <button
              type="button"
              className="rounded-lg border border-amber-300 bg-white px-3 py-1 text-amber-900 hover:bg-amber-100/80"
              onClick={() => {
                discardLocalRestore();
                resetStudio(createEmptyStudioDraft());
                setRestoreBanner(false);
              }}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      <div className="border-b border-teal-100 px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-4">
          <span className="text-sm text-slate-600">
            {completeCount} of {mandatory.length} mandatory fields complete
          </span>
          <span className="text-xs text-slate-500">
            {editingAgentId ? `Editing ${editingAgentId}` : 'New agent'}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-teal-100/80">
          <div
            className={`h-full transition-all ${
              completeCount === mandatory.length ? 'bg-emerald-500' : 'bg-sky-500'
            }`}
            style={{ width: `${(completeCount / mandatory.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-w-0 flex-[0.65] flex-col border-r border-teal-100">
          <div className="flex flex-wrap gap-1 border-b border-teal-100 px-2 py-2">
            {tabStat.map((t) => {
              const active = activeTab === t.tab;
              const mark = t.hasMandatoryIncomplete ? '●' : '✓';
              const markClass = t.hasMandatoryIncomplete
                ? 'text-rose-600'
                : 'text-emerald-600';
              return (
                <button
                  key={t.tab}
                  type="button"
                  onClick={() => setActiveTab(t.tab)}
                  className={`rounded-md px-2 py-1.5 text-xs font-medium ${
                    active
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-teal-50 hover:text-teal-900'
                  }`}
                >
                  {t.label}{' '}
                  <span className={markClass}>{mark}</span>
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
            {activeTab === 1 && (
              <Tab1
                draft={draft}
                setDraft={setDraft}
                base={base}
                showToast={showToast}
                empathyPhrase={empathyPhrase}
                toggleLang={toggleLang}
              />
            )}
            {activeTab === 2 && (
              <Tab2 draft={draft} setDraft={setDraft} base={base} showToast={showToast} />
            )}
            {activeTab === 3 && (
              <Tab3
                draft={draft}
                setDraft={setDraft}
                guardrailDraft={guardrailDraft}
                setGuardrailDraft={setGuardrailDraft}
                convertConfirm={convertConfirm}
                setConvertConfirm={setConvertConfirm}
                onConvert={runGuardrailConvert}
              />
            )}
            {activeTab === 4 && <Tab4 draft={draft} setDraft={setDraft} />}
            {activeTab === 5 && <Tab5 draft={draft} setDraft={setDraft} />}
            {activeTab === 6 && <Tab6 draft={draft} setDraft={setDraft} />}
            {activeTab === 7 && <Tab7 draft={draft} setDraft={setDraft} />}
            {activeTab === 8 && (
              <Tab8
                testOk={testOk}
                mandatory={mandatory}
                testResults={testResults}
                runTest={runStudioTest}
                runAll={() => {
                  void Promise.all(TEST_ROWS.map((r) => runStudioTest(r.id)));
                }}
                personaSim={personaSim}
                setPersonaSim={setPersonaSim}
                onSimulateChat={() => setPreviewTab('simulate')}
                onVoice={() => setVoiceModal(true)}
                expandedTest={expandedTest}
                setExpandedTest={setExpandedTest}
                testDetails={testDetails}
              />
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-[0.35] flex-col border-l border-teal-100 bg-cyan-50/70">
          <div className="flex border-b border-teal-100">
            {(['prompt', 'guardrails', 'simulate'] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={`flex-1 px-2 py-2 text-xs font-medium capitalize ${
                  previewTab === k
                    ? 'bg-white text-teal-900 shadow-sm'
                    : 'text-slate-500 hover:bg-teal-50/60'
                }`}
                onClick={() => setPreviewTab(k)}
              >
                {k === 'prompt' ? 'Prompt' : k === 'guardrails' ? 'Guardrails' : 'Simulate'}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {previewTab === 'prompt' && (
              <div className="space-y-2">
                {!draft.name?.trim() && (
                  <p className="text-xs text-slate-500">
                    Prompt will appear as you fill the form.
                  </p>
                )}
                {promptSections.map((s) => (
                  <div
                    key={s.title}
                    className={`border-l-4 ${s.border} bg-slate-50/60 pl-2 text-xs`}
                  >
                    <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-700">
                      {s.body}
                    </pre>
                  </div>
                ))}
              </div>
            )}
            {previewTab === 'guardrails' && (
              <ul className="space-y-2 text-xs">
                {mergeLockedGuardrails(draft.guardrails ?? []).map((g) => (
                  <li
                    key={g.rule}
                    className={
                      g.severity === 'CRITICAL' ? 'text-rose-600 font-medium' : 'text-slate-600'
                    }
                  >
                    {VHOS_LOCKED_GUARD_RULES.some((l) => l.rule === g.rule) ? '🔒 ' : '✏️ '}
                    {g.rule}
                  </li>
                ))}
              </ul>
            )}
            {previewTab === 'simulate' && (
              <SimulatePanel
                draft={draft}
                simMessages={simMessages}
                setSimMessages={setSimMessages}
                simTyping={simTyping}
                setSimTyping={setSimTyping}
                personaSim={personaSim}
                accent={accent}
                base={base}
              />
            )}
          </div>
        </div>
      </div>

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-teal-100 bg-white/95 backdrop-blur-sm px-4 py-3">
        <button
          type="button"
          className="rounded-lg border border-teal-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-teal-50/50"
          onClick={() => void handleSaveDraft()}
        >
          Save Draft
        </button>
        <span
          title={
            testOk
              ? ''
              : `Missing: ${missingMandatoryLabels(draft, tab3Visited).join(', ')}`
          }
        >
          <button
            type="button"
            disabled={!testOk}
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-sky-600"
            onClick={() => setActiveTab(8)}
          >
            Test Agent
          </button>
        </span>
        <button
          type="button"
          disabled={!publishOk}
          className="rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40 hover:from-emerald-600 hover:to-teal-600"
          onClick={() => void handlePublish()}
        >
          Publish
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-20 right-4 z-50 rounded-lg border border-teal-100 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-lg">
          {toast}
        </div>
      )}

      {voiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm">
          <div className="flex w-full max-w-lg flex-col items-center rounded-2xl border border-teal-100 bg-white p-6 shadow-xl">
            <div className="text-sm font-medium text-slate-700">Draft voice test</div>
            <div className="mt-4">
              <Orb amplitude={outAmp} accentColor={accent} state={voice.orbState} />
            </div>
            <CallControls
              mute={voice.mute}
              active={voiceLive}
              onToggleMute={() => voice.setMute(!voice.mute)}
              onStart={() => {
                void voice
                  .startDraftCall(normalizeDraftForRuntime(draft))
                  .then(() => setVoiceLive(true));
              }}
              onEnd={() => {
                voice.endCall();
                setVoiceLive(false);
                setVoiceModal(false);
              }}
            />
            {voice.error && (
              <p className="mt-2 text-xs font-medium text-rose-600">{voice.error}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Tab1(props: {
  draft: AgentSpec;
  setDraft: (p: Partial<AgentSpec>) => void;
  base: string;
  showToast: (s: string) => void;
  empathyPhrase: (n: number) => string;
  toggleLang: (c: string) => void;
}): JSX.Element {
  const { draft, setDraft, base, showToast, empathyPhrase, toggleLang } = props;
  const [psCard, setPsCard] = useState<{ text: string; basis: string } | null>(null);
  const wc = draft.problemStatement?.trim()
    ? draft.problemStatement.trim().split(/\s+/).filter(Boolean).length
    : 0;

  const suggestProblem = async () => {
    try {
      const res = await fetch(`${base}/api/studio/suggest/problem-statement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaName: draft.personaName,
          domain: draft.domain,
          category: draft.category,
        }),
      });
      if (!res.ok) {
        showToast('Suggestion unavailable — fill manually.');
        return;
      }
      const data = (await res.json()) as { suggestion: string; rationale: string };
      setPsCard({ text: data.suggestion, basis: 'domain and category entered' });
    } catch {
      showToast('Suggestion unavailable — fill manually.');
    }
  };

  const suggestGoal = async () => {
    try {
      const res = await fetch(`${base}/api/studio/suggest/goal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemStatement: draft.problemStatement ?? '' }),
      });
      if (!res.ok) {
        showToast('Suggestion unavailable — fill manually.');
        return;
      }
      const data = (await res.json()) as {
        primary: string;
        successCondition: string;
        escalationTrigger: string;
      };
      setDraft({
        goal: {
          primary: data.primary,
          successCondition: data.successCondition,
          escalationTrigger: data.escalationTrigger,
        },
      });
    } catch {
      showToast('Suggestion unavailable — fill manually.');
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 font-semibold text-slate-700">Identity</h3>
        <label className="block text-xs text-slate-600">Agent Name *</label>
        <input
          className="mt-1 w-full rounded border border-teal-100 bg-white px-3 py-2"
          value={draft.name}
          onChange={(e) => setDraft({ name: e.target.value })}
          placeholder="e.g. Discharge Follow-up Agent, Medication Reminder"
        />
        <label className="mt-3 block text-xs text-slate-600">Persona Name</label>
        <input
          className="mt-1 w-full rounded border border-teal-100 bg-white px-3 py-2"
          value={draft.personaName ?? ''}
          onChange={(e) => setDraft({ personaName: e.target.value })}
          placeholder="e.g. Priya, Aarav, NOVA — what the agent calls itself"
        />
        <p className="mt-1 text-xs text-slate-500">Leave blank to use the agent name</p>
        <label className="mt-3 block text-xs text-slate-600">Category</label>
        <select
          className="mt-1 w-full rounded border border-teal-100 bg-white px-3 py-2"
          value={draft.category}
          onChange={(e) => setDraft({ category: e.target.value })}
        >
          {(['CONNECT', 'CARE', 'ASSIST', 'EMERGENCY'] as const).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="mt-3 block text-xs text-slate-600">Domain / Specialty</label>
        <input
          className="mt-1 w-full rounded border border-teal-100 bg-white px-3 py-2"
          value={draft.domain}
          onChange={(e) => setDraft({ domain: e.target.value })}
          placeholder="e.g. Post-acute care, Chronic disease, Appointments"
        />
      </section>

      <section>
        <h3 className="mb-1 font-semibold text-slate-700">Problem Statement *</h3>
        <p className="mb-2 text-xs text-slate-500">What problem is this agent solving?</p>
        <textarea
          className="w-full rounded border border-teal-100 bg-white px-3 py-2"
          rows={5}
          value={draft.problemStatement ?? ''}
          onChange={(e) => setDraft({ problemStatement: e.target.value })}
          placeholder="Describe the patient situation and what this agent helps with..."
        />
        <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
          <span>{wc} words (min 20)</span>
          <button
            type="button"
            className="text-sky-600 hover:underline"
            onClick={() => void suggestProblem()}
          >
            ✨ Suggest
          </button>
        </div>
        {psCard && (
          <div className="mt-3 rounded-lg border border-teal-100 bg-white border border-teal-50 p-3">
            <textarea
              className="w-full bg-transparent text-sm text-slate-700"
              value={psCard.text}
              onChange={(e) => setPsCard({ ...psCard, text: e.target.value })}
              rows={4}
            />
            <p className="mt-2 text-xs text-slate-500">Based on: {psCard.basis}</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="rounded bg-sky-600 px-2 py-1 text-xs text-white"
                onClick={() => {
                  setDraft({ problemStatement: psCard.text });
                }}
              >
                Use this
              </button>
              <button
                type="button"
                className="rounded border border-slate-200 px-2 py-1 text-xs"
                onClick={() => void suggestProblem()}
              >
                Regenerate
              </button>
              <button
                type="button"
                className="text-xs text-slate-500"
                onClick={() => setPsCard(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-semibold text-slate-700">Goal</h3>
        <div className="space-y-4 border-l-2 border-teal-100 pl-4">
          <div>
            <div className="text-xs font-medium text-sky-600">① Primary Goal *</div>
            <textarea
              className="mt-1 w-full rounded border border-teal-100 bg-white px-3 py-2 text-sm"
              rows={2}
              value={draft.goal?.primary ?? ''}
              onChange={(e) =>
                setDraft({
                  goal: {
                    primary: e.target.value,
                    successCondition: draft.goal?.successCondition ?? '',
                    escalationTrigger: draft.goal?.escalationTrigger ?? '',
                  },
                })
              }
              placeholder="What should this agent accomplish?"
            />
            <button
              type="button"
              className="mt-1 text-xs text-sky-600"
              onClick={() => void suggestGoal()}
            >
              ✨ Suggest from problem statement
            </button>
          </div>
          <div>
            <div className="text-xs font-medium text-sky-600">② Success Condition *</div>
            <textarea
              className="mt-1 w-full rounded border border-teal-100 bg-white px-3 py-2 text-sm"
              rows={2}
              value={draft.goal?.successCondition ?? ''}
              onChange={(e) =>
                setDraft({
                  goal: {
                    primary: draft.goal?.primary ?? '',
                    successCondition: e.target.value,
                    escalationTrigger: draft.goal?.escalationTrigger ?? '',
                  },
                })
              }
            />
          </div>
          <div>
            <div className="text-xs font-medium text-sky-600">③ Escalation Trigger *</div>
            <textarea
              className="mt-1 w-full rounded border border-teal-100 bg-white px-3 py-2 text-sm"
              rows={2}
              value={draft.goal?.escalationTrigger ?? ''}
              onChange={(e) =>
                setDraft({
                  goal: {
                    primary: draft.goal?.primary ?? '',
                    successCondition: draft.goal?.successCondition ?? '',
                    escalationTrigger: e.target.value,
                  },
                })
              }
            />
            <button type="button" className="mt-1 text-xs text-sky-600" onClick={() => void suggestGoal()}>
              ✨ Suggest
            </button>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-semibold text-slate-700">Persona &amp; Tone</h3>
        <p className="mb-2 text-xs text-slate-500">Tone *</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ['warm', 'Warm & caring'],
              ['professional', 'Professional'],
              ['clinical', 'Clinical & precise'],
              ['directive', 'Directive & urgent'],
            ] as const
          ).map(([id, label]) => (
            <label
              key={id}
              className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm ${
                draft.tonePreset === id ? 'border-sky-500 bg-teal-50' : 'border-teal-100'
              }`}
            >
              <input
                type="radio"
                name="tone"
                checked={draft.tonePreset === id}
                onChange={() =>
                  setDraft({
                    tonePreset: id,
                    tone: tonePresetToString(id),
                  })
                }
              />
              {label}
            </label>
          ))}
        </div>
        <label className="mt-4 block text-xs text-slate-600">
          Empathy level ({draft.empathyLevel ?? 3})
        </label>
        <input
          type="range"
          min={1}
          max={5}
          value={draft.empathyLevel ?? 3}
          onChange={(e) => setDraft({ empathyLevel: Number(e.target.value) })}
          className="w-full"
        />
        <p className="mt-2 text-xs italic text-slate-600">{empathyPhrase(draft.empathyLevel ?? 3)}</p>
        <p className="mt-4 text-xs text-slate-500">Languages *</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {LANG_CHIPS.map((l) => {
            const on = (draft.languages ?? ['en']).includes(l.id);
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => toggleLang(l.id)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  on ? 'border-emerald-500 bg-emerald-100' : 'border-slate-200'
                }`}
              >
                {l.label} {on ? '✓' : ''}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Agent auto-detects and switches language seamlessly. No patient action needed.
        </p>
      </section>
    </div>
  );
}

function Tab2(props: {
  draft: AgentSpec;
  setDraft: (p: Partial<AgentSpec>) => void;
  base: string;
  showToast: (s: string) => void;
}): JSX.Element {
  const { draft, setDraft, base, showToast } = props;
  const ol = draft.openingLine.length;

  const suggestOpening = async () => {
    try {
      const res = await fetch(`${base}/api/studio/suggest/opening-line`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: draft.goal?.primary,
          problemStatement: draft.problemStatement,
        }),
      });
      if (!res.ok) {
        showToast('Suggestion unavailable — fill manually.');
        return;
      }
      const data = (await res.json()) as { openingLine: string };
      setDraft({ openingLine: data.openingLine.slice(0, 150) });
    } catch {
      showToast('Suggestion unavailable — fill manually.');
    }
  };

  const suggestDiscovery = async () => {
    try {
      const res = await fetch(`${base}/api/studio/suggest/discovery-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemStatement: draft.problemStatement ?? '',
          goal: draft.goal?.primary ?? '',
        }),
      });
      if (!res.ok) {
        showToast('Suggestion unavailable — fill manually.');
        return;
      }
      const data = (await res.json()) as { question: string };
      setDraft({
        discoveryScript: {
          ...draft.discoveryScript,
          q1: data.question,
        },
      });
    } catch {
      showToast('Suggestion unavailable — fill manually.');
    }
  };

  const bt = draft.behaviourToggles ?? {
    mirrorLanguage: true,
    acknowledgeFirst: true,
    stayOnTopic: true,
    offerHumanIfUnsure: true,
    summariseBeforeAction: true,
    patientLed: false,
  };

  const setBt = (patch: Partial<typeof bt>) =>
    setDraft({ behaviourToggles: { ...bt, ...patch } });

  return (
    <div className="space-y-6">
      <div>
        <label className="text-xs text-slate-600">Opening Line *</label>
        <input
          className="mt-1 w-full rounded border border-teal-100 bg-white px-3 py-2"
          value={draft.openingLine}
          maxLength={150}
          onChange={(e) => setDraft({ openingLine: e.target.value })}
        />
        <div className="mt-1 flex justify-between text-xs text-slate-500">
          <span>{ol} / 150</span>
          <button type="button" className="text-sky-600" onClick={() => void suggestOpening()}>
            ✨ Suggest from goal
          </button>
        </div>
      </div>
      <div>
        <label className="text-xs text-slate-600">Closing Line *</label>
        <input
          className="mt-1 w-full rounded border border-teal-100 bg-white px-3 py-2"
          value={draft.closingLine}
          onChange={(e) => setDraft({ closingLine: e.target.value })}
        />
      </div>
      <div>
        <label className="text-xs text-slate-600">Fallback Utterance</label>
        <input
          className="mt-1 w-full rounded border border-teal-100 bg-white px-3 py-2"
          value={draft.fallbackUtterance}
          onChange={(e) => setDraft({ fallbackUtterance: e.target.value })}
        />
      </div>
      <div>
        <label className="text-xs text-slate-600">Ambiguity Prompt</label>
        <input
          className="mt-1 w-full rounded border border-teal-100 bg-white px-3 py-2"
          value={draft.ambiguityPrompt}
          onChange={(e) => setDraft({ ambiguityPrompt: e.target.value })}
        />
      </div>
      <div>
        <h4 className="font-medium text-slate-700">Discovery Questions</h4>
        <p className="mt-1 text-xs text-slate-500">
          Before suggesting anything or taking action, the agent asks questions first.
        </p>
        <input
          className="mt-2 w-full rounded border border-teal-100 bg-white px-3 py-2"
          placeholder="Opening discovery question"
          value={draft.discoveryScript.q1}
          onChange={(e) =>
            setDraft({
              discoveryScript: { ...draft.discoveryScript, q1: e.target.value },
            })
          }
        />
        <button
          type="button"
          className="mt-2 text-xs text-sky-600"
          onClick={() => void suggestDiscovery()}
        >
          ✨ Suggest from problem statement
        </button>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="text-xs text-sky-300"
            onClick={() =>
              setDraft({
                discoveryScript: { ...draft.discoveryScript, q2: ' ' },
              })
            }
          >
            + Add Q2
          </button>
          <button
            type="button"
            className="text-xs text-sky-300"
            onClick={() =>
              setDraft({
                discoveryScript: { ...draft.discoveryScript, q3: ' ' },
              })
            }
          >
            + Add Q3
          </button>
        </div>
        {draft.discoveryScript.q2 !== undefined && (
          <input
            className="mt-2 w-full rounded border border-teal-100 bg-white px-3 py-2"
            value={draft.discoveryScript.q2?.trim() ? draft.discoveryScript.q2 : ''}
            onChange={(e) =>
              setDraft({
                discoveryScript: { ...draft.discoveryScript, q2: e.target.value },
              })
            }
          />
        )}
        {draft.discoveryScript.q3 !== undefined && (
          <input
            className="mt-2 w-full rounded border border-teal-100 bg-white px-3 py-2"
            value={draft.discoveryScript.q3?.trim() ? draft.discoveryScript.q3 : ''}
            onChange={(e) =>
              setDraft({
                discoveryScript: { ...draft.discoveryScript, q3: e.target.value },
              })
            }
          />
        )}
      </div>
      <div className="space-y-2">
        {(
          [
            ['mirrorLanguage', 'Mirror patient language automatically'],
            ['acknowledgeFirst', 'Acknowledge what the patient said before responding'],
            ['stayOnTopic', 'Stay on topic — gently redirect off-topic inputs'],
            ['offerHumanIfUnsure', 'Offer to connect to a human if the agent is unsure'],
            ['summariseBeforeAction', 'Summarise understanding before taking action'],
            ['patientLed', 'Allow patient to lead the conversation freely'],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={bt[k]}
              onChange={(e) => setBt({ [k]: e.target.checked } as Partial<typeof bt>)}
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}

function Tab3(props: {
  draft: AgentSpec;
  setDraft: (p: Partial<AgentSpec>) => void;
  guardrailDraft: { always: string[]; never: string[] };
  setGuardrailDraft: (v: { always: string[]; never: string[] }) => void;
  convertConfirm: { rules: { rule: string; severity: string }[]; preview: string[] } | null;
  setConvertConfirm: (v: { rules: { rule: string; severity: string }[]; preview: string[] } | null) => void;
  onConvert: () => Promise<void>;
}): JSX.Element {
  const { draft, setDraft, guardrailDraft, setGuardrailDraft, convertConfirm, setConvertConfirm, onConvert } =
    props;
  const base = getApiBase();
  const [toast, setToast] = useState<string | null>(null);

  const suggestGr = async () => {
    try {
      const res = await fetch(`${base}/api/studio/suggest/guardrails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemStatement: draft.problemStatement ?? '',
          goal: draft.goal?.primary ?? '',
          domain: draft.domain,
        }),
      });
      if (!res.ok) {
        setToast('Suggestion unavailable — fill manually.');
        return;
      }
      const data = (await res.json()) as { always: string[]; never: string[] };
      setGuardrailDraft({
        always: data.always.length ? data.always : [''],
        never: data.never.length ? data.never : [''],
      });
    } catch {
      setToast('Suggestion unavailable — fill manually.');
    }
  };

  return (
    <div className="space-y-4 text-sm">
      {toast && <p className="text-rose-400">{toast}</p>}
      <p className="text-slate-600">
        These are the boundaries and values that shape how this agent behaves. The critical rules
        below are required for all VHOS agents and cannot be removed.
      </p>
      <div>
        <h4 className="font-medium text-rose-700">Always-ON Critical Rules</h4>
        <ul className="mt-2 space-y-1 text-xs">
          {VHOS_LOCKED_GUARD_RULES.map((r) => (
            <li key={r.rule} className="flex items-start gap-2">
              <span>🔴</span>
              <span>{r.rule}</span>
              <span>🔒</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          These 5 rules are always active. Add your own rules below.
        </p>
      </div>
      <div>
        <h4 className="font-medium">What this agent will ALWAYS do</h4>
        {guardrailDraft.always.map((line, i) => (
          <div key={i} className="mt-2 flex gap-2">
            <input
              className="flex-1 rounded border border-teal-100 bg-white px-2 py-1"
              value={line}
              onChange={(e) => {
                const next = [...guardrailDraft.always];
                next[i] = e.target.value;
                setGuardrailDraft({ ...guardrailDraft, always: next });
              }}
            />
            <button
              type="button"
              className="text-rose-400"
              onClick={() =>
                setGuardrailDraft({
                  ...guardrailDraft,
                  always: guardrailDraft.always.filter((_, j) => j !== i),
                })
              }
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="mt-2 text-xs text-sky-600"
          onClick={() =>
            setGuardrailDraft({ ...guardrailDraft, always: [...guardrailDraft.always, ''] })
          }
        >
          + Add another
        </button>
        <button type="button" className="ml-3 mt-2 text-xs text-sky-600" onClick={() => void suggestGr()}>
          ✨ Suggest rules
        </button>
      </div>
      <div>
        <h4 className="font-medium">What this agent will NEVER do</h4>
        {guardrailDraft.never.map((line, i) => (
          <div key={i} className="mt-2 flex gap-2">
            <input
              className="flex-1 rounded border border-teal-100 bg-white px-2 py-1"
              value={line}
              onChange={(e) => {
                const next = [...guardrailDraft.never];
                next[i] = e.target.value;
                setGuardrailDraft({ ...guardrailDraft, never: next });
              }}
            />
            <button
              type="button"
              className="text-rose-400"
              onClick={() =>
                setGuardrailDraft({
                  ...guardrailDraft,
                  never: guardrailDraft.never.filter((_, j) => j !== i),
                })
              }
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="mt-2 text-xs text-sky-600"
          onClick={() =>
            setGuardrailDraft({ ...guardrailDraft, never: [...guardrailDraft.never, ''] })
          }
        >
          + Add another
        </button>
      </div>
      <button
        type="button"
        className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-900 shadow-sm hover:bg-sky-100"
        onClick={() => void onConvert()}
      >
        Convert &amp; preview rules
      </button>
      {convertConfirm && (
        <div className="rounded border border-slate-200 p-3">
          <p className="text-xs font-medium">Rules saved — here&apos;s what will be enforced:</p>
          <ul className="mt-2 space-y-1 text-xs">
            {convertConfirm.preview.map((p) => (
              <li key={p}>🟡 {p}</li>
            ))}
            {VHOS_LOCKED_GUARD_RULES.map((r) => (
              <li key={r.rule} className="text-rose-700">
                🔴 [Locked] {r.rule}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="text-xs text-sky-600"
              onClick={() => {
                setDraft({
                  guardrails: mergeLockedGuardrails(
                    convertConfirm.rules.map((r) => ({
                      rule: r.rule,
                      severity: r.severity as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
                    }))
                  ),
                });
                setConvertConfirm(null);
              }}
            >
              Confirm
            </button>
            <button type="button" className="text-xs" onClick={() => setConvertConfirm(null)}>
              Edit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Tab4(props: { draft: AgentSpec; setDraft: (p: Partial<AgentSpec>) => void }): JSX.Element {
  const { draft, setDraft } = props;
  const c = draft.contextAccess ?? {
    patientName: true,
    uhid: true,
    activeConditions: true,
    medications: true,
    allergies: true,
    treatingDoctor: true,
    dischargeDate: false,
    appointments: false,
    labFlags: false,
    insurance: false,
  };
  const setC = (patch: Partial<typeof c>) => setDraft({ contextAccess: { ...c, ...patch } });
  const t = draft.triggerModes ?? {
    inbound: true,
    outbound: true,
    emr: false,
    scheduled: false,
  };
  const setT = (patch: Partial<typeof t>) => setDraft({ triggerModes: { ...t, ...patch } });
  return (
    <div className="space-y-4 text-sm">
      <h4 className="font-medium">Patient information this agent can access</h4>
      <p className="text-xs text-slate-500">(Only after identity is verified)</p>
      {(
        [
          ['patientName', 'Patient name'],
          ['uhid', 'UHID'],
          ['activeConditions', 'Active conditions'],
          ['medications', 'Current medications + dosage'],
          ['allergies', 'Allergies'],
          ['treatingDoctor', "Treating doctor's name"],
          ['dischargeDate', 'Last discharge / surgery date'],
          ['appointments', 'Upcoming appointments'],
          ['labFlags', 'Recent lab result flags'],
          ['insurance', 'Insurance details'],
        ] as const
      ).map(([k, label]) => (
        <label key={k} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={c[k]}
            onChange={(e) => setC({ [k]: e.target.checked } as Partial<typeof c>)}
          />
          {label}
        </label>
      ))}
      <p className="text-xs text-slate-500">Turn on only what this agent genuinely needs.</p>
      <h4 className="mt-4 font-medium">When is this agent triggered?</h4>
      {(
        [
          ['inbound', 'Patient starts the conversation (inbound)'],
          ['outbound', 'Hospital or staff initiates (outbound)'],
          ['emr', 'Automatic — triggered by an EMR event'],
          ['scheduled', 'Scheduled — runs on a set day/time'],
        ] as const
      ).map(([k, label]) => (
        <label key={k} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={t[k]}
            onChange={(e) => setT({ [k]: e.target.checked } as Partial<typeof t>)}
          />
          {label}
        </label>
      ))}
      <div className="rounded border border-teal-100 p-3 text-xs text-slate-600">
        Compliance (locked): ✓ HIPAA · ✓ PHI Protected · ✓ Audit Logging
      </div>
    </div>
  );
}

function Tab5(props: { draft: AgentSpec; setDraft: (p: Partial<AgentSpec>) => void }): JSX.Element {
  const { draft, setDraft } = props;
  const a = draft.auth ?? {
    verifyUhidDob: true,
    otpSms: false,
    otpWhatsApp: false,
    onFail: 'human' as const,
    requireForAppointments: true,
    requireForMedications: true,
    requireForLabs: true,
    requireForInsurance: true,
    requireForNotes: true,
    requireForVitals: false,
  };
  const setA = (patch: Partial<typeof a>) => setDraft({ auth: { ...a, ...patch } });
  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-600">
        Before sharing personal medical information, this agent confirms who it&apos;s speaking
        with.
      </p>
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={a.verifyUhidDob}
          onChange={(e) => setA({ verifyUhidDob: e.target.checked })}
        />
        UHID + Date of Birth
      </label>
      <label className="flex gap-2">
        <input type="checkbox" checked={a.otpSms} onChange={(e) => setA({ otpSms: e.target.checked })} />
        OTP via SMS
      </label>
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={a.otpWhatsApp}
          onChange={(e) => setA({ otpWhatsApp: e.target.checked })}
        />
        OTP via WhatsApp
      </label>
      <div className="mt-4">
        <p className="text-xs text-slate-500">If verification fails after 3 attempts</p>
        {(
          [
            ['human', 'Connect to a human agent (recommended)'],
            ['end', 'End the session politely'],
            ['general_only', 'Allow general info only — no PHI'],
          ] as const
        ).map(([v, label]) => (
          <label key={v} className="mt-2 flex gap-2">
            <input
              type="radio"
              name="onFail"
              checked={a.onFail === v}
              onChange={() => setA({ onFail: v })}
            />
            {label}
          </label>
        ))}
      </div>
      <div className="mt-4">
        <p className="text-xs">Require identity verification before accessing:</p>
        {(
          [
            ['requireForAppointments', 'Appointments'],
            ['requireForMedications', 'Medications'],
            ['requireForLabs', 'Lab Results'],
            ['requireForInsurance', 'Insurance'],
            ['requireForNotes', 'Clinical Notes'],
            ['requireForVitals', 'Vitals'],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="mt-1 flex gap-2">
            <input
              type="checkbox"
              checked={a[k]}
              onChange={(e) => setA({ [k]: e.target.checked } as Partial<typeof a>)}
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}

function Tab6(props: { draft: AgentSpec; setDraft: (p: Partial<AgentSpec>) => void }): JSX.Element {
  const { draft, setDraft } = props;
  const o = draft.operations ?? {
    urgency: 'standard' as const,
    escalationTeam: 'Human care coordinator',
    sessionTimeoutMins: 15,
    channelVoice: true,
    channelChat: true,
    channelPhone: false,
  };
  const setO = (patch: Partial<typeof o>) => setDraft({ operations: { ...o, ...patch } });
  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="mb-2 text-xs text-slate-500">How urgent are this agent&apos;s conversations?</p>
        {(
          [
            ['life_critical', 'Life-critical — under 1 second (Emergency only)'],
            ['urgent_clinical', 'Urgent clinical — under 2 seconds'],
            ['standard', 'Standard patient-facing — under 3 seconds'],
            ['non_urgent', 'Non-urgent (reporting, analytics)'],
          ] as const
        ).map(([v, label]) => (
          <label key={v} className="flex gap-2 py-1">
            <input
              type="radio"
              name="urgency"
              checked={o.urgency === v}
              onChange={() => setO({ urgency: v })}
            />
            {label}
          </label>
        ))}
      </div>
      <div>
        <label className="text-xs">If agent can&apos;t resolve — who handles it?</label>
        <select
          className="mt-1 w-full rounded border border-teal-100 bg-white px-2 py-1"
          value={o.escalationTeam}
          onChange={(e) => setO({ escalationTeam: e.target.value })}
        >
          {[
            'Human care coordinator',
            'Treating physician',
            'Nursing station',
            'Emergency team',
            'Billing team',
          ].map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs">Session timeout</label>
        <select
          className="mt-1 w-full rounded border border-teal-100 bg-white px-2 py-1"
          value={o.sessionTimeoutMins}
          onChange={(e) => setO({ sessionTimeoutMins: Number(e.target.value) })}
        >
          {[5, 10, 15, 30, 60].map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </div>
      <div>
        <p className="text-xs">Deployed on</p>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={o.channelVoice}
            onChange={(e) => setO({ channelVoice: e.target.checked })}
          />
          Voice call (WebRTC)
        </label>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={o.channelChat}
            onChange={(e) => setO({ channelChat: e.target.checked })}
          />
          Chat
        </label>
        <label className="flex gap-2 text-slate-500">
          <input type="checkbox" disabled />
          Phone / Telephony (coming soon)
        </label>
      </div>
    </div>
  );
}

function Tab7(props: { draft: AgentSpec; setDraft: (p: Partial<AgentSpec>) => void }): JSX.Element {
  const { draft, setDraft } = props;
  const langs = (draft.languages ?? ['en']).join(', ');
  return (
    <details className="rounded border border-teal-100 p-3 text-sm">
      <summary className="cursor-pointer font-medium">⚙ Advanced Settings</summary>
      <div className="mt-4 space-y-3">
        <div>
          <label className="text-xs">LLM Model</label>
          <select
            className="mt-1 w-full rounded border border-teal-100 bg-white px-2 py-1"
            value={draft.llmModel ?? 'gpt-4o'}
            onChange={(e) => setDraft({ llmModel: e.target.value })}
          >
            {['gpt-4o', 'gpt-4o-mini'].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs">Voice Provider</label>
          <select
            className="mt-1 w-full rounded border border-teal-100 bg-white px-2 py-1"
            value={draft.voiceProvider ?? 'openai'}
            onChange={(e) =>
              setDraft({ voiceProvider: e.target.value as 'openai' | 'elevenlabs' })
            }
          >
            <option value="openai">OpenAI Realtime</option>
            <option value="elevenlabs">ElevenLabs</option>
          </select>
        </div>
        <div>
          <label className="text-xs">Voice ID</label>
          <select
            className="mt-1 w-full rounded border border-teal-100 bg-white px-2 py-1"
            value={draft.voiceId ?? 'alloy'}
            onChange={(e) => setDraft({ voiceId: e.target.value })}
          >
            {['alloy', 'echo', 'shimmer', 'fable', 'nova', 'onyx'].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs">Languages (from Tab 1)</label>
          <p className="mt-1 text-slate-500">{langs}</p>
        </div>
        <p className="text-xs text-slate-500">
          Orchestration, memory, and infra settings are display-only in V1.
        </p>
      </div>
    </details>
  );
}

function Tab8(props: {
  testOk: boolean;
  mandatory: ReturnType<typeof getMandatoryFieldStatus>;
  testResults: PublishTestResultMap;
  runTest: (id: keyof PublishTestResultMap) => void;
  runAll: () => void;
  personaSim: string;
  setPersonaSim: (v: string) => void;
  onSimulateChat: () => void;
  onVoice: () => void;
  expandedTest: string | null;
  setExpandedTest: (v: string | null) => void;
  testDetails: Record<string, unknown>;
}): JSX.Element {
  const {
    testOk,
    mandatory,
    testResults,
    runTest,
    runAll,
    personaSim,
    setPersonaSim,
    onSimulateChat,
    onVoice,
    expandedTest,
    setExpandedTest,
    testDetails,
  } = props;

  if (!testOk) {
    return (
      <div className="text-sm">
        <p className="mb-2 font-medium text-slate-700">Complete these fields to unlock testing:</p>
        <ul className="space-y-1">
          {mandatory.map((m) => (
            <li key={m.field} className={m.complete ? 'text-emerald-600' : 'text-rose-700'}>
              {m.complete ? '✓' : '✗'} {m.label} (Tab {m.tab})
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const runCount = TEST_ROWS.filter((r) => testResults[r.id] !== 'idle').length;

  return (
    <div className="space-y-6 text-sm">
      <div className="rounded-lg border border-teal-100 p-4">
        <p className="font-medium">Quick Test</p>
        <p className="mt-1 text-xs text-slate-500">Try a real conversation with your agent</p>
        <label className="mt-3 block text-xs">Persona</label>
        <select
          className="mt-1 w-full rounded border border-teal-100 bg-white px-2 py-1"
          value={personaSim}
          onChange={(e) => setPersonaSim(e.target.value)}
        >
          <option value="default">Default patient</option>
          <option value="anxious">Anxious</option>
          <option value="hindi">Hindi speaker</option>
          <option value="noncompliant">Non-compliant</option>
          <option value="emergency">Emergency</option>
        </select>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-teal-200 bg-white px-3 py-2 text-xs font-medium text-teal-800 shadow-sm hover:bg-teal-50"
            onClick={onSimulateChat}
          >
            💬 Test in Chat
          </button>
          <button
            type="button"
            className="rounded-lg border border-teal-200 bg-white px-3 py-2 text-xs font-medium text-teal-800 shadow-sm hover:bg-teal-50"
            onClick={onVoice}
          >
            🎤 Test with Voice
          </button>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="font-medium">Standard Test Cases</span>
          <button type="button" className="text-xs text-sky-600" onClick={runAll}>
            Run All
          </button>
        </div>
        <p className="text-xs text-slate-500">
          {runCount} / {TEST_ROWS.length} run
        </p>
        <ul className="mt-2 space-y-1">
          {TEST_ROWS.map((row) => (
            <li key={row.id} className="rounded border border-teal-100">
              <div className="flex items-center justify-between gap-2 px-2 py-2">
                <button
                  type="button"
                  className="flex-1 text-left text-xs"
                  onClick={() =>
                    setExpandedTest(expandedTest === row.id ? null : row.id)
                  }
                >
                  — {row.label} {row.critical ? '🔴' : ''}
                </button>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                    testResults[row.id] === 'PASS'
                      ? 'bg-emerald-900/60 text-emerald-300'
                      : testResults[row.id] === 'FAIL'
                        ? 'bg-rose-900/60 text-rose-700'
                        : testResults[row.id] === 'WARN'
                          ? 'bg-amber-900/60 text-amber-300'
                          : 'bg-teal-50 text-slate-600'
                  }`}
                >
                  {testResults[row.id]}
                </span>
                <button
                  type="button"
                  className="text-xs text-sky-600"
                  onClick={() => runTest(row.id)}
                >
                  Run
                </button>
              </div>
              {expandedTest === row.id && (
                <div className="border-t border-teal-100 px-2 py-2 text-xs text-slate-600">
                  <pre className="whitespace-pre-wrap">
                    {JSON.stringify(testDetails[row.id] ?? {}, null, 2)}
                  </pre>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SimulatePanel(props: {
  draft: AgentSpec;
  simMessages: { role: 'user' | 'agent'; text: string }[];
  setSimMessages: Dispatch<
    SetStateAction<{ role: 'user' | 'agent'; text: string }[]>
  >;
  simTyping: boolean;
  setSimTyping: (v: boolean) => void;
  personaSim: string;
  accent: string;
  base: string;
}): JSX.Element {
  const {
    draft,
    simMessages,
    setSimMessages,
    simTyping,
    setSimTyping,
    personaSim,
    accent,
    base,
  } = props;

  const send = async (text: string) => {
    const t = text.trim();
    if (!t) {
      return;
    }
    setSimMessages((prev) => [...prev, { role: 'user', text: t }]);
    setSimTyping(true);
    try {
      const res = await fetch(`${base}/api/studio/simulate-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: normalizeDraftForRuntime(draft),
          patientMessage: t,
          history: simMessages,
          language: personaSim === 'hindi' ? 'hi' : 'en',
        }),
      });
      if (!res.ok) {
        setSimMessages((m) => [...m, { role: 'agent', text: '(simulate error)' }]);
        return;
      }
      const data = (await res.json()) as { reply: string };
      setSimMessages((m) => [...m, { role: 'agent', text: data.reply }]);
    } finally {
      setSimTyping(false);
    }
  };

  return (
    <div className="flex h-full min-h-[240px] flex-col">
      <LanguageBadge code={personaSim === 'hindi' ? 'hi' : 'en'} />
      <div className="mt-2 flex-1 space-y-2 overflow-y-auto">
        {simMessages.map((m, i) => (
          <ChatBubble
            key={i}
            role={m.role === 'agent' ? 'agent' : 'user'}
            text={m.text}
            accentColor={accent}
          />
        ))}
        {simTyping && <TypingIndicator />}
      </div>
      <ChatInput onSend={(text) => void send(text)} disabled={simTyping} />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="text-xs text-slate-500"
          onClick={() => {
            setSimMessages([]);
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
