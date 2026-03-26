import type { ChatStateAnnotation } from '../chat-state.js';

type State = (typeof ChatStateAnnotation)['State'];
type Update = Partial<(typeof ChatStateAnnotation)['Update']>;

/** Finalize escalation flags (DB write happens in route). */
export function escalationNode(state: State): Update {
  if (!state.escalate) {
    return {};
  }
  return {
    escalationReason: state.escalationReason || 'policy',
  };
}
