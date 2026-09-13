# Online VIP CRM — Worker

BullMQ background worker (`@online-vip-crm/worker`) for queue processing.

## Queues

| Queue | Purpose |
|-------|---------|
| `webhook-events` | Process inbound Meta / channel webhook rows; marks `webhook_events` as `PROCESSED` |
| `outbound-messages` | Mock outbound send (WhatsApp / IG / FB / email) |
| `email-sync` | Mock mailbox sync tick per `channel_connections` |
| `notifications` | Create / deliver in-app notifications |

All jobs should include `institutionId` when known. Processors enforce tenant scope on DB reads/writes.

## Retries & dead letter

- Exponential backoff (base 2s), default max attempts: `WORKER_MAX_ATTEMPTS` (5)
- After exhaustion → row in `dead_letter_events` via Prisma
- Webhook failures also set `processing_status = DEAD_LETTER`

## Quick start

```bash
# from monorepo root — postgres + redis
docker compose up -d

cp .env.example .env
# set DATABASE_URL + REDIS_URL

pnpm install
pnpm --filter @online-vip-crm/shared build
pnpm --filter @online-vip-crm/database generate
pnpm --filter @online-vip-crm/database build

pnpm --filter @online-vip-crm/worker dev
```

## Env

| Variable | Default | Notes |
|----------|---------|--------|
| `DATABASE_URL` | — | Required |
| `REDIS_URL` | `redis://localhost:6379` | BullMQ |
| `WORKER_CONCURRENCY` | `5` | Per queue |
| `WORKER_MAX_ATTEMPTS` | `5` | Before DLQ |
| `NODE_ENV` | `development` | |

## Docker

```bash
docker compose --profile full up -d worker
```

Or build the local Dockerfile:

```bash
docker build -f apps/worker/Dockerfile -t online-vip-crm-worker .
```

## Producers

API (or other services) should enqueue with `defaultJobOptions(maxAttempts)` from `src/queues.ts` so retries match worker expectations.

Example job data:

```ts
await webhookQueue.add('process', {
  institutionId: '...',
  webhookEventId: '...',
  provider: 'WHATSAPP',
});
```
