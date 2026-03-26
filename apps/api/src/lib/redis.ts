import { Redis } from 'ioredis';
import type { AppConfig } from '../config.js';

export function createRedisClient(cfg: AppConfig): Redis {
  return new Redis(cfg.REDIS_URL, {
    maxRetriesPerRequest: 2,
    lazyConnect: true,
  });
}
