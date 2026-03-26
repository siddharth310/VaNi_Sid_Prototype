import type { Redis } from 'ioredis';

export interface ChatSessionScope {
  isVerified: boolean;
  authAttempts: number;
  language: string;
  phiIntentPending: boolean;
}

const key = (sessionId: string): string => `chat:scope:${sessionId}`;

export async function getChatScope(
  redis: Redis,
  sessionId: string
): Promise<ChatSessionScope> {
  const raw = await redis.get(key(sessionId));
  if (!raw) {
    return {
      isVerified: false,
      authAttempts: 0,
      language: 'en',
      phiIntentPending: false,
    };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ChatSessionScope>;
    return {
      isVerified: Boolean(parsed.isVerified),
      authAttempts: Number(parsed.authAttempts ?? 0),
      language: typeof parsed.language === 'string' ? parsed.language : 'en',
      phiIntentPending: Boolean(parsed.phiIntentPending),
    };
  } catch {
    return {
      isVerified: false,
      authAttempts: 0,
      language: 'en',
      phiIntentPending: false,
    };
  }
}

export async function setChatScope(
  redis: Redis,
  sessionId: string,
  scope: ChatSessionScope,
  ttlSeconds = 86_400
): Promise<void> {
  await redis.set(key(sessionId), JSON.stringify(scope), 'EX', ttlSeconds);
}

export async function mergeChatScope(
  redis: Redis,
  sessionId: string,
  patch: Partial<ChatSessionScope>
): Promise<ChatSessionScope> {
  const cur = await getChatScope(redis, sessionId);
  const next: ChatSessionScope = { ...cur, ...patch };
  await setChatScope(redis, sessionId, next);
  return next;
}
