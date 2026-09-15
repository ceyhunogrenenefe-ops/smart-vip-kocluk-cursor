# Mimari — Faz 0 Analizi

## Bağlam

Online VIP Dershane ekosisteminde bugün birden fazla sistem yan yana çalışıyor. **Online VIP CRM** (`online-vip-crm/`) bunlardan **ayrı, yeni bir monorepo** olarak tasarlandı; mevcut canlı sistemlerin yerine geçmek için değil, omnichannel CRM ihtiyacını karşılamak için.

## Mevcut sistemler (repo kökü)

| Sistem | Teknoloji | Rol | CRM ile ilişki |
|--------|-----------|-----|----------------|
| `student-coaching-system` | Vite + Supabase | Öğrenci koçluk / takip UI | **Dokunulmaz.** CRM ile veri paylaşımı ileride bilinçli entegrasyonla olur; şema veya auth’a dokunulmaz. |
| `whatsapp-gateway` | Node, QR oturumları | WhatsApp Web / Baileys tarzı oturum | **WhatsApp Cloud API değil.** CRM Cloud API + Meta webhook kullanır; gateway ile karıştırılmamalı. |
| Kommo (harici) | SaaS CRM | Canlı WhatsApp / satış | Canlı kanal; **otomatik kesme / migrate yasak** (bkz. `kommo-migration-plan.md`). |

## CRM monorepo yapısı

```
online-vip-crm/
  apps/api      NestJS REST API
  apps/worker   BullMQ worker (webhook, outbound, email-sync, notifications)
  apps/web      Web UI (yer tutucu → Next.js)
  packages/database   Prisma + PostgreSQL
  packages/shared     Enum, permission, util
  packages/integrations  Channel provider arayüzleri
  packages/ui         cn() + marka token’ları
  packages/config     Ortak tsconfig
  docs/               Operasyon ve kurulum belgeleri
```

## Teknik kararlar

1. **İzole monorepo** — Coaching ve gateway kod tabanına bağımlılık yok; ayrı `DATABASE_URL`, ayrı deploy.
2. **PostgreSQL + Prisma** — Multi-tenant `institution_id` her iş tablosunda; soft-delete ve audit alanları.
3. **Redis + BullMQ** — Webhook işleme, outbound, e-posta sync, bildirimler asenkron; API hızlı ACK verir.
4. **Meta Cloud API** — WhatsApp / Instagram / Messenger resmi API; QR gateway kullanılmaz.
5. **Tenant izolasyonu** — JWT + `institutionId`; platform admin hariç çapraz kurum sorgu yok.
6. **Şifreli credential** — Kanal token’ları `channel_credentials.encrypted_payload`; plaintext yasak.
7. **Idempotent webhook** — `(provider, external_event_id)` + payload hash.

## Riskler (Faz 0)

| Risk | Etki | Önlem |
|------|------|--------|
| Canlı WhatsApp’ı Kommo’dan CRM’e “otomatik” taşımak | Mesaj kaybı, müşteri şikayeti | Paralel çalışma; manuel cutover; asla otomatik disconnect |
| Coaching Supabase şemasını “birleştirme” | Öğrenci verisi bozulması | Ayrı DB; entegrasyon yalnızca API sözleşmesiyle |
| QR gateway ile Cloud API karıştırmak | Desteklenmeyen mimari, ban riski | CRM yalnızca Cloud API; gateway dokümanlarda net ayrılır |
| Aynı Meta App’te yanlış webhook URL | Canlı Kommo olaylarının CRM’e düşmesi | Ayrı verify token / ayrı app veya kontrollü subscription |
| Tenant filtresi unutmak | Veri sızıntısı (KVKK) | Guard + middleware + worker’da `institutionId` zorunluluğu |

## Yüksek seviye akış

```
Meta / Form / Email
        │
        ▼
   apps/api  ──ACK──►  webhook_events (PENDING)
        │
        ▼ Redis
   apps/worker  ──►  conversations / messages / leads
        │
        ▼ (fail × N)
   dead_letter_events
```

## Faz durumu

Detay: [`phase-plan.md`](./phase-plan.md). Faz 0 = analiz + izolasyon kararları (bu belge).
