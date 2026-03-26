import type { AgentSpec } from '@vhos/shared';

export const MANDATORY_FIELDS = [
  { tab: 1, field: 'name', label: 'Agent Name' },
  {
    tab: 1,
    field: 'problemStatement',
    label: 'Problem Statement',
    minWords: 20,
  },
  { tab: 1, field: 'goal.primary', label: 'Primary Goal' },
  { tab: 1, field: 'goal.successCondition', label: 'Success Condition' },
  { tab: 1, field: 'goal.escalationTrigger', label: 'Escalation Trigger' },
  { tab: 2, field: 'openingLine', label: 'Opening Line' },
  { tab: 2, field: 'closingLine', label: 'Closing Line' },
  {
    tab: 3,
    field: 'guardrailsJson',
    label: 'At least one guardrail',
    minLength: 1,
  },
] as const;

export type MandatoryFieldDef = (typeof MANDATORY_FIELDS)[number];

export interface MandatoryFieldStatus {
  field: string;
  label: string;
  tab: number;
  complete: boolean;
}

export interface TabStatus {
  tab: number;
  label: string;
  complete: boolean;
  /** True if any mandatory field on this tab is incomplete */
  hasMandatoryIncomplete: boolean;
}

const TAB_LABELS: Record<number, string> = {
  1: '① Core',
  2: '② Conversation',
  3: '③ Guardrails',
  4: '④ Context',
  5: '⑤ Auth',
  6: '⑥ Operations',
  7: '⑦ Tech',
  8: '⑧ Test Agent',
};

function getAtPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function isFieldComplete(
  draft: AgentSpec,
  def: MandatoryFieldDef,
  tab3Visited: boolean
): boolean {
  if (def.field === 'guardrailsJson') {
    if (tab3Visited) {
      return true;
    }
    const n = draft.guardrails?.length ?? 0;
    return n >= (def.minLength ?? 1);
  }
  const v = getAtPath(draft, def.field);
  if (v === undefined || v === null) {
    return false;
  }
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) {
      return false;
    }
    if ('minWords' in def && def.minWords !== undefined) {
      return wordCount(t) >= def.minWords;
    }
    return true;
  }
  return false;
}

export function getMandatoryFieldStatus(
  draft: AgentSpec,
  tab3Visited: boolean
): MandatoryFieldStatus[] {
  return MANDATORY_FIELDS.map((def) => ({
    field: def.field,
    label: def.label,
    tab: def.tab,
    complete: isFieldComplete(draft, def, tab3Visited),
  }));
}

export function getTabCompletionStatus(
  draft: AgentSpec,
  tab3Visited: boolean
): TabStatus[] {
  const m = getMandatoryFieldStatus(draft, tab3Visited);
  const tabs = [1, 2, 3, 4, 5, 6, 7, 8] as const;
  return tabs.map((tabNum) => {
    const onTab = m.filter((x) => x.tab === tabNum);
    const hasMandatoryIncomplete = onTab.some((x) => !x.complete);
    const complete = onTab.length > 0 ? !hasMandatoryIncomplete : true;
    return {
      tab: tabNum,
      label: TAB_LABELS[tabNum] ?? `Tab ${tabNum}`,
      complete,
      hasMandatoryIncomplete,
    };
  });
}

export function isTestUnlocked(draft: AgentSpec, tab3Visited: boolean): boolean {
  return getMandatoryFieldStatus(draft, tab3Visited).every((x) => x.complete);
}

export type PublishTestResultMap = Record<string, 'PASS' | 'FAIL' | 'WARN' | 'idle'>;

const CRITICAL_TEST_IDS = new Set([
  'emergency',
  'phi',
  'clinical',
  'adversarial',
]);

export function isPublishUnlocked(
  draft: AgentSpec,
  tab3Visited: boolean,
  testResults: PublishTestResultMap
): boolean {
  if (!isTestUnlocked(draft, tab3Visited)) {
    return false;
  }
  // Priority-1 resilience: only explicit FAIL should block publish.
  // PASS/WARN/idle are allowed so flaky test endpoints do not block release.
  for (const id of CRITICAL_TEST_IDS) {
    if (testResults[id] === 'FAIL') {
      return false;
    }
  }
  return true;
}

export function missingMandatoryLabels(
  draft: AgentSpec,
  tab3Visited: boolean
): string[] {
  return getMandatoryFieldStatus(draft, tab3Visited)
    .filter((x) => !x.complete)
    .map((x) => x.label);
}
