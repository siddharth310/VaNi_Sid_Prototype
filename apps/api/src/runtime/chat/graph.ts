import { END, START, StateGraph } from '@langchain/langgraph';
import type { ChatGraphDeps } from './deps.js';
import { ChatStateAnnotation } from './chat-state.js';
import { discoveryNode } from './nodes/discovery.node.js';
import { empathyNode } from './nodes/empathy.node.js';
import { escalationNode } from './nodes/escalation.node.js';
import { firstaidNode } from './nodes/firstaid.node.js';
import { guardrailCheckNode } from './nodes/guardrail-check.node.js';
import { intentClassifierNode } from './nodes/intent-classifier.node.js';
import { llmResponseNode } from './nodes/llm-response.node.js';
import { phiGateNode } from './nodes/phi-gate.node.js';

/**
 * LangGraph chat pipeline. LLM calls use `OPENAI_API_KEY` + `OPENAI_MODEL` / `OPENAI_ROUTING_MODEL` from config.
 */
export function buildChatGraph(deps: ChatGraphDeps) {
  const g = new StateGraph(ChatStateAnnotation)
    .addNode('intent_classifier', (s) => intentClassifierNode(s, deps))
    .addNode('discovery', discoveryNode)
    .addNode('empathy', empathyNode)
    .addNode('firstaid', firstaidNode)
    .addNode('phi_gate', phiGateNode)
    .addNode('llm_response', (s) => llmResponseNode(s, deps))
    .addNode('guardrail_check', guardrailCheckNode)
    .addNode('escalation', escalationNode)
    .addEdge(START, 'intent_classifier')
    .addEdge('intent_classifier', 'discovery')
    .addEdge('discovery', 'empathy')
    .addEdge('empathy', 'firstaid')
    .addEdge('firstaid', 'phi_gate')
    .addConditionalEdges(
      'phi_gate',
      (s) => (s.skipLlm ? 'skip_llm' : 'run_llm'),
      {
        skip_llm: 'guardrail_check',
        run_llm: 'llm_response',
      }
    )
    .addEdge('llm_response', 'guardrail_check')
    .addEdge('guardrail_check', 'escalation')
    .addEdge('escalation', END);

  return g.compile();
}
