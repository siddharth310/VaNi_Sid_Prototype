# VHOS (Virtual Hospital Operating System)

Greenfield monorepo for the VHOS platform: `packages/shared`, `apps/api` (Fastify + Prisma), and `apps/web` (React + Vite + Tailwind).

## Prerequisites

- Node.js 20+
- pnpm 9+ (`corepack enable`)

## Setup

1. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

2. Set `PATIENT_HASH_SECRET` to a random string of at least 32 characters and add `OPENAI_API_KEY` when using OpenAI voice or LLM features.

3. Install dependencies and build shared types:

   ```bash
   pnpm install
   pnpm --filter @vhos/shared build
   ```

4. Start PostgreSQL and Redis (see [docker-compose.yml](./docker-compose.yml)):

   ```bash
   docker compose up -d postgres redis
   ```

5. Run Prisma migrations and seed built-in agents:

   ```bash
   pnpm --filter @vhos/api exec prisma migrate dev
   pnpm --filter @vhos/api exec prisma db seed
   ```

## Run locally

Terminal 1 — API (port 3001):

```bash
pnpm --filter @vhos/api dev
```

Terminal 2 — Web (port 5173):

```bash
pnpm --filter @vhos/web dev
```

Or from the repo root after `pnpm --filter @vhos/shared build`:

```bash
pnpm dev
```

Health check: `GET http://localhost:3001/health`

## Switch voice provider

Voice backends are selected only via the API process environment (never in the browser). Set `VOICE_PROVIDER` in `.env`:

- `openai` — OpenAI Realtime (`OPENAI_API_KEY`, `OPENAI_REALTIME_MODEL`, optional per-agent `voiceId` in `specJson`)
- `elevenlabs` — ElevenLabs Conversational stub (`ELEVENLABS_API_KEY` and related IDs when wired)

Restart the API after changing `VOICE_PROVIDER`. The frontend talks only to `/api/voice/...`; it does not depend on which provider is active.

## Docker Compose (all services)

```bash
docker compose up
```

This starts Postgres, Redis, API, and Web with code mounted from the repo. Ensure `.env` exists and `PATIENT_HASH_SECRET` is set.

## Project layout

- `packages/shared` — shared TypeScript types and constants
- `apps/api` — Fastify API, Prisma schema, voice runtime (`createVoiceProvider()` factory only)
- `apps/web` — React 18 + Vite + Tailwind (dark theme baseline)
- `scripts/seed-agents.ts` — seeds six built-in agents
