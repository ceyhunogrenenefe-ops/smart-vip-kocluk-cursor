# Online Coaching Meeting System — kurulum

Bu belge, projeye eklenen **Google Meet (Calendar API)** + **Supabase** + **Vercel serverless** + **Twilio WhatsApp** görüşme modülünü canlıya almak için özet adımları içerir.

## 1) Supabase SQL

`student-coaching-system/sql/2026-05-01-meetings-integration.sql` dosyasını Supabase **SQL Editor** üzerinden çalıştırın. Şunları oluşturur / günceller:

- `integrations_google` (koç kullanıcısına bağlı yenileme / erişim belirteci alanları; sunucuda şifreleme kullanılıyorsa DB’de şifreli metin)
- `meetings` (meet link, zaman aralığı, durum, notlar, `attended`, `ai_summary`)
- `meeting_notification_log` (WhatsApp denemesi, SID, yeniden deneme / log)
- İsteğe bağlı `students.user_id` sütunu (auth ile eşleme)

## 2) Google Cloud — OAuth ve Calendar API

1. [Google Cloud Console](https://console.cloud.google.com/) → yeni veya mevcut proje → **APIs & Services** → **Enable APIs** → **Google Calendar API** açın.
2. **Credentials** → **Create credentials** → **OAuth client ID** → Application type **Web application**.
3. **Authorized redirect URIs** içine tam callback URL’nizi yazın:

   `https://<production-domain>/api/google/callback`

   Yerelde `vercel dev` kullanıyorsanız örnek: `http://localhost:3000/api/google/callback`.

4. OAuth onay ekranında kullanıcı türünü seçin (**External** yaygın kullanımdır).
5. Oluşturulan **Client ID** ve **Client secret**’i Vercel ortam değişkenlerinde kullanın (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).

**Önemli:** Meet konferansını oluşturmak için oluşturduğunuz kullanıcıda Google Workspace / kişisel hesapta Takvim özelliği kullanılabilir olmalıdır (`calendar.events` kapsamı yeterli).

Koçun platformdaki kullanıcı e-postası ile `coaches.email` **aynı** olmalıdır; API, takvim bağlantısını `users(id)` ile eşlemek için buna güvenir.

## 3) Ortam değişkenleri (önerilen yapı)

| Değişken | Nerede | Açıklama |
|----------|--------|----------|
| `SUPABASE_URL` | Vercel (server) | Proje URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (server) | **Sunucuda** liste / yazma işlemleri için (asla frontend’de kullanmayın). |
| `APP_JWT_SECRET` | Vercel | Güçlü sırrın; kullanıcı JWT’si ve Google OAuth `state`. |
| `GOOGLE_CLIENT_ID` | Vercel | OAuth istemci |
| `GOOGLE_CLIENT_SECRET` | Vercel | OAuth sırrı |
| `GOOGLE_REDIRECT_URI` | Vercel | Callback ile birebir aynı tam URL (`https://.../api/google/callback`). |
| `INTEGRATIONS_GOOGLE_NO_USER_FK` | Vercel | Opsiyonel `1`: SQL ile `integrations_google_user_id_fkey` kaldırıldıktan sonra demo JWT veya users’ta olmayan `sub` ile Google bağlantısı denemelerinde sunucunun users kontrolünü atlar. **Üretimde çoğu kurulumda boş bırakın** (FK + gerçek kullanıcı). |
| `FRONTEND_APP_URL` | Vercel | Örn. `https://app.example.com` — OAuth sonrası yönlendirme. Yerelde `http://localhost:5173` veya hangi port ise. |
| `MEETING_TOKEN_ENCRYPTION_KEY` | Vercel | **Önerilir:** uzun güçlü parola ya da hex 64+ üzerinden türetilen anahtar; Google refresh/access belirtecini DB’de şifler. Yoksa uyarıyla düz metin saklanır. |
| `TWILIO_ACCOUNT_SID` | Vercel | Twilio konsolundan |
| `TWILIO_AUTH_TOKEN` | Vercel | Twilio konsolundan |
| `TWILIO_WHATSAPP_FROM` | Vercel | Örn. `whatsapp:+14155238886` (sandbox) veya onaylı üretim numarası. |
| `MEETING_CRON_SECRET` | Vercel | Cron endpoint’inin `Authorization: Bearer <aynı sırr>` ile tetiklanması için; projede doğrulanır (Vercel ek başlığı varsa bazı doğrulamalar gevşekleşmez). Cron isteği Vercel’den geldiğinde `x-vercel-cron` doğrulanır. |

Tarayıcı (Vite) için mevcut gibi:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 4) Uç noktalar

