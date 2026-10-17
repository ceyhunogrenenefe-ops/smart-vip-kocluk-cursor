# Facebook Messenger Kurulum

Facebook Page Messenger, Meta Graph API + Page Access Token ile CRM’e bağlanır.

## Gereksinimler

- Facebook Page
- Meta App + Messenger ürünü
- Page’i App’e bağlama
- `pages_messaging` (ve güncel izin seti) onayı

## Env

```env
FACEBOOK_PAGE_ID=
FACEBOOK_PAGE_ACCESS_TOKEN=
META_APP_SECRET=
META_VERIFY_TOKEN=
META_GRAPH_API_VERSION=v21.0
```

## Webhook

- URL: `{API_URL}/webhooks/meta/messenger`
- Subscribe: Page’in Messenger alanları (`messages`, `messaging_postbacks`, `message_deliveries`, …)

## CRM

| Adım | Açıklama |
|------|----------|
| 1 | `channel_connections` FACEBOOK |
| 2 | Page ID + encrypted page token |
| 3 | Webhook verify + signature |
| 4 | Worker conversation upsert |

## Notlar

- Aynı Meta App hem WhatsApp hem Messenger için kullanılabilir; webhook path’leri kanala göre ayrılır
- Canlı Page hâlâ Kommo’ya bağlıysa subscription’ı dikkatli yönetin — çift tüketim veya kayıp riski
- Handover protocol / multiple app: cutover planında tek aktif consumer hedeflenir
