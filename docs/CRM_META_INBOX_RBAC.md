# CRM Meta Inbox + RBAC

## Webhook (şirket hattı 0850 303 40 14)
- Primary: `GET|POST /api/meta/webhook`
- Alias: `GET|POST /api/webhooks/meta`
- Verify token env: `META_WEBHOOK_VERIFY_TOKEN` (veya `META_VERIFY_TOKEN`)
- Ingest: WhatsApp Cloud (`entry.changes.value.messages`) + Instagram DM (`object=instagram` messaging) + Instagram **gönderi yorumları** (`changes.field=comments|live_comments`) + Facebook Messenger (`object=page`)
- Her inbound WA / IG / FB mesajı → `registration_*` **ve** `crm_conversations` / `crm_messages`
- CTWA / IG / FB ad referral → `crm_conversations.ad_source_data`
- IG comment → `message_type=comment`, önizleme `[Gönderi yorumu] …`, `ad_source_data.source_type=instagram_comment`

## Instagram / Facebook DM (native Meta — Kommo köprüsü yok)
- Vercel Production token (WhatsApp token **değil**):
  - `INSTAGRAM_PAGE_ACCESS_TOKEN` veya `META_PAGE_ACCESS_TOKEN` (Page Access Token)
  - isteğe bağlı `META_PAGE_ID`, `META_IG_BUSINESS_ID`
- WhatsApp `META_WHATSAPP_TOKEN` IG/FB DM abone edemez; ayrı sayfa token kullanılır
- Bind: CRM → **Widgetler** (`/crm/widgetler`) — Kommo katalogu (WA / IG / FB / Telegram / chat / e-posta / lead ads / Google / form…)
- Instagram + Facebook + WhatsApp Cloud bağlanır; diğer kartlar Kommo listesinin karşılığı (sıradaki native bağlar)
- **Instagram gönderi yorumları** (`comments` / `live_comments`) CRM inbox’a düşer (Kommo comment bildiriminin native karşılığı)
- Alternatif: `GET /api/whatsapp-health?ensure_meta_social=1` veya Inbox → Hattı bağla
- OAuth: `GET /api/meta/facebook-oauth` · redirect URI `/crm/widgetler`
- Teşhis: `GET /api/whatsapp-health` → `meta_social_env.token_source` (token yazılmaz, yalnızca env adı + suffix)
- Login for Business config id `1784538625891317` Page ID değildir
- Hata **Invalid Scopes** (`pages_messaging`, `pages_manage_metadata`): SmartKocluk Login for Business uygulaması; bu izinler OAuth `scope=` satırında geçersiz. Yeni LfB config’in izin listesine ekleyin, config ID’yi Widgetler’de kaydedin.
- Hata **1349246** (`52570416778031`, `23850842047630381`): bu varlıklara admin değilsiniz. Yeni config’e eklemeyin; eski yapılandırmadan **Remove**. İşareti kaldırmak yetmez.

## Kommo (yalnızca hunı karşılaştırması — mesaj köprüsü değil)
- URL: `https://onlinevipdershane.kommo.com/`
- Account: **Online VIP Dershane** · id `33570279`
- Chat IG/FB Kommo’da durur; CRM inbox’a native Meta webhook ile gelir
- Meta yapılandırma / Login config: `1784538625891317` → `META_CONFIGURATION_ID` (1349246 verirse Widgetler’den yeni slim config kaydedin)

### Huniler
1. **Pipeline** (ana): Gelen → Düşünme → Görüşülüyor → İptal/ilgisiz → Takip → Tekrar aranacak → Arandı açmadı → Kazan/Kayıp
2. **SATIŞ SONRASI HİZMETLER**: Deneme dersi / Seminer / Özel ders / Grup / Kullanıcı bilgisi / Fatura
3. **BURSLULUK** + **WEBSİTESİ FORM** (id `13764288`, İlk Temas `106196664`) — Kommo’da durur; native CRM artık `POST /api/site-leads` ile aynı formları alır