| Method | Route | Özet |
|--------|-------|------|
| POST | `/api/google/oauth` | Bearer JWT ile OAuth URL döner (`authUrl`). |
| GET | `/api/google/callback` | Kod değişimi + `integrations_google` kaydı; `FRONTEND_APP_URL/meetings?...`. |
| GET | `/api/google/oauth` | Mevcut kullanıcı bağlı mı (`connected`). |
| POST | `/api/meetings?op=create` | Takvim olayı + Meet + DB + oluşturma WhatsApp mesajı. |
| GET | `/api/meetings?op=list` | Rol filtrelemeli liste (`from`, `to`, `status`). |
| POST | `/api/meetings?op=update-status` | `status`, `notes`, `attended`, `ai_summary`. |

Not: Bu uçların birleştirilmesinin nedeni Vercel Hobby’daki **en fazla 12 serverless fonksiyon** sınırıdır.
| GET/POST | `/api/cron/meeting-reminders` | Yaklaşan görüşmeler için 10 dk WhatsApp (+ başarısız kayıtlar için sınırlı yeniden deneme). |
| GET | `/api/twilio` | (super_admin / admin) Twilio ortamı özet — sırlar döndürülmez. |
| POST | `/api/twilio` | (aynı roller) Test WhatsApp — body `{ "to": "90555...", "message": "..." }`; yalnızca Vercel `TWILIO_*` kullanır. |
| GET/POST | `/api/cron/daily-tracking-reminders` | Günlük takipte bugün için çözülen soru toplamı 0 olan öğrencilere WhatsApp (İstanbul saati + env). |

### Günlük soru hatırlatması (cron)

1. Supabase SQL: `student-coaching-system/sql/2026-tracking-reminder-log.sql` çalıştırın.
2. Vercel env örneği:
   - `TRACKING_REMINDER_ENABLED=true`
   - `TRACKING_REMINDER_HOUR_TR=22` (İstanbul; endpoint her çağrıda kontrol edilir — cron’u her saat veya sadece 22’de tetikleyebilirsiniz)
   - `TRACKING_REMINDER_MESSAGE_TR` (isteğe bağlı; `{name}` yer tutucusu)
   - `TRACKING_REMINDER_PREFER_PARENT=true` (isteğe bağlı)
   - `TRACKING_REMINDER_SKIP_WEEKENDS=true` (isteğe bağlı)
   - `TRACKING_REMINDER_INSTITUTION_ID` — yalnızca bir kurum (isteğe bağlı)
   - `TRACKING_REMINDER_CRON_SECRET` — yoksa `MEETING_CRON_SECRET` / `CRON_SECRET` kullanılır
3. Zamanlayıcı: [cron-job.org](https://cron-job.org) ile `GET https://<domain>/api/cron/daily-tracking-reminders` — örn. her gün 22:00 İstanbul (UTC karşılığına dikkat). Header: `Authorization: Bearer <aynı sırra>`.

## 5) Hatırlatmalar (cron)

**Vercel Hobby:** Günlük tek cron sınırı olduğu için bu repoda `vercel.json` içinde tanımlı Vercel Cron **yoktur** (aksi halde deploy reddedilir).

**Seçenekler:**

1. **Vercel Pro** — `vercel.json` içine tekrar şunu ekleyebilirsiniz:

   ```json
   "crons": [{ "path": "/api/cron/meeting-reminders", "schedule": "*/5 * * * *" }]
   ```

2. **Harici tetikleyici** (ücretsiz seçenek): [cron-job.org](https://cron-job.org) vb. ile **her 5 dakikada** `GET` veya `POST` isteği gönderin:

   `https://<domain>/api/cron/meeting-reminders`  
   Header: `Authorization: Bearer <MEETING_CRON_SECRET veya CRON_SECRET>`

Vercel’den gelen isteklerde `x-vercel-cron: 1` başlığı doğrulanırsa ek sıra gerekmez.

## 6) Twilio WhatsApp

- **Sandbox:** Twilio Sandbox’a katılım linki ile test numaranız bağlanır; üretmeden önce canlı için **Approved WhatsApp Sender** şartlıdır ve çoğu bölgede şablon (template) gerekebilir. Bu POC gövdesi doğrudan `body` kullanır; üretimde Twilio Messaging API Content / şablonlara uyum gerekebilir.
- Öğrenci cep telefonu için `students.phone` veya `parent_phone`; yoksa e-postayı `users` ile eşlemeye çalışır.

## 7) Güvenlik notları

- `api/meetings/*` ve `/api/google/*` uçları **anonim Bearer olmadan** çalışmaz (`requireAuthenticatedActor`).
- Eski bazı api’lar hâlâ `requireAuth` demo modunda JWT’siz süper-admin davranışı gösterebilir; kritik özellikler için bu güncelleme sıkı doğrulamayı seçti.
- `SUPABASE_SERVICE_ROLE_KEY` hiçbir zaman istemci bundle’ına girmemelidir.

## 8) Arayüz

- Koç / Admin / Süper Admin: `/meetings`
- Öğrenci: `/student-meetings`
