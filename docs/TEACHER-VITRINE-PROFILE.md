# Öğretmen vitrin profili entegrasyonu (Faz 1)

## Ne eklendi?

Ders Online VIP Koçluk panelinde öğretmen hesabı = tek kullanıcı (`users` + `teacher` rolü).
Yeni tablo `teacher_profiles` bu kullanıcıya **1:1** bağlıdır (unique `user_id`).

- Öğretmen hesabı açılınca profil otomatik oluşur (`incomplete`)
- Öğretmen `/profilimi-duzenle` ile vitrin profilini doldurur → Onaya gönderir
- Admin `/ogretmen-profil-onaylari` ile onaylar / reddeder / pasife alır
- Onaylanınca `published_snapshot` oluşur
- Public API: `GET /api/public/teachers` ve `GET /api/public/teachers?slug=`
- Siteye webhook: `SITE_TEACHERS_WEBHOOK_URL` + `SITE_TEACHERS_WEBHOOK_SECRET` (HMAC)

## Migration

Supabase SQL Editor’da çalıştırın:

`sql/2026-07-18-teacher-public-profiles.sql`

## Storage (opsiyonel, foto/belge yükleme)

Supabase Storage → bucket adı: `teacher-profiles`  
(Env ile değiştirilebilir: `TEACHER_PROFILE_BUCKET`)

## Environment

| Değişken | Açıklama |
|----------|----------|
| `SITE_TEACHERS_WEBHOOK_URL` | onlinevipdershane.com inbound sync URL (Faz 2) |
| `SITE_TEACHERS_WEBHOOK_SECRET` | Paylaşılan gizli anahtar |
| `PUBLIC_TEACHERS_CORS_ORIGIN` | Varsayılan: onlinevipdershane.com domainleri |
| `TEACHER_PROFILE_BUCKET` | Varsayılan: `teacher-profiles` |
| `OZEL_DERS_WEBHOOK_SECRET` | Mevcut (site → panel talep webhook) |

## API özeti

| Endpoint | Rol |
|----------|-----|
| `GET/PATCH /api/teacher-profile` | teacher |
| `POST /api/teacher-profile?op=submit` | teacher |
| `GET/POST /api/teacher-profiles-admin` | admin, super_admin |
| `GET /api/public/teachers` | public |
| `POST /api/teacher-profile-media?op=sign\|confirm` | teacher / admin |

## Faz 2 (site)

`onlinevipdershane.com` `premium-teachers-ui.js` → public API’den liste çekecek;
PayTR’ye açık `teacher_slug` alanı eklenecek.
