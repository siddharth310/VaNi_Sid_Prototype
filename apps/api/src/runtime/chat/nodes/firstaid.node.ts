import { detectFirstAidTrigger, getFirstAidInjection } from '../../firstaid.js';
import type { ChatStateAnnotation } from '../chat-state.js';

type State = (typeof ChatStateAnnotation)['State'];
type Update = Partial<(typeof ChatStateAnnotation)['Update']>;

export function firstaidNode(state: State): Update {
  const trig = detectFirstAidTrigger(state.userInput);
  if (!trig) {
    return { firstAidTrigger: null, firstAidContext: '' };
  }
  return {
    firstAidTrigger: trig,
    firstAidContext: getFirstAidInjection(trig),
    escalate: true,
    escalationReason: 'first_aid_trigger',
  };
}
