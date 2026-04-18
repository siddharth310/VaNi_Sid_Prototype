import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  AGENT_CATALOG_REFRESH_URL: z.string().url().default('http://localhost:8100/v1/agents/catalog/refresh'),
  ORCHESTRATION_BASE_URL: z.string().url().default('http://localhost:8100'),
  PUBLIC_WS_HOST: z
    .string()
    .optional()
    .describe('Optional host for wsUrl in voice/start (e.g. localhost:3001)'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  OPENAI_ROUTING_MODEL: z.string().default('gpt-4o-mini'),
  VOICE_PROVIDER: z.enum(['openai', 'elevenlabs']).default('openai'),
  OPENAI_REALTIME_MODEL: z.string().default('gpt-4o-realtime-preview'),
  OPENAI_DEFAULT_VOICE: z.string().default('alloy'),
  ELEVENLABS_API_KEY: z.string().optional().default(''),
  ELEVENLABS_DEFAULT_AGENT_ID: z.string().optional().default(''),
  ELEVENLABS_DEFAULT_VOICE_ID: z.string().optional().default(''),
  PATIENT_HASH_SECRET: z.string().min(32, 'PATIENT_HASH_SECRET must be at least 32 characters'),
  OTP_EXPIRY_SECONDS: z.coerce.number().int().positive().default(120),
  MAX_AUTH_ATTEMPTS: z.coerce.number().int().positive().default(3),
  TWILIO_ACCOUNT_SID: z.string().optional().default(''),
  TWILIO_AUTH_TOKEN: z.string().optional().default(''),
  TWILIO_PHONE_NUMBER: z.string().optional().default(''),
  FHIR_BASE_URL: z.string().optional().default(''),
  FHIR_AUTH_TOKEN: z.string().optional().default(''),
  SIEM_WEBHOOK_URL: z.string().optional().default(''),
  SIEM_WEBHOOK_SECRET: z.string().optional().default(''),
  PROMETHEUS_PORT: z.coerce.number().int().positive().default(9090),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment configuration: ${JSON.stringify(msg)}`);
  }
  return parsed.data;
}
