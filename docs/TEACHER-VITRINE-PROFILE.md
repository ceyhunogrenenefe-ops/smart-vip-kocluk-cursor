# Öğretmen vitrin profili entegrasyonu

## Faz 1 (panel) — hazır

- SQL: `sql/2026-07-18-teacher-public-profiles.sql`
- Bucket: `teacher-profiles`
- Öğretmen: `/profilimi-duzenle`
- Admin: `/ogretmen-profil-onaylari`
- Public API: `GET /api/public/teachers` ve `?slug=`

## Faz 2 (site) — hazır

| Parça | Açıklama |
|-------|----------|
| `GET /api/public-teachers` | Panel proxy |
| `POST /api/teachers-sync` | HMAC sync ACK |
| `/ozel-ders/ogretmen/{slug}` | Detay |
| PayTR `teacher_slug` | tireli slug (`customer.teacherSlug`) |

## Environment

### Panel (dersonlinevipkocluk)

```
SITE_TEACHERS_WEBHOOK_URL=https://onlinevipdershane.com/api/teachers-sync
SITE_TEACHERS_WEBHOOK_SECRET=<aynı-uzun-secret>
```

### Site (onlinevipdershane)

```
KOCLUK_PANEL_URL=https://www.dersonlinevipkocluk.com
OZEL_DERS_WEBHOOK_SECRET=<mevcut>
SITE_TEACHERS_WEBHOOK_SECRET=<panel ile aynı>
```

## Test

1. Panel + site deploy + Redeploy (env sonrası)
2. Öğretmen profil doldur → onaya gönder → admin onay
3. Site `/ozel-ders#ogretmenler` → canlı kadro
4. `/ozel-ders/ogretmen/{slug}`
5. Ödeme → panelde `teacher_slug` tireli
