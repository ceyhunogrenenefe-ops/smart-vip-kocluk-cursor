# Site UX: hızlı analiz popup + sticky ücretsiz deneme + mobil Başarılarımız

Bu paket `onlinevipdershane1` reposuna uygulanır.

## cursor[bot] 403 — bu ajan neden “görmüyor”?

Bu Cloud Agent’ın `gh` token’ı **installation + selected** ve yalnızca şunu listeliyor:

- `ceyhunogrenenefe-ops/smart-vip-kocluk-cursor`

`GET /installation/repositories` → `total_count: 1`, `repository_selection: selected`.
`onlinevipdershane1` için `push/pull` hepsi `false`. Push: `Permission denied to cursor[bot]` (403).

Cursor.com / Applications ekranında kutu işaretlemek **bu koşunun token’ını yenilemez**. Token run başında `smart-vip-kocluk-cursor` için basılır; ikinci repo bu token’a eklenmez.

Eskiden 403 yoktu çünkü App **All repositories** (veya sitede de seçili) idi; 4 Ağustos site commit’leri `cursor[bot]` ile gitmiş. Sonra App “Only select repositories” + sadece panel reposu kalmış.

**Bu token’ın göreceği tek düzeltme:** GitHub Installed App **Cursor** (`cursor[bot]`, OAuth değil) → **All repositories** *veya* `onlinevipdershane1` işaretli + **Save**. Sonra **yeni** bir Cloud Agent’ı `onlinevipdershane1` üzerinden açmak (bu sohbet aynı token ile kalır).

Hazır komut (token yazabilir olunca):

```bash
bash site-patches/onlinevipdershane1/scripts/push-when-allowed.sh
```

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
