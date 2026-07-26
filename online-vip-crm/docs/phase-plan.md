# Faz Planı (0–6)

| Faz | Ad | Durum | Özet |
|-----|-----|--------|------|
| **0** | Analiz & izolasyon | **Tamamlandı** | Mevcut coaching + QR gateway + Kommo envanteri; CRM ayrı monorepo; riskler (`architecture.md`) |
| **1** | Temel platform | **Tamamlandı (MVP iskelet)** | Monorepo, Prisma, auth/RBAC/tenant, seed, docker postgres/redis, worker, login + dashboard |
| **2** | CRM çekirdeği | **Kısmi** | Contacts/leads/tasks API + UI; kanban listesi; pipeline seed |
| **3** | Ortak gelen kutusu | **Kısmi** | Konuşma listesi, mesaj geçmişi, mock outbound reply, assign endpoint; WebSocket sonraki |
| **4** | Web form + e-posta | **Kısmi** | `POST /public/forms/leads` (API key, honeypot, consent); EmailProvider adapter stub |
| **5** | Meta kanalları | **Altyapı** | Webhook verify + idempotent event kaydı; WhatsApp/IG/FB provider stub; canlı taşıma yok |
| **6** | Rapor & kalite | **Kısmi** | Dashboard özeti; dokümantasyon; unit testler; tenant isolation integration test |

## Faz 0 çıktıları

- CRM `online-vip-crm/` altında izole
- Risk: canlı WA / coaching bozulmasın; Kommo otomatik kesilmez
- Karar: Cloud API, BullMQ, multi-tenant Postgres, NestJS + Next.js

## Doğrulanan kabul maddeleri (yerel)

- [x] Güvenli giriş (JWT)
- [x] Tenant scoped sorgular + isolation testleri
- [x] Ortak gelen kutusu listesi
- [x] Mock inbound mesaj + panelden reply
- [x] Web form → contact + lead
- [x] Meta webhook GET verify
- [x] Duplicate webhook idempotency helper
- [x] Seed demo verisi (sahte PII)
- [x] Secret’lar kaynak kodunda yok
- [ ] Gerçek Meta OAuth / token health (kurulum dokümanı hazır; hesap erişimi yok)
- [ ] IMAP/SMTP canlı senkron
- [ ] WebSocket gerçek zamanlı
- [ ] E2E Playwright suite

## Sonraki öncelik

1. WebSocket gateway + unread badge canlı güncelleme
2. Worker’ın webhook_events işlemesi → NormalizedMessage → conversation
3. Kanal ayarları UI (bağlantı durumu, test et)
4. Lead kanban sürükle-bırak + stage history
5. Playwright E2E (login → inbox → reply → lead)

Durum tarihçesi: bu dosya her faz kapanışında güncellenir.
