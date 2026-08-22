# Veritabanı

## Motor

- **PostgreSQL 16**
- ORM: **Prisma** (`packages/database`)
- Yerel varsayılan: `postgresql://crm:crm@localhost:5432/online_vip_crm`

## İlkeler

1. Neredeyse tüm iş tablolarında `institution_id` (UUID).
2. Soft-delete: `deleted_at` (uygun modellerde).
3. Audit: `audit_logs` — kim / ne / ne zaman.
4. Webhook ham veri minimize edilir; PII mümkün olduğunca maskelenir.
5. Token’lar `channel_credentials` içinde şifreli blob.

## Ana domain grupları

| Grup | Tablolar (örnek) |
|------|------------------|
| SaaS / tenant | `institutions`, `institution_settings`, `plans`, `subscriptions` |
| Kimlik | `users`, `roles`, `permissions`, `user_institutions`, `sessions` |
| Kanallar | `channel_connections`, `channel_credentials`, `channel_health_checks` |
| Kişi | `contacts`, `contact_identities`, `students`, `parents`, `tags` |
| Inbox | `conversations`, `messages`, `message_attachments`, `internal_notes` |
| Satış | `pipelines`, `pipeline_stages`, `leads`, `lost_reasons` |
| Görev / bildirim | `tasks`, `notifications`, `canned_responses`, `message_templates` |
| Entegrasyon | `webhook_events`, `integration_jobs`, `integration_errors`, `dead_letter_events` |
| Uyumluluk | `consent_records`, `data_retention_policies`, `audit_logs`, `files` |

## Kritik enum’lar

- `Provider`: WHATSAPP, INSTAGRAM, FACEBOOK, EMAIL, WEBSITE, PHONE, MOCK
- `ProcessingStatus`: PENDING → PROCESSING → PROCESSED | FAILED | DEAD_LETTER | SKIPPED
- `ChannelConnectionStatus`: CONNECTED, DEGRADED, TOKEN_EXPIRED, …

## Webhook & DLQ

```sql
-- webhook_events: idempotency
UNIQUE (provider, external_event_id)

-- dead_letter_events: worker tükenmiş denemeler
source_table, source_id, payload, last_error, institution_id
```

## Migrasyon komutları

```bash
pnpm db:generate
pnpm db:migrate          # geliştirme
pnpm db:migrate:deploy   # prod
pnpm db:seed             # demo kurum + kullanıcılar
pnpm db:studio
```

## Seed notu

Demo kurum: **Online VIP Dershane**. Şifre ve e-postalar root `README.md` içinde; yalnızca local/demo.
