# Online VIP CRM — API

NestJS API for the multi-tenant Online VIP CRM (`apps/api`).

## Stack

- NestJS + TypeScript
- Passport JWT (+ cookie) and local strategy
- bcrypt, class-validator / class-transformer, Zod (env)
- Workspace packages: `@online-vip-crm/database`, `@online-vip-crm/shared`, `@online-vip-crm/integrations`

## Quick start

```bash
# from monorepo root
cp apps/api/.env.example apps/api/.env
# fill DATABASE_URL + JWT_SECRET (min 16 chars)

pnpm install
pnpm --filter @online-vip-crm/database generate   # when schema is ready
pnpm --filter @online-vip-crm/api start:dev
```

Default port: **4000**. CORS origin: `APP_URL`.

```bash
pnpm --filter @online-vip-crm/api test
pnpm --filter @online-vip-crm/api build
pnpm --filter @online-vip-crm/api start
```

## Auth

| Method | Path | Notes |
|--------|------|--------|
| POST | `/auth/login` | `{ email, password }` → JWT + user + institution + permissions; sets httpOnly cookie |
| POST | `/auth/logout` | Clears cookie + audit |
| GET | `/auth/me` | Current user + institution + permissions |

Send `Authorization: Bearer <token>` **or** cookie `JWT_COOKIE_NAME` (default `ovip_crm_token`).

Password policy helper: min 8 chars, upper, lower, number, special.

## Tenant isolation

- Global `JwtAuthGuard` + `PermissionsGuard`
- `@RequirePermissions('inbox.view')` (OR); `@RequireAllPermissions(...)` for AND
- Queries filter by `institutionId` from JWT
- `PLATFORM_SUPER_ADMIN` may switch tenant via `x-institution-id` header or `?institutionId=`
- `InstitutionContext` resolves effective tenant for services

## Endpoints (Phase 1 + stubs)

| Area | Routes |
|------|--------|
| Health | `GET /health` |
| Dashboard | `GET /dashboard/summary` |
| Contacts | `GET/POST /contacts`, `PATCH /contacts/:id` |
| Leads | `GET /leads`, `PATCH /leads/:id/stage` |
| Tasks | `GET /tasks` |
| Inbox | `GET /inbox/conversations?channel=` |
| Meta webhooks | `GET/POST /webhooks/meta/:channel` (`whatsapp` \| `instagram` \| `messenger`) |
| Public forms | `POST /public/forms/leads` + `x-api-key` |
| Mock (non-prod) | `POST /mock/messages` |

### Meta webhooks

- GET: hub challenge verification (`META_VERIFY_TOKEN`)
- POST: signature stub (`META_APP_SECRET`; skipped when empty in dev), idempotent `webhook_events` insert, status → `QUEUED`

### Public forms

`x-api-key` matches `institution.formApiKey`, or dev fallback `PUBLIC_FORMS_API_KEY` + body `institutionId`.

## Expected database models

API expects Prisma models from `@online-vip-crm/database` roughly:

`User`, `Institution` (+ `formApiKey`), `Contact`, `Lead`, `Task`, `Conversation`, `Message`, `WebhookEvent` (unique `provider`+`externalId`), `AuditLog`, permission relations on `User`.

## Env

See `.env.example`. Do not commit real secrets.

## Tests

Vitest unit tests cover:

- PermissionsGuard / tenant helpers
- Auth password policy + bcrypt compare
- Webhook idempotency helper
