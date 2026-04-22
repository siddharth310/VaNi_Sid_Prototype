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

## Docker Compose (development only)

```bash
docker compose up
```

This starts Postgres, Redis, API, and Web with code mounted from the repo. Ensure `.env` exists and `PATIENT_HASH_SECRET` is set.

## Production containers

The checked-in `docker-compose.yml` is a local development workflow. It runs Vite dev mode, mounts the repo into containers, and installs dependencies at startup. That is not suitable for AWS deployment.

For production builds, use the dedicated Dockerfiles:

```bash
docker build -f apps/api/Dockerfile -t vhos-api .
docker build -f apps/web/Dockerfile -t vhos-web .
```

Or run the production compose file locally as a smoke test:

```bash
docker compose -f docker-compose.prod.yml up --build
```

Production behavior:

- `apps/web/Dockerfile` builds static assets and serves them from Nginx.
- Nginx proxies `/api/*` to the API container, so the browser no longer needs a hardcoded localhost API URL.
- `apps/api/src/routes/voice.route.ts` now derives the public WebSocket host from forwarded headers when `PUBLIC_WS_HOST` is unset, which is required behind AWS ALB, Nginx, or ECS service discovery.

Recommended AWS shape:

- Run `web` and `api` as separate ECS services or separate containers in one task.
- Use RDS for PostgreSQL and ElastiCache for Redis instead of the compose-managed containers.
- Set `PUBLIC_APP_URL` to the public HTTPS URL of the web app when using `docker-compose.prod.yml`.
- Set `EXTERNAL_DATABASE_URL` and `EXTERNAL_REDIS_URL` when pointing the API at RDS and ElastiCache.
- If your ingress does not forward `Host` or `X-Forwarded-*` headers correctly, set `PUBLIC_WS_HOST` explicitly to the public host name.
- Run `pnpm --filter @vhos/api exec prisma migrate deploy` as a release step before shifting traffic.

## Project layout

- `packages/shared` — shared TypeScript types and constants
- `apps/api` — Fastify API, Prisma schema, voice runtime (`createVoiceProvider()` factory only)
- `apps/web` — React 18 + Vite + Tailwind (dark theme baseline)
- `scripts/seed-agents.ts` — seeds six built-in agents
