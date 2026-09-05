# Güvenlik

## Kimlik doğrulama

- JWT (Bearer **veya** httpOnly cookie: `JWT_COOKIE_NAME`)
- Parola: bcrypt; politika ≥8 karakter, büyük/küçük harf, rakam, özel karakter
- `SESSION_SECRET` / `JWT_SECRET` üretimde uzun, rastgele, rotasyonlu
- `ENCRYPTION_KEY` kanal credential şifrelemesi için (AES); asla git’e commit edilmez

## Yetkilendirme

- Rol + permission kataloğu (`@online-vip-crm/shared`)
- Endpoint’lerde `@RequirePermissions` / `@RequireAllPermissions`
- Platform super-admin hariç tüm sorgular `institution_id` ile sınırlı

## Sırlar ve env

| Değişken | Amaç |
|----------|------|
| `JWT_SECRET` | Token imza |
| `SESSION_SECRET` | Oturum / cookie imza (ileride) |
| `ENCRYPTION_KEY` | Token blob şifreleme |
| `META_APP_SECRET` | Webhook imza doğrulama |
| `*_ACCESS_TOKEN` | Meta / e-posta OAuth |
| `S3_*` | Dosya depolama |
| `PUBLIC_FORMS_API_KEY` | Public form fallback (prod’da kurum bazlı key tercih) |

`.env` commit edilmez. Yalnızca `.env.example` (boş değerler).

## Webhook güvenliği

1. Meta `X-Hub-Signature-256` doğrulama (`META_APP_SECRET`)
2. Verify token challenge (`META_VERIFY_TOKEN`)
3. Idempotency — aynı event iki kez işlenmez
4. Public form: `x-api-key` + rate limit (planlanan)

## Veri koruma

- Minimum gerekli PII saklama
- Attachment’lar S3’te; DB’de metadata
- Audit log: kritik aksiyonlar (login, lead stage, outbound)
- KVKK checklist: [`kvkk-checklist.md`](./kvkk-checklist.md)

## Ağ / deploy

- API yalnızca TLS arkasında
- Redis / Postgres public internet’e açık olmamalı
- Worker ayrı process; admin UI’dan DLQ replay yetkili role bağlı

## Yasaklar

- Prod’da default demo şifre
- Plaintext access token
- Log’lara full webhook body / PII dump
- Cross-tenant debug query’sini prod’da “geçici” bırakmak
