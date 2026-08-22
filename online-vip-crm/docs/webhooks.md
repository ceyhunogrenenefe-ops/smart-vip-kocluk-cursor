# Webhooks

## Endpoint’ler

| Method | Path | Amaç |
|--------|------|------|
| GET | `/webhooks/meta/:channel` | Meta verify challenge |
| POST | `/webhooks/meta/:channel` | Event alımı |
| POST | `/public/forms/leads` | Website lead (API key) |

`channel`: `whatsapp` | `instagram` | `messenger`

## İşleme hattı

```
POST webhook
  → imza doğrula
  → idempotency (provider + externalEventId / payloadHash)
  → webhook_events INSERT (PENDING)
  → 200 OK (hızlı)
  → BullMQ `webhook-events`
  → worker PROCESS → conversations/messages
  → PROCESSED | FAILED → (N deneme) DEAD_LETTER
```

## Idempotency

- Unique: `(provider, external_event_id)`
- Ek: `payload_hash` indeksi
- Aynı Meta retry’ı ikinci kez yan etki üretmez

## İmza

- Header: `X-Hub-Signature-256`
- HMAC SHA-256 (`META_APP_SECRET`)
- Secret boş + non-prod: atlanabilir (yalnızca geliştirme)

## Public form

- Header: `x-api-key`
- Kurum ayarı: `institution_settings.settings.formApiKey`
- Dev fallback: `PUBLIC_FORMS_API_KEY` + body `institutionId`

## Operasyon

- DLQ replay: yetkili admin; `dead_letter_events.replayed_at`
- Metric önerisi: pending age, fail rate, DLQ count per institution
- Asla canlı Kommo webhook URL’sini habersiz CRM’e çevirmeyin
