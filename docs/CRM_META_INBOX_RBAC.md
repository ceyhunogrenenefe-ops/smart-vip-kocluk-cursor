# CRM Meta Inbox + RBAC

## Webhook (şirket hattı 0850 303 40 14)
- Primary: `GET|POST /api/meta/webhook`
- Alias: `GET|POST /api/webhooks/meta`
- Verify token env: `META_WEBHOOK_VERIFY_TOKEN` (veya `META_VERIFY_TOKEN`)
- Ingest: WhatsApp Cloud (`entry.changes.value.messages`) + Instagram DM (`object=instagram`) + Facebook Messenger (`object=page`)
- Her inbound WA / IG / FB mesajı → `registration_*` **ve** `crm_conversations` / `crm_messages`
- CTWA / IG / FB ad referral → `crm_conversations.ad_source_data`

## Kommo hesabı (gözlem, 2026-09-13)
- URL: `https://onlinevipdershane.kommo.com/`
- Account: **Online VIP Dershane** · id `33570279` · timezone `Europe/Istanbul` · hesap dili `en`
- Kullanıcı id `12041087` · arayüz dili `tr`
- İlk form girişi başarılı; ardından Kommo `oauth.force_password_reset` (şüpheli aktivite) ile kilitlemiş — e-postadaki sıfırlama linki şart.
- Kommo WABA’da ikinci `subscribed_app` (override yok). WA artık production webhook’a bağlı; IG/FB için Page token + `messages` aboneliği ayrı.

### Kommo vs bizim CRM
| Kommo | Bizim sistem |
| --- | --- |
| Omnichannel chat (WA / IG / FB / Telegram / e-posta) | WA çalışıyor; IG + FB DM webhook + gönderim |
| Unsorted / üzerine al | Havuz + **Üzerime al** + ajan atama |
| İç not | `crm_conversation_notes` |
| Hazır yanıt / şablon | `crm_canned_replies` |
| Etiket | konuşma `metadata.tags` |
| Pipeline / aşama | Kayıt Takibi hunisi (`/crm?rt_lead=`) |
| Görev / hatırlatma | Kayıt Takibi görevleri (lead kartı) |
| Salesbot / yayın | Meta şablon + yoklama WA (ayrı) |

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
