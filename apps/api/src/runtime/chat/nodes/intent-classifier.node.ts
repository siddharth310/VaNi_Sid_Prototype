import { ChatOpenAI } from '@langchain/openai';
import { StringOutputParser } from '@langchain/core/output_parsers';
import type { ChatGraphDeps } from '../deps.js';
import type { ChatStateAnnotation } from '../chat-state.js';

type State = (typeof ChatStateAnnotation)['State'];
type Update = Partial<(typeof ChatStateAnnotation)['Update']>;

const PHI_REGEX =
  /\b(uhid|medical\s+record|my\s+records|prescription\s+history|view\s+my\s+labs?|show\s+my\s+results|my\s+diagnosis)\b/i;

export async function intentClassifierNode(
  state: State,
  deps: ChatGraphDeps
): Promise<Update> {
  const apiKey = deps.cfg.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      intentLabel: 'general',
      phiIntent: PHI_REGEX.test(state.userInput),
      emotionLabel: 'calm',
    };
  }

  const mini = new ChatOpenAI({
    apiKey,
    model: deps.cfg.OPENAI_ROUTING_MODEL,
    temperature: 0,
  });
  const chain = mini.pipe(new StringOutputParser());
  const raw = await chain.invoke(
    `Classify the patient message. Reply JSON only: {"intent":"string","phiIntent":boolean,"emotion":"calm|anxious|confused|in_pain|urgent|distressed"}\nMessage: ${state.userInput.slice(0, 2000)}`
  );
  let phiIntent = PHI_REGEX.test(state.userInput);
  let intentLabel = 'general';
  let emotionLabel = 'calm';
  try {
    const j = JSON.parse(raw) as {
      intent?: string;
      phiIntent?: boolean;
      emotion?: string;
    };
    if (typeof j.intent === 'string') {
      intentLabel = j.intent;
    }
    if (typeof j.phiIntent === 'boolean') {
      phiIntent = phiIntent || j.phiIntent;
    }
    if (typeof j.emotion === 'string') {
      emotionLabel = j.emotion;
    }
  } catch {
    /* keep heuristics */
  }
  return { intentLabel, phiIntent, emotionLabel };
}
