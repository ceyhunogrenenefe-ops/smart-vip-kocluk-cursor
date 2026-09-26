# Meta Kurulum

WhatsApp, Instagram ve Facebook Messenger kanalları **aynı Meta (Facebook) Developer App** üzerinden yönetilebilir. CRM Cloud API + Webhooks kullanır; QR / Baileys gateway kullanılmaz.

## Ön koşullar

1. Meta Business Manager erişimi
2. Developer App (Business type)
3. Webhook’ların erişebileceği HTTPS `API_URL` (ngrok / prod domain)
4. Env: `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`

## Adımlar (özet)

1. [developers.facebook.com](https://developers.facebook.com) → Create App → Business
2. Ürün ekle: **WhatsApp**, **Instagram**, **Messenger** (ihtiyaca göre)
3. App Secret’ı kopyala → `META_APP_SECRET` (asla commit etme)
4. Webhooks ürünü:
   - Callback URL: `{API_URL}/webhooks/meta/{channel}`  
     `channel`: `whatsapp` | `instagram` | `messenger`
   - Verify Token: `META_VERIFY_TOKEN` ile birebir aynı
5. Gerekli permission’ları App Review sürecine göre iste
6. Graph API version: `META_GRAPH_API_VERSION` (ör. `v21.0`)

## Ortam değişkenleri

```env
META_APP_ID=
META_APP_SECRET=
META_VERIFY_TOKEN=
META_WEBHOOK_PATH_PREFIX=/webhooks/meta
META_GRAPH_API_VERSION=v21.0
```

## Güvenlik notları

- Production’da imza doğrulama **zorunlu** (`META_APP_SECRET` dolu)
- Dev’de secret boşsa API imzayı atlayabilir — prod’da yasak
- Canlı Kommo webhook’unu aynı URL’ye yönlendirmeyin; kesinti riski

## Sağlık kontrolü

1. Meta panelinden “Test” event gönder
2. `webhook_events` satırı oluşmalı
3. Worker `PROCESSED` işaretlemeli (mock / gerçek handler)

Detay kanallar: [`whatsapp-setup.md`](./whatsapp-setup.md), [`instagram-setup.md`](./instagram-setup.md), [`facebook-setup.md`](./facebook-setup.md).
