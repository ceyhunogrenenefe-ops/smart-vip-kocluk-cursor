# Reklam videoları — kurumsal Paylaşılan Drive

Öğretmen dosyayı panel oturumuyla yükler. Sunucu, kurumun hizmet hesabıyla Google Drive API üzerinden Paylaşılan Drive’a yazar. Öğretmen Google’a giriş yapmaz, Drive üyesi olması gerekmez ve dosya herkese açılmaz.

Yeni teslim kişisel Drive bağlantısı olarak kaydedilmez. Drive doğrulaması başarılı olmadan görev “Ham Video Teslim Edildi” olmaz.

## 1. Veritabanı

Supabase SQL Editor’de bir kez çalıştırın:

`sql/2026-11-28-reklam-videolari.sql`

## 2. Google Cloud

1. Kurumun Google Cloud projesinde Drive API’yi açın.
2. Bir hizmet hesabı oluşturun. Anahtarı JSON olarak indirin.
3. Paylaşılan Drive, Google Workspace planı ister. Hizmet hesabını bu sürücüye **İçerik yöneticisi** olarak ekleyin (üyeler → e-posta: `...iam.gserviceaccount.com`).
4. Ham videolar ve montajlar için hedef klasör açın. Klasör URL’sindeki kimlik `AD_VIDEO_FOLDER_ID` olur. İsterseniz ham ve montaj için ayrı klasör verin.
5. Paylaşılan Drive kimliği, sürücünün kök URL’sindedir (`AD_VIDEO_SHARED_DRIVE_ID`).

Dosyaları “bağlantısı olan herkes” diye paylaşmayın.

## 3. Vercel ortam değişkenleri

Production ortamına yazın, sonra yeniden deploy edin:

| Değişken | Anlam |
| --- | --- |
| `AD_VIDEO_SHARED_DRIVE_ID` | Kurumun Paylaşılan Drive kimliği |
| `AD_VIDEO_FOLDER_ID` | Hedef klasör. Ham ve montaj aynı klasördeyse yeter |
| `AD_VIDEO_RAW_FOLDER_ID` | İsteğe bağlı, yalnız ham videolar |
| `AD_VIDEO_EDIT_FOLDER_ID` | İsteğe bağlı, yalnız montajlar |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Hizmet hesabı JSON’unun tamamı |

JSON yerine şunlar da olur: `GOOGLE_SERVICE_ACCOUNT_EMAIL` ve `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (satır sonları `\n`).

Bu değerler tarayıcıya hiç gitmez. Panel, izleme için kısa ömürlü bilet üretir ve her istekte rolü yeniden kontrol eder.

`FFMPEG_BIN` tanımlı değilse telefon MOV/HEVC kaydı arşivde saklanır, tarayıcı önizlemesi “hazır” sayılmaz. Yüklemenin başarısı ile önizleme ayrı gösterilir.

## 4. Kurulum uyarısı

Bu değişkenler veya tablo yoksa `/reklam-videolari` sarı uyarı gösterir. Yükleme 503 döner ve başarılı teslim yazılmaz.

## 5. Kurgu ekibi

Yönetici sayfadan kişiyi kurgu ekibine ekler. `users.roles` içinde `kurgu` etiketi de aynı yetkiyi verir. Ham videoyu görev sahibi öğretmen, yönetici ve kurgu ekibi açar. Diğer öğretmenler yalnız yorumlara açılmış montajı görür.

## 6. Günlük özet

Vercel cron `0 6 * * *` (Türkiye saatiyle 09:00) `/api/cron/ad-video-digest` çağırır. Yöneticiye yeni ham teslimleri, inceleme bekleyen montajları ve geciken işleri bildirir. Aynı gün ikinci kez yazılmaz.
