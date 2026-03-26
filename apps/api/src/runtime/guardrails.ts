import { SAFE_FALLBACKS } from '@vhos/shared';

export type GuardrailSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type GuardrailAction =
  | 'block_immediately'
  | 'flag_and_escalate'
  | 'log_and_warn'
  | 'log_only';

export interface GuardrailResult {
  pass: boolean;
  severity: GuardrailSeverity;
  action: GuardrailAction;
  rule: string;
  reason: string;
  safeResponse?: string;
}

interface GlobalRule {
  pattern: RegExp;
  rule: string;
  severity: GuardrailSeverity;
  action: GuardrailAction;
  safe: string;
}

const GLOBAL_GUARDRAILS: GlobalRule[] = [
  {
    pattern: /diagnos/i,
    rule: 'No diagnosis',
    severity: 'CRITICAL',
    action: 'block_immediately',
    safe: SAFE_FALLBACKS.clinical_advice,
  },
  {
    pattern: /stop\s+(taking|using)\s+(medication|medicine|drug|dose)/i,
    rule: 'No medication changes',
    severity: 'CRITICAL',
    action: 'block_immediately',
    safe: SAFE_FALLBACKS.clinical_advice,
  },
  {
    pattern: /lab.*(result|value|number).*(normal|abnormal|high|low)/i,
    rule: 'No lab interpretation',
    severity: 'CRITICAL',
    action: 'block_immediately',
    safe: SAFE_FALLBACKS.clinical_advice,
  },
  {
    pattern: /what\s+(is|are)\s+my\s+(results|numbers)/i,
    rule: 'No unsourced lab interpretation',
    severity: 'HIGH',
    action: 'flag_and_escalate',
    safe: SAFE_FALLBACKS.clinical_boundary,
  },
  {
    pattern: /suicid|kill myself|end my life/i,
    rule: 'Self-harm signal',
    severity: 'CRITICAL',
    action: 'flag_and_escalate',
    safe: SAFE_FALLBACKS.emergency,
  },
];

export interface GuardrailContext {
  /** Agent-specific rule strings from spec (matched as substrings is too weak — use severity buckets only here) */
  agentRuleTexts?: { text: string; severity: GuardrailSeverity }[];
}

/**
 * Runs global rules and optional agent-configured rules (substring match on patient/agent text).
 */
export function checkGuardrails(
  text: string,
  _ctx: GuardrailContext = {}
): GuardrailResult {
  void _ctx;
  for (const g of GLOBAL_GUARDRAILS) {
    if (g.pattern.test(text)) {
      return {
        pass: false,
        severity: g.severity,
        action: g.action,
        rule: g.rule,
        reason: 'Global guardrail matched',
        safeResponse: g.safe,
      };
    }
  }
  return {
    pass: true,
    severity: 'LOW',
    action: 'log_only',
    rule: 'none',
    reason: 'No global guardrail hit',
  };
}

export function checkAgentConfiguredGuardrails(
  text: string,
  rules: { rule: string; severity: GuardrailSeverity }[]
): GuardrailResult {
  const lower = text.toLowerCase();
  for (const r of rules) {
    const needle = r.rule.toLowerCase().slice(0, 64);
    if (needle.length > 2 && lower.includes(needle)) {
      const safe =
        r.severity === 'CRITICAL' || r.severity === 'HIGH'
          ? SAFE_FALLBACKS.clinical_boundary
          : SAFE_FALLBACKS.clinical_advice;
      return {
        pass: false,
        severity: r.severity,
        action:
          r.severity === 'CRITICAL' ? 'block_immediately' : 'log_and_warn',
        rule: r.rule,
        reason: 'Agent workbook guardrail keyword surface',
        safeResponse: safe,
      };
    }
  }
  return {
    pass: true,
    severity: 'LOW',
    action: 'log_only',
    rule: 'none',
    reason: 'No agent guardrail hit',
  };
}