### Kommo vs bizim CRM
| Kommo | Bizim sistem |
| --- | --- |
| GELEN LEADLER | Gelen Lead’ler (`new_lead`) |
| GÖRÜŞÜLÜYOR | Görüşülen Lead’ler |
| DÜŞÜNME AŞAMASINDA | Düşünülüyor (`considering`) |
| TAKİP / TEKRAR ARANACAK | `follow_up` / `postponed` |
| ARANDI AÇMADI | Kayıp nedeni `unreachable` |
| DENEME DERSİ AYARLANDI | `trial_lesson_scheduled` |
| Chat WA + Instagram **DM** | Inbox WA + IG + FB **DM** |
| Instagram **gönderi yorumu** bildirimi | Inbox IG `comments` / `live_comments` (`[Gönderi yorumu] …`) |
| Unsorted / üzerine al | Havuz + **Üzerime al** |
| İç not / şablon / etiket | not + hazır yanıt + **Meta onaylı WA şablonları** (`/` seçici) + `metadata.tags` |
| Görev | Kayıt Takibi görevleri |
| Yorum → otomatik Salesbot / DM otomasyonu | Henüz yok (manuel yanıt / pipeline) |

## Gönderim (CRM yanıt)
- `META_WHATSAPP_TOKEN` + `META_PHONE_NUMBER_ID` (0850 Cloud API phone number id)
- Panel kaydı: Ayarlar → Meta WhatsApp — CRM gönderimden önce DB’den yüklenir
- Alıcı telefon Meta formatında saklanır: `9055…` (05… otomatik normalize)
- Serbest metin: 24 saat penceresi içinde. Pencere kapalıysa onaylı **şablon** gerekir.
- Inbox sağ panel + mesaj kutusunda `/` : WABA’daki **APPROVED** şablonlar (Graph, 0850 phone WABA öncelikli). `{{1}}` / adlı değişkenler için alan açılır.
- WhatsApp: Cloud şablon API; başlık/görsel yoksa gövde metin olarak düşer (24s penceresi gerekir).
- Instagram / Facebook: aynı şablon gövdesi **DM metni** olarak gider (Kommo gibi).
- Inbox + pipeline **Mesajlar**: şablon seç → önizle → **Onayla ve gönder**. **Şablon ekle** Kommo tarzı (sol form / sağ önizleme) → Meta onaya.
- Inbox’tan şablon yazıp Meta’ya onaya gönderme: `POST create_meta_template` (gövde-only, UTILITY/MARKETING).
- Pipeline gönderim: `POST /api/registration-tracking?op=send-channel-message` + `template_name` / `template_params`.
- `GET /api/crm-inbox?op=list_meta_templates` · `POST send_message` + `template_name` / `template_language` / `template_params`

## Schema
Supabase SQL Editor (manuel):
1. `student-coaching-system/sql/2026-09-12-crm-inbox-rbac.sql`
2. `student-coaching-system/sql/2026-09-13-crm-facebook-notes.sql` (FB kanal + not + hazır yanıt)
3. (opsiyonel) `student-coaching-system/sql/2026-09-13-crm-wa-contact-normalize.sql`

Sosyal bağlama: `GET /api/whatsapp-health?ensure_meta_social=1`

Otomatik (Vercel’de `SUPABASE_DB_URL` / `DATABASE_URL` varsa):
- `GET /api/setup-crm-inbox-schema` (CRON_SECRET veya Vercel cron)
- `GET /api/whatsapp-health?crm_setup=1` (public — tablo kurmayı dener)
- Teşhis: `GET /api/whatsapp-health?crm_diag=1`

## Roles
- `crm_agent`: yalnızca `/crm/*` (inbox)
- Admin: `/crm` pipeline + `/crm/inbox` + `/crm/agents`

## Website formu (onlinevipdershane.com)
- `POST /api/site-leads` — CORS: `onlinevipdershane.com` (+ www). Telefon ile lead eşler / açar (`website_form` veya `website_form_ad`).
- Form metni pipeline **Mesajlar** + Gelen Kutusu’na iner (kanal WhatsApp kimliği = telefon; sonraki WA sohbet aynı karta bağlanır).
- İletişim, Sizi Arayalım, ücretsiz analiz (`op=submit`), UTM / `fbclid` reklam formu.
- Site script: `https://www.dersonlinevipkocluk.com/crm-site-lead.js` (mevcut `/api/iletisim` ve `/api/assessment` gönderimini kopyalar).
- Widgetler → **Website formu** kurulu; Kayıt Takibi’nde **Web** rozeti.
- Site yaması: `site-patches/onlinevipdershane1/APPLY-SITE-LEADS.md`

## APIs
- `/api/crm-inbox?op=list_conversations|list_messages|send_message|assign_conversation|take_conversation|set_tags|list_notes|add_note|list_canned|list_meta_templates|create_meta_template|poll|…`
- `/api/crm-admin?op=create_crm_user|promote_agent|demote_agent|list_agents`
- `/api/site-leads` — public website form ingest (GET ping / POST lead)

## Realtime
Client polls `/api/crm-inbox?op=poll` ~4s.
