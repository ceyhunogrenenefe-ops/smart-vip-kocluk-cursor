# Site UX: hızlı analiz popup + sticky ücretsiz deneme + mobil Başarılarımız

Bu paket `onlinevipdershane1` reposuna uygulanır (Cursor agent bu repoya push edemiyor).

## Ne değişir?

1. **Ücretsiz analiz popup** — masaüstü 45 sn → **18 sn**, scroll eşiği %60 → **%40**
2. **Sticky ÜCRETSİZ DENEME** (sol alt, WhatsApp benzeri) — “3 gün ücretsiz deneyin” → deneme dersi WA mesajı
3. **Mobil Başarılarımız** — program sayfalarında ve anasayfada menü açmadan chip

## Hızlı uygula

```bash
# onlinevipdershane1 kökünde (veya bu patch klasöründen kopyala)
SITE_ROOT=/path/to/onlinevipdershane1
PATCH_ROOT=/path/to/smart-vip-kocluk-cursor/site-patches/onlinevipdershane1

cp -a "$PATCH_ROOT/assets/." "$SITE_ROOT/assets/"
bash "$PATCH_ROOT/scripts/inject-float-scripts.sh" "$SITE_ROOT"

# Anasayfa mobil Başarılarımız chip (index.html içine) — html/index.html örnek alınabilir
# veya sadece assets yeterli: program-nav.js chip’i program sayfalarına basar;
# anasayfa için html/index.html’i SITE_ROOT/index.html ile değiştirin / birleştirin.

cd "$SITE_ROOT"
git checkout -b cursor/site-trial-basari-f243
git add -A
git commit -m "feat(site): hızlı analiz popup, sticky ücretsiz deneme, mobil Başarılarımız"
git push -u origin HEAD
# Vercel otomatik deploy
```

## Dosyalar

| Dosya | Rol |
|---|---|
| `assets/assessment-cta.js` | Popup gecikmesi 18sn |
| `assets/assessment.css` | Mobil sticky analiz bar |
| `assets/trial-float.js` / `.css` | Sol alt ÜCRETSİZ DENEME |
| `assets/wa-float.js` / `.css` | Sağ alt WhatsApp (canlıdan senkron) |
| `assets/program-nav.js` / `.css` | Mobil Başarılarımız chip |
| `assets/callback-ui.js` | Canlıdan senkron |
| `html/index.html` | Anasayfa chip + script include’lar |
| `html/lgs.html` | Örnek program sayfası include’lar |
| `scripts/inject-float-scripts.sh` | Tüm HTML’lere script ekler |

## Not

Canlıda `assessment-cta.js` / `wa-float.js` vardı ama git `main`’de yoktu. Bu paket onları da kalıcı hale getirir.
