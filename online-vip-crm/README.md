# Online VIP CRM

**TR:** Online VIP Dershane için çok kiracılı (multi-tenant), omnichannel CRM monoreposu. WhatsApp Cloud API, Instagram, Facebook Messenger, e-posta ve web formlarını tek gelen kutusu + satış hunisinde birleştirir.

**EN:** Multi-tenant omnichannel CRM monorepo for Online VIP Dershane — unified inbox and sales pipeline across WhatsApp Cloud API, Instagram, Messenger, email, and web forms.

> Bu repo, `student-coaching-system` (Vite+Supabase) ve `whatsapp-gateway` (QR oturumları) sistemlerinden **izole**dir. Canlı Kommo WhatsApp bağlantısını otomatik kesmez.

## Stack

| Katman | Teknoloji |
|--------|-----------|
| API | NestJS (`apps/api`) |
| Worker | BullMQ + TypeScript (`apps/worker`) |
| Web | Next.js (`apps/web`) |
| DB | PostgreSQL 16 + Prisma |
| Queue | Redis 7 |

## Yerel çalıştırma

```bash
# 1) Altyapı (yalnızca Postgres + Redis)
docker compose up -d

# 2) Env
cp .env.example .env
# JWT_SECRET (>=16 karakter) ve isteğe bağlı diğer alanları doldurun

# 3) Bağımlılık + DB
pnpm install
pnpm --filter @online-vip-crm/shared build
pnpm --filter @online-vip-crm/database generate
pnpm --filter @online-vip-crm/database build
pnpm --filter @online-vip-crm/integrations build
pnpm db:migrate
pnpm db:seed

# 4) Geliştirme
pnpm --filter @online-vip-crm/api start:dev
pnpm --filter @online-vip-crm/worker dev
pnpm --filter @online-vip-crm/web dev     # Next.js :3000
```

Tam stack container:

```bash
docker compose --profile full up -d --build
```

## Demo kimlik bilgileri

| Alan | Değer |
|------|--------|
| E-posta | `owner@demo.onlinevipdershane.local` |
| Şifre | `Demo123!@#` |

Diğer seed kullanıcıları: `admin@`, `kayit@`, `rehber@`, `superadmin@` aynı domain ve şifre.

**Not:** Yalnızca demo / local. Production’da kullanmayın; şifreleri değiştirin veya hesapları kapatın.

## Dokümantasyon

Tüm teknik belgeler `docs/` altında (Türkçe):

- [architecture.md](docs/architecture.md) — Faz 0 analizi
- [database.md](docs/database.md)
- [security.md](docs/security.md)
- [tenant-isolation.md](docs/tenant-isolation.md)
- [meta-setup.md](docs/meta-setup.md) · [whatsapp-setup.md](docs/whatsapp-setup.md) · [instagram-setup.md](docs/instagram-setup.md) · [facebook-setup.md](docs/facebook-setup.md) · [email-setup.md](docs/email-setup.md)
- [webhooks.md](docs/webhooks.md)
- [kommo-migration-plan.md](docs/kommo-migration-plan.md)
- [production-checklist.md](docs/production-checklist.md) · [kvkk-checklist.md](docs/kvkk-checklist.md)
- [phase-plan.md](docs/phase-plan.md)

## Paketler

```
apps/api  apps/worker  apps/web
packages/database  packages/shared  packages/integrations  packages/ui  packages/config
```
