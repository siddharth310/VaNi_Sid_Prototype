import type { ChatStateAnnotation } from '../chat-state.js';

type State = (typeof ChatStateAnnotation)['State'];
type Update = Partial<(typeof ChatStateAnnotation)['Update']>;

const EMOTION: Record<string, string> = {
  anxious:
    'The patient sounds anxious. Start with validation; keep sentences short and reassuring.',
  confused:
    'The patient sounds confused. Use very simple language and confirm understanding.',
  in_pain:
    'The patient may be in pain. Acknowledge quickly and prioritize safety and triage.',
  calm: 'Maintain a warm, professional tone.',
  urgent: 'Be concise and action-oriented; minimize small talk.',
  distressed:
    'The patient sounds distressed. Lead with empathy before practical steps.',
};

export function empathyNode(state: State): Update {
  const key = state.emotionLabel in EMOTION ? state.emotionLabel : 'calm';
  return { empathyInstruction: EMOTION[key] ?? EMOTION.calm };
}
