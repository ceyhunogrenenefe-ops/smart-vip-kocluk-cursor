# Reklam Videoları — kurumsal Paylaşılan Drive

Öğretmen ve kurgu ekibi dosyayı panelden yükler. Google hesabına giriş, Drive üyeliği veya paylaşım ayarı gerekmez. Dosya, sunucudaki hizmet hesabıyla kurumun Paylaşılan Drive’ına yazılır. İzleme panel oturumuna bağlı kısa ömürlü biletle yapılır. Dosyalar herkese açık paylaşılmaz. Kişisel Drive bağlantısı yeni teslim olarak kabul edilmez.

## 1. Veritabanı

Supabase SQL Editor’de sırayla:

1. `sql/2026-11-28-ad-videos.sql` (modül tabloları, daha önce çalıştıysa atlanır)
2. `sql/2026-11-28-ad-videos-panel-izleme.sql` (ham / montaj, yorum, onay sürümü)

## 2. Google tarafı

1. Google Cloud’da bir hizmet hesabı oluşturun. Drive API açık olsun.
2. JSON anahtarını indirin. Bu anahtar tarayıcıya veya repoya konmaz.
3. Kurumun Paylaşılan Drive’ında bir klasör açın (örneğin `Reklam Videoları`).
4. Hizmet hesabının e-postasını bu Paylaşılan Drive’a **İçerik yöneticisi** olarak ekleyin. Kişisel Drive kotası kullanılmaz; klasör Paylaşılan Drive içinde olmalıdır.
5. Paylaşılan Drive kimliğini ve klasör kimliğini kopyalayın (adres çubuğundaki kimlik).

## 3. Sunucu ortamı (Vercel)

| Değişken | Zorunlu | Anlam |
| --- | --- | --- |
| `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` | Evet | Hizmet hesabı JSON’u, düz metin veya base64. Yalnız sunucuda durur. |
| `GOOGLE_DRIVE_IMPERSONATE_USER` | Hayır | Alan çapında yetki devri gerekiyorsa kullanıcı e-postası. |
| `APP_JWT_SECRET` | Evet | Panel oynatma bileti bununla imzalanır. Projede zaten vardır. |

Hizmet hesabı jetonu tarayıcıya gönderilmez. Yükleme, sunucunun açtığı devam ettirilebilir oturumla doğrudan Google’a gider. Kayıt, dosya hedef klasörde ve beklenen boyutta doğrulanmadan başarılı sayılmaz.

## 4. Panel ayarı

Yönetici → Reklam Videoları → Ayarlar:

- Doğrudan yüklemeyi açın.
- Paylaşılan Drive kimliği
- Hedef klasör kimliği
- Kurgu ekibi (montaj yükleyebilen kişiler)

“Drive bağlantısını test et” klasörün Paylaşılan Drive içinde göründüğünü söylemeli. Eksik bir parça varsa sayfanın üstünde kurulum uyarısı durur ve yükleme düğmesi çalışmaz.

## 5. Oynatma

MOV veya HEVC dosyası arşivde saklanır. Bu sunucuda ffmpeg yoktur; tarayıcı oynatamıyorsa önizleme “hazır değil” diye ayrıca gösterilir. Yüklemenin başarılı olması önizlemenin hazır olduğu anlamına gelmez. MP4 dosyası olduğu gibi oynatılır.

## 6. Eski bağlantılar

Daha önce yapıştırılmış kişisel Drive bağlantıları görev geçmişinde “eski kişisel bağlantı” olarak kalır. Kurum arşivi gibi gösterilmez ve panel oynatıcısına bağlanmaz. Öğretmen aynı görevden orijinal dosyayı yeniden yükleyebilir.
