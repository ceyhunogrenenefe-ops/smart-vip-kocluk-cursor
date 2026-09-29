# WhatsApp Kurulum (Cloud API)

## Önemli ayrım

| | WhatsApp Cloud API (CRM) | `whatsapp-gateway` (mevcut) |
|--|-------------------------|----------------------------|
| Oturum | Business Phone Number ID + token | QR / cihaz oturumu |
| Destek | Meta resmi | Gayri resmi Web oturumu |
| CRM kullanımı | **Evet** | Hayır |

Canlı operasyon hâlâ Kommo / gateway üzerindeyse **kesmeyin**. Paralel test numarası kullanın.

## Gereksinimler

- Meta App + WhatsApp ürünü
- WhatsApp Business Account (WABA)
- Phone Number ID
- System User / geçici test token → uzun ömürlü production token

## Env

```env
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_API_VERSION=v21.0
META_APP_SECRET=
META_VERIFY_TOKEN=
```

Token’lar DB’de `channel_credentials.encrypted_payload` olarak saklanır; env yalnızca bootstrap / single-tenant demo için.

## Webhook

- URL: `POST/GET {API_URL}/webhooks/meta/whatsapp`
- Subscribe fields (tipik): `messages`, `message_status` (Meta panelinde güncel listeye bakın)

## CRM içi bağlantı

1. Kurum → Kanal bağlantıları → WhatsApp
2. Display name + Phone Number ID
3. Encrypted credential kaydı
4. Durum: `SETUP_REQUIRED` → `CONNECTED`
5. Health check job’ları token süresini izler (`TOKEN_EXPIRED`)

## Şablon mesajlar

- 24 saat dışı müşteriye yalnızca onaylı template
- Template’ler `message_templates` + Meta tarafında onay

## Cutover uyarısı

Kommo’daki numarayı CRM’e taşırken:

1. Yeni numarada smoke test
2. Eski kanalı **manuel** ve planlı kes
3. Otomatik “disconnect Kommo” script’i **yazılmaz / çalıştırılmaz**

Bkz. [`kommo-migration-plan.md`](./kommo-migration-plan.md).
