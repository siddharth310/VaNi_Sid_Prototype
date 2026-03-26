type Listener = (payload: unknown) => void;

/**
 * In-process pub/sub for voice session events consumed by SSE.
 * Payloads must never include PHI — callers should pass [REDACTED] fields only.
 */
export class VoiceEventBus {
  private readonly channels = new Map<string, Set<Listener>>();

  subscribe(sessionId: string, listener: Listener): () => void {
    let set = this.channels.get(sessionId);
    if (!set) {
      set = new Set();
      this.channels.set(sessionId, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
      if (set && set.size === 0) {
        this.channels.delete(sessionId);
      }
    };
  }

  publish(sessionId: string, payload: unknown): void {
    const set = this.channels.get(sessionId);
    if (!set) {
      return;
    }
    for (const l of set) {
      l(payload);
    }
  }
}
