# Instagram Kurulum

Instagram Messaging (Business / Creator → Instagram API with Instagram Login veya Page-linked IG) Meta App üzerinden CRM’e bağlanır.

## Gereksinimler

- Instagram profesyonel hesap
- Facebook Page bağlantısı (ürün modeline göre)
- Meta App’te Instagram ürünü + messaging permission’ları
- HTTPS webhook

## Env

```env
INSTAGRAM_PAGE_ID=
INSTAGRAM_BUSINESS_ACCOUNT_ID=
INSTAGRAM_ACCESS_TOKEN=
META_APP_SECRET=
META_VERIFY_TOKEN=
META_GRAPH_API_VERSION=v21.0
```

## Webhook

- URL: `{API_URL}/webhooks/meta/instagram`
- Tipik alanlar: `messages`, `messaging_seen`, `messaging_postbacks` (Meta dokümantasyonuna göre güncelleyin)

## CRM akışı

1. `channel_connections` → `provider = INSTAGRAM`
2. Credential şifreli saklanır
3. Inbound → `webhook_events` → worker → `conversations` / `messages`
4. Outbound → `outbound-messages` kuyruğu

## Dikkat

- 24 saat insan ajan penceresi kurallarına uyun
- Story reply / ice breaker gibi özellikler faz 2+ 
- Test için Meta “Test Users” / test IG hesabı kullanın; canlı sayfayı Kommo’dan koparmadan önce paralel doğrulama yapın

## Sağlık

- `ChannelConnectionStatus`: CONNECTED / TOKEN_EXPIRED / WEBHOOK_ERROR
- Token yenileme (long-lived) operasyon runbook’unda belgelenir
