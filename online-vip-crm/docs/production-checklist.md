# Production Checklist

## Altyapı

- [ ] Postgres yönetilen servis (backup + PITR)
- [ ] Redis kalıcı / managed
- [ ] `DATABASE_URL`, `REDIS_URL` secret store’da
- [ ] TLS terminate (API + Web)
- [ ] S3 bucket + lifecycle + private ACL

## Güvenlik

- [ ] `JWT_SECRET` / `SESSION_SECRET` / `ENCRYPTION_KEY` üretildi (uzun, rastgele)
- [ ] Demo kullanıcılar / `Demo123!@#` kapalı veya şifreler reset
- [ ] `META_APP_SECRET` dolu; imza doğrulama zorunlu
- [ ] `PUBLIC_FORMS_API_KEY` kurum bazlı; global key yok veya rotate
- [ ] CORS yalnızca `APP_URL`
- [ ] Rate limit (auth, public forms, webhooks)

## Meta / kanallar

- [ ] Production WABA + phone number
- [ ] Webhook URL prod domain
- [ ] Template’ler onaylı
- [ ] Token expiry izleme / alert
- [ ] Kommo cutover checklist imzalı ([`kommo-migration-plan.md`](./kommo-migration-plan.md))

## Uygulama

- [ ] `pnpm db:migrate:deploy`
- [ ] API + worker + web healthcheck
- [ ] DLQ alarmı
- [ ] Log aggregation (PII maskeli)
- [ ] Sentry / eşdeğeri (`SENTRY_DSN`)

## KVKK / hukuk

- [ ] [`kvkk-checklist.md`](./kvkk-checklist.md) tamam
- [ ] Aydınlatma metni + rıza kayıtları
- [ ] Retention policy aktif

## Go-live smoke

- [ ] Login
- [ ] Inbox inbound (test mesajı)
- [ ] Outbound
- [ ] Lead stage değişimi + audit
- [ ] Public form → lead
- [ ] Worker restart sonrası kuyruk drain
