# Site: öğretmen puanı + yorumları (panel → vitrin)

## Kontrol sonucu

| Katman | Durum |
|--------|--------|
| Panel API `GET /api/public-teachers?slug=` | `average_rating`, `total_reviews`, `reviews[]` dönüyor |
| Site proxy `/api/public-teachers` | Aynı payload’ı iletiyor |
| Site UI (liste + profil) | **Eksikti** — kartta `rating: null`, profilde yorum yok |

Örnek (canlı): `dogan-akturk` → `average_rating: 5`, `total_reviews: 1`, 1 yorum.

## Bu paketteki düzeltme

| Dosya | Ne yapar |
|-------|----------|
| `assets/premium-teachers-ui.js` | Panel `average_rating` / `total_reviews` kart puanına yazılır |
| `assets/teacher-detail-ui.js` | Profilde puan + **Öğrenci ve veli yorumları** bölümü |
| `html/ozel-ders.html` | cache `?v=20260905r` |
| `html/ozel-ders-ogretmen.html` | cache `?v=20260905r` |

> Not: `assets/*` canlı production JS üzerine minimal yama. HTML dosyaları site `main` kaynaklı + cache bump.

## Uygula (`onlinevipdershane1`)

Bu Cloud Agent’ın GitHub token’ı site reposuna **push edemiyor** (403). Site tarafında:

```bash
SITE_ROOT=/path/to/onlinevipdershane1
PATCH_ROOT=/path/to/smart-vip-kocluk-cursor/site-patches/onlinevipdershane1

cp "$PATCH_ROOT/assets/premium-teachers-ui.js" "$SITE_ROOT/assets/premium-teachers-ui.js"
cp "$PATCH_ROOT/assets/teacher-detail-ui.js" "$SITE_ROOT/assets/teacher-detail-ui.js"
cp "$PATCH_ROOT/html/ozel-ders.html" "$SITE_ROOT/ozel-ders.html"
cp "$PATCH_ROOT/html/ozel-ders-ogretmen.html" "$SITE_ROOT/ozel-ders-ogretmen.html"

cd "$SITE_ROOT"
git checkout -b cursor/teacher-reviews-on-site-f243
git add assets/premium-teachers-ui.js assets/teacher-detail-ui.js ozel-ders.html ozel-ders-ogretmen.html
git commit -m "feat(site): panel öğretmen puanı ve yorumlarını vitrine yansıt"
git push -u origin HEAD
```

Vercel deploy sonrası: `https://onlinevipdershane.com/ozel-ders/ogretmen/dogan-akturk`
