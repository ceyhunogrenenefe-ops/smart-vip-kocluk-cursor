# Online VIP CRM — API

NestJS API for the multi-tenant Online VIP CRM (`apps/api`).

## Stack

- NestJS + TypeScript
- Passport JWT (Bearer **or** httpOnly cookie) + local strategy
- bcrypt, class-validator / class-transformer, Zod (env validation)
- Workspace packages: `@online-vip-crm/database`, `@online-vip-crm/shared`, `@online-vip-crm/integrations`

## Quick start

```bash
# from monorepo root
cp apps/api/.env.example apps/api/.env
# set DATABASE_URL + JWT_SECRET (min 16 chars)

pnpm install
pnpm --filter @online-vip-crm/shared build
pnpm --filter @online-vip-crm/database generate
pnpm --filter @online-vip-crm/database build
pnpm --filter @online-vip-crm/integrations build
pnpm db:seed   # optional demo data
pnpm --filter @online-vip-crm/api start:dev
```

Default port: **4000**. CORS: `APP_URL` (+ localhost:3000).

```bash
pnpm --filter @online-vip-crm/api test
pnpm --filter @online-vip-crm/api build
pnpm --filter @online-vip-crm/api start
```

## Auth

| Method | Path | Body / notes |
|--------|------|----------------|
| POST | `/auth/login` | `{ email, password }` → `accessToken`, `user`, `institution`, `permissions`; sets cookie |
| POST | `/auth/logout` | Clears cookie + audit |
| GET | `/auth/me` | Current user + institution + permissions |

Password policy helper: ≥8 chars, upper, lower, number, special.

## Tenant isolation

- Global `JwtAuthGuard` + `PermissionsGuard`
- `@RequirePermissions('inbox.view')` (OR) / `@RequireAllPermissions(...)` (AND)
- All tenant queries filter by `institutionId` from JWT membership
- `PLATFORM_SUPER_ADMIN` / `isPlatformAdmin` may switch via `x-institution-id` or `?institutionId=`
- `InstitutionContext` resolves effective tenant for services

## Endpoints

| Area | Routes |
|------|--------|
| Health | `GET /health` |
| Dashboard | `GET /dashboard/summary` |
| Contacts | `GET/POST /contacts`, `PATCH /contacts/:id` |
| Leads | `GET /leads`, `PATCH /leads/:id/stage` (`stageId` or `stageKey`) |
| Tasks | `GET /tasks` |
| Inbox | `GET /inbox/conversations?channel=WHATSAPP` |
| Meta webhooks | `GET/POST /webhooks/meta/:channel` (`whatsapp` \| `instagram` \| `messenger`) |
| Public forms | `POST /public/forms/leads` + `x-api-key` |
| Mock (non-prod) | `POST /mock/messages` via `MockProvider` |

### Public form API key

Looks up `institution_settings.settings.formApiKey` (or `publicFormApiKey`). Dev fallback: `PUBLIC_FORMS_API_KEY` + body `institutionId`.

### Webhooks

Idempotent on `(provider, externalEventId)` (+ payload hash). Signature stub uses `META_APP_SECRET` (skipped when empty in dev).

## Env

See `.env.example`. Do not commit real secrets.

## Tests

```bash
pnpm --filter @online-vip-crm/api test
```

Covers PermissionsGuard / tenant helpers, auth password policy + bcrypt compare, webhook idempotency helper.
