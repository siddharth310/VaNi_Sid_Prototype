import { SAFE_FALLBACKS } from '@vhos/shared';
import type { ChatStateAnnotation } from '../chat-state.js';

type State = (typeof ChatStateAnnotation)['State'];
type Update = Partial<(typeof ChatStateAnnotation)['Update']>;

/**
 * Blocks PHI-heavy flows until verified (except emergency agent per product rules).
 */
export function phiGateNode(state: State): Update {
  if (state.isEmergencyAgent) {
    return { phiBlocked: false, needsPhiAuth: false, skipLlm: false };
  }
  if (state.phiIntent && !state.isVerified) {
    return {
      phiBlocked: true,
      needsPhiAuth: true,
      agentReply: SAFE_FALLBACKS.phi_blocked,
      skipLlm: true,
    };
  }
  return { phiBlocked: false, needsPhiAuth: false, skipLlm: false };
}
