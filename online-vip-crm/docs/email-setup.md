# E-posta Kurulum

CRM e-posta kanalı `Provider.EMAIL` ile `channel_connections` üzerinden yönetilir. Worker kuyruğu: `email-sync`. Outbound: `outbound-messages`.

## Desteklenen modeller (hedef)

| Mod | Açıklama |
|-----|----------|
| SMTP + IMAP | Klasik kurumsal kutu |
| OAuth (Google / Microsoft) | Refresh token ile sync |
| Transactional-only | Yalnızca SMTP gönderim (inbox sync yok) |

## Env

```env
EMAIL_PROVIDER=
EMAIL_FROM_ADDRESS=
EMAIL_FROM_NAME=
EMAIL_SMTP_HOST=
EMAIL_SMTP_PORT=
EMAIL_SMTP_USER=
EMAIL_SMTP_PASSWORD=
EMAIL_IMAP_HOST=
EMAIL_IMAP_PORT=
EMAIL_IMAP_USER=
EMAIL_IMAP_PASSWORD=
EMAIL_OAUTH_CLIENT_ID=
EMAIL_OAUTH_CLIENT_SECRET=
EMAIL_OAUTH_REFRESH_TOKEN=
```

Kurum bazlı credential’lar yine şifreli tabloda tutulmalıdır; env tek-tenant / bootstrap içindir.

## Worker

- Job: `{ institutionId, channelConnectionId, syncCursor? }`
- Mock processor log yazar; gerçek IMAP/Gmail adaptörü sonraki faz
- Hata tükenince `dead_letter_events`

## Güvenlik / KVKK

- App password / OAuth secret plaintext loglanmaz
- Gelen ekler virüs taraması + S3’e (plan)
- Velilere toplu mail: açık rıza + opt-out (`consent_records`)

## DNS (gönderim)

Production’da SPF, DKIM, DMARC ayarlanmadan yüksek hacimli gönderim yapılmaz.
