import type { ChatStateAnnotation } from '../chat-state.js';
import { agentSpecSchema } from '../../../validation/agent-spec.schema.js';

type State = (typeof ChatStateAnnotation)['State'];
type Update = Partial<(typeof ChatStateAnnotation)['Update']>;

export function discoveryNode(state: State): Update {
  const spec = agentSpecSchema.safeParse(JSON.parse(state.agentSpecJson));
  const depth = spec.success ? spec.data.discoveryDepth : 2;
  const next = Math.min(state.discoveryTurns + 1, depth + 2);
  return { discoveryTurns: next };
}
