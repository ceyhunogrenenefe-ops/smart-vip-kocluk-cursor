# Play Store yayın rehberi — VIP Koçluk

D-U-N-S gelene kadar bu listedeki maddeleri sırayla tamamlayın.

---

## Adım 1 — İmzalama anahtarı (keystore)

PowerShell:

```powershell
cd "C:\Users\ceyhu\Downloads\student-coaching-system (12)\student-coaching-system"
.\scripts\create-play-keystore.ps1
```

Script sonunda `android\keystore.properties` oluşur. **Keystore dosyasını ve şifreleri yedekleyin.**

---

## Adım 2 — Gizlilik sayfası (canlı URL)

Deploy sonrası Play Console’a yapıştırılacak adres:

**https://www.dersonlinevipkocluk.com/gizlilik**

Siteye deploy: repo root’tan `git push` (Vercel otomatik).

---

## Adım 3 — İmzalı AAB (yayın paketi)

```powershell
.\scripts\build-play-release.ps1
```

Çıktı:

`android\app\build\outputs\bundle\release\app-release.aab`

---

## Adım 4 — Mağaza görselleri

Klasör: `play-store-assets/` (ekran görüntülerinizi buraya koyun)

| Dosya | Boyut | Not |
|--------|--------|-----|
| `icon-512.png` | 512×512 | Play Console ikon |
| `feature-graphic.png` | 1024×500 | Öne çıkan grafik (önerilir) |
| `phone-1.png` … `phone-8.png` | min 320px kısa kenar | Giriş, panel, haftalık plan, deneme |

Telefonda uygulamayı açıp ekran görüntüsü almanız yeterli.

---

## Adım 5 — Play Console metinleri (kopyala-yapıştır)

### Uygulama adı
```
Online VIP Ders ve Koçluk
```

### Kısa açıklama (max 80 karakter)
```
Online VIP ders ve koçluk — haftalık plan, deneme ve analiz tek uygulamada.
```

### Uzun açıklama
```
Online VIP Ders ve Koçluk, öğrenci koçluk sürecinizi dijitalleştirir.

• Haftalık ders ve hedef planlama
• Deneme sonuçları ve analiz
• Koç–öğrenci takip paneli
• Konu ilerlemesi ve raporlar

Kurum, koç ve öğrenciler için tasarlanmıştır. Giriş bilgilerinizi koçunuzdan veya kurumunuzdan alın.

Destek: destek@smartkocluk.com
Web: https://www.dersonlinevipkocluk.com
Gizlilik: https://www.dersonlinevipkocluk.com/gizlilik
```

### Kategori
Eğitim

### İletişim e-postası
```
destek@smartkocluk.com
```

### Gizlilik politikası URL
```
https://www.dersonlinevipkocluk.com/gizlilik
```

### İnceleme notu (test hesabı)
```
Uygulama giriş gerektirir.

Test öğrenci:
E-posta: ogrenci@smartvip.com
Şifre: ogrenci123

Giriş sonrası Haftalık Plan ve Denemeler menülerini inceleyebilirsiniz.
```

---

## Adım 6 — Veri güvenliği (Play formu)

| Soru | Yanıt |
|------|--------|
| Veri toplanıyor mu? | Evet |
| E-posta, ad | Evet — hesap |
| Eğitim/performans verisi | Evet — uygulama işlevi |
| Veriler şifreleniyor mu? | Evet (HTTPS) |
| Kullanıcı silme talebi | destek@smartkocluk.com |

---

## Adım 7 — D-U-N-S gelince

1. [Google Play Console](https://play.google.com/console) → Kurumsal hesap (~25 USD)
2. D-U-N-S + şirket bilgileri (vergi kaydı ile aynı unvan/adres)
3. Uygulama oluştur → **Üretim** → `app-release.aab` yükle
4. Mağaza listesi + görseller + gizlilik URL
5. İncelemeye gönder

---

## Her güncellemede

1. `android/app/build.gradle` → `versionCode` +1, `versionName` güncelle
2. `npm run build:mobile` → `npx cap sync android`
3. `.\scripts\build-play-release.ps1`
4. Play Console → yeni sürüm → AAB yükle

---

## Paket bilgisi

| Alan | Değer |
|------|--------|
| applicationId | com.dersonlinevipkocluk.student |
| versionName | 1.0.0 |
| versionCode | 1 |
