import { ChatOpenAI } from '@langchain/openai';
import { StringOutputParser } from '@langchain/core/output_parsers';
import type { AgentSpec } from '@vhos/shared';
import { buildSystemPrompt } from '../../prompt-assembler.js';
import { agentSpecSchema } from '../../../validation/agent-spec.schema.js';
import type { ChatGraphDeps } from '../deps.js';
import type { ChatStateAnnotation } from '../chat-state.js';

type State = (typeof ChatStateAnnotation)['State'];
type Update = Partial<(typeof ChatStateAnnotation)['Update']>;

export async function llmResponseNode(
  state: State,
  deps: ChatGraphDeps
): Promise<Update> {
  if (state.skipLlm) {
    return {};
  }
  const apiKey = deps.cfg.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      agentReply:
        'The assistant is not fully configured. Please try again later.',
    };
  }

  const spec = agentSpecSchema.parse(JSON.parse(state.agentSpecJson)) as AgentSpec;
  const patientCtx =
    state.isVerified
      ? { verified: true, uhidHash: '[REDACTED]' }
      : { verified: false };

  let extra = '';
  if (state.firstAidContext) {
    extra += `\n## FIRST AID CONTEXT\n${state.firstAidContext}\n`;
  }
  if (state.empathyInstruction) {
    extra += `\n## EMPATHY\n${state.empathyInstruction}\n`;
  }
  extra += `\n## LANGUAGE\nRespond in language code: ${state.detectedLanguage}.\n`;

  const base = buildSystemPrompt(spec, patientCtx, {
    language: state.detectedLanguage,
    emotion:
      state.emotionLabel === 'anxious' ||
      state.emotionLabel === 'confused' ||
      state.emotionLabel === 'in_pain' ||
      state.emotionLabel === 'calm' ||
      state.emotionLabel === 'urgent' ||
      state.emotionLabel === 'distressed'
        ? state.emotionLabel
        : 'calm',
  });

  const llm = new ChatOpenAI({
    apiKey,
    model: deps.cfg.OPENAI_MODEL,
    temperature: 0.7,
  });
  const chain = llm.pipe(new StringOutputParser());
  const reply = await chain.invoke(
    `${base}${extra}\n\nPatient message:\n${state.userInput.slice(0, 8000)}`
  );
  return { agentReply: reply.trim() };
}
