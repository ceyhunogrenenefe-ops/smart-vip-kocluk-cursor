# Faz Planı (0–6)

| Faz | Ad | Durum | Özet |
|-----|-----|--------|------|
| **0** | Analiz & izolasyon | **Tamamlandı (dokümantasyon)** | Mevcut coaching + QR gateway + Kommo envanteri; CRM ayrı monorepo; riskler ve teknik kararlar (`architecture.md`) |
| **1** | Temel platform | **Devam / iskelet hazır** | Monorepo, Prisma şema, API auth, tenant guard, seed, docker postgres/redis, worker iskeleti |
| **2** | Inbox & kanallar | **Planlandı** | Gerçek Meta webhook → conversation/message; outbound providers; kanal health |
| **3** | Satış hunisi | **Kısmi iskelet** | Pipeline/lead API var; otomasyon, kayıp nedenleri UI, SLA sonraki |
| **4** | Görev & bildirim | **Kısmi iskelet** | Tasks/notifications API + worker mock; gerçek push/email sonra |
| **5** | Kommo migrasyon | **Planlandı — dikkat** | Paralel → soft → hard cutover; **otomatik disconnect yok** |
| **6** | Production hardening | **Planlandı** | Checklist, KVKK, monitoring, DLQ ops, load test |

## Faz 0 çıktıları

- Bu repo izolasyonu
- Risk: canlı WA / coaching bozulmasın
- Karar: Cloud API, BullMQ, multi-tenant Postgres

## Faz 1 kabul kriterleri

- [x] `apps/api` login + tenant scoped CRUD iskeleti
- [x] Prisma şema + seed demo
- [x] `apps/worker` kuyruklar + DLQ
- [x] `docker compose up -d` → postgres + redis
- [ ] `apps/web` gerçek UI (yer tutucu mevcut)

## Sonraki öncelik (Faz 2)

1. Webhook → domain event mapping
2. WhatsApp Cloud send
3. Signature zorunlu prod flag
4. Channel connection admin API

Durum tarihçesi: bu dosya her faz kapanışında güncellenir.
