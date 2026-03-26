import type { Redis } from 'ioredis';
import type { AppConfig } from '../../config.js';

export interface ChatGraphDeps {
  cfg: AppConfig;
  redis: Redis;
}
