# App Store yayın adımları (Mac olmadan)

Paket kimliği: `com.dersonlinevipkocluk.student` · Uygulama adı: **Online VIP Ders ve Koçluk**
Sürüm: 1.0.4 · iOS projesi: `student-coaching-system/ios` · Derleme: Codemagic (`codemagic.yaml`)

## 1) App Store Connect'te uygulama kaydı
1. https://appstoreconnect.apple.com → **Uygulamalarım → +** → Yeni uygulama.
2. Platform: iOS · Ad: Online VIP Ders ve Koçluk · Birincil dil: Türkçe.
3. Paket kimliği listede yoksa önce https://developer.apple.com/account/resources/identifiers → **+** → App IDs → App →
   Bundle ID (Explicit): `com.dersonlinevipkocluk.student`.
4. SKU: `onlinevip-student` (serbest metin, kullanıcı görmez).

## 2) App Store Connect API anahtarı (Codemagic bununla imzalar ve yükler)
1. App Store Connect → **Kullanıcılar ve Erişim → Entegrasyonlar → App Store Connect API**.
2. **+** ile anahtar oluşturun. Erişim: **App Manager**.
3. İndirilen `.p8` dosyasını saklayın (bir kez indirilir). Not edin: **Issuer ID**, **Key ID**.

## 3) Codemagic kurulumu
1. https://codemagic.io → GitHub ile giriş → `smart-vip-kocluk-cursor` deposunu ekleyin.
2. **Teams → Integrations → App Store Connect**: `.p8`, Key ID ve Issuer ID ile bağlantı ekleyin,
   adını **OnlineVIP ASC** koyun (codemagic.yaml bu adı kullanıyor).
3. **Environment variables** bölümünde `mobil_env` grubuna ekleyin (hepsi "secure"):
   - `VITE_API_BASE_URL` = https://www.dersonlinevipkocluk.com
   - `VITE_SUPABASE_URL` = (panelde kullandığınız Supabase URL)
   - `VITE_SUPABASE_ANON_KEY` = (Supabase anon anahtarı)
   Bu değerler bilgisayarınızdaki `student-coaching-system/.env.mobile` dosyasında duruyor.
4. **Start new build** → workflow: **iOS — TestFlight**.
5. Derleme biterse TestFlight'a otomatik yüklenir; e-posta ile bilgi gelir.

## 4) TestFlight
1. App Store Connect → TestFlight → derleme "İşleniyor" durumundan çıkınca test grubuna ekleyin.
2. **İhracat uyumluluğu** sorusu çıkar: uygulama yalnız HTTPS kullanıyor →
   "Uygulamanız şifreleme kullanıyor mu?" → **Evet, yalnızca standart şifreleme (HTTPS)** → muafiyet: **Evet**.
3. Kendi cihazınıza TestFlight'tan kurup giriş, canlı ders, deneme ve **Profilim → Hesabımı sil** akışını deneyin.

## 5) Mağaza bilgileri (App Store Connect → Uygulama → Dağıtım)
- **Ekran görüntüleri (zorunlu):** 6.9" veya 6.7" iPhone (1290×2796 ya da 1284×2778), en az 3 adet.
  iPad desteklenecekse 13" iPad (2064×2752) görselleri de gerekir.
- **Açıklama, anahtar kelimeler, destek URL'si:** https://www.dersonlinevipkocluk.com
- **Gizlilik politikası:** https://www.dersonlinevipkocluk.com/gizlilik
- **Hesap silme:** Uygulama içinde Profilim → Hesabımı sil; web: https://www.dersonlinevipkocluk.com/hesap-silme
- **Yaş sınırı:** 4+ (şiddet/uygunsuz içerik yok). Kullanıcılar arası mesajlaşma sorusuna "Evet" derseniz 12+ çıkabilir.
- **Uygulama Gizliliği (App Privacy):** toplanan veriler — ad, e-posta, telefon, kullanıcı kimliği,
  uygulama içi etkinlik, kullanıcı içeriği (mesaj/ödev). Amaç: uygulama işlevselliği. Reklam yok, izleme yok.

## 6) İnceleme notları (zorunlu — yoksa reddedilir)
Apple incelemecisi giriş yapamazsa uygulama reddedilir. "App Review Information" bölümüne:
- **Demo hesap:** Play testinde açtığınız test öğrenci hesabının e-postası ve şifresi.
- **Notlar (örnek metin):**
  > Uygulama bir özel öğretim kurumunun öğrenci panelidir. Hesaplar kurum tarafından oluşturulur.
  > Test hesabıyla giriş yapıp haftalık plan, canlı ders ve deneme ekranlarını görebilirsiniz.
  > Uygulama içinde satış veya dijital içerik satın alma yoktur.

## 7) Reddedilme riskleri ve aldığımız önlemler
- **3.1.1 (uygulama dışı satın alma):** iOS sürümünde Kitap Mağazası / sepet girişleri gizlendi.
  Android ve web tarafı değişmedi.
- **5.1.1(v) (hesap silme):** Uygulama içinde ve web sayfasında hesap silme talebi var.
- **2.1 (eksik demo hesap):** Yukarıdaki inceleme notlarını mutlaka doldurun.
- **4.2 (yetersiz işlevsellik):** Uygulama tam panel olduğu için sorun beklenmiyor.

## Sonraki sürümler
`student-coaching-system/ios/App/App.xcodeproj` içindeki `MARKETING_VERSION` değerini yükseltin
(örn. 1.0.5), Codemagic derleme numarasını kendisi artırır.
