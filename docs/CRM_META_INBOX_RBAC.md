# CRM Meta Inbox + RBAC

## Webhook (şirket hattı 0850 303 40 14)
- Primary: `GET|POST /api/meta/webhook`
- Alias: `GET|POST /api/webhooks/meta`
- Verify token env: `META_WEBHOOK_VERIFY_TOKEN` (veya `META_VERIFY_TOKEN`)
- Ingest: WhatsApp Cloud (`entry.changes.value.messages`) + Instagram DM (`object=instagram`) + Facebook Messenger (`object=page`)
- Her inbound WA / IG / FB mesajı → `registration_*` **ve** `crm_conversations` / `crm_messages`
- CTWA / IG / FB ad referral → `crm_conversations.ad_source_data`

## Instagram / Facebook DM (native Meta — Kommo köprüsü yok)
- **SmartKocluk-IG** Instagram Login app: `INSTAGRAM_APP_ID=1455769949705434` (Facebook App ID değildir; `client_credentials` çalışmaz)
- Secret: Vercel `INSTAGRAM_APP_SECRET` veya Inbox’tan kaydet (git’e yazılmaz)
- Yetki: Inbox → **Instagram ile bağla** → `GET /api/meta/instagram-oauth?start=1`
- Meta panelde Valid OAuth Redirect URI: `https://www.dersonlinevipkocluk.com/api/meta/instagram-oauth`
- Alternatif Page token: `INSTAGRAM_PAGE_ACCESS_TOKEN` / `META_PAGE_ACCESS_TOKEN`
- WhatsApp `META_WHATSAPP_TOKEN` IG/FB DM abone edemez
- Bind: `GET /api/whatsapp-health?ensure_meta_social=1` veya Inbox → Hattı bağla

## Kommo (yalnızca hunı karşılaştırması — mesaj köprüsü değil)
- URL: `https://onlinevipdershane.kommo.com/`
- Account: **Online VIP Dershane** · id `33570279`
- Chat IG/FB Kommo’da durur; CRM inbox’a native Meta webhook ile gelir
- Meta yapılandırma / Login config: `1784538625891317` → `META_CONFIGURATION_ID`

### Huniler
1. **Pipeline** (ana): Gelen → Düşünme → Görüşülüyor → İptal/ilgisiz → Takip → Tekrar aranacak → Arandı açmadı → Kazan/Kayıp
2. **SATIŞ SONRASI HİZMETLER**: Deneme dersi / Seminer / Özel ders / Grup / Kullanıcı bilgisi / Fatura
3. **BURSLULUK** + **WEBSİTESİ FORM** (id `13764288`, İlk Temas `106196664`) — siteden form buraya düşer

### Kommo vs bizim CRM
| Kommo | Bizim sistem |
| --- | --- |
| GELEN LEADLER | Gelen Lead’ler (`new_lead`) |
| GÖRÜŞÜLÜYOR | Görüşülen Lead’ler |
| DÜŞÜNME AŞAMASINDA | Düşünülüyor (`considering`) |
| TAKİP / TEKRAR ARANACAK | `follow_up` / `postponed` |
| ARANDI AÇMADI | Kayıp nedeni `unreachable` |
| DENEME DERSİ AYARLANDI | `trial_lesson_scheduled` |
| Chat WA + Instagram | Inbox WA + IG + FB |
| Unsorted / üzerine al | Havuz + **Üzerime al** |
| İç not / şablon / etiket | not + hazır yanıt + `metadata.tags` |
| Görev | Kayıt Takibi görevleri |

## Gönderim (CRM yanıt)
- `META_WHATSAPP_TOKEN` + `META_PHONE_NUMBER_ID` (0850 Cloud API phone number id)
- Panel kaydı: Ayarlar → Meta WhatsApp — CRM gönderimden önce DB’den yüklenir
- Alıcı telefon Meta formatında saklanır: `9055…` (05… otomatik normalize)

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

## APIs
- `/api/crm-inbox?op=list_conversations|list_messages|send_message|assign_conversation|take_conversation|set_tags|list_notes|add_note|list_canned|poll|…`
- `/api/crm-admin?op=create_crm_user|promote_agent|demote_agent|list_agents`

## Realtime
Client polls `/api/crm-inbox?op=poll` ~4s.
