# CRM Meta Inbox + RBAC

## Webhook (şirket hattı 0850 303 40 14)
- Primary: `GET|POST /api/meta/webhook`
- Alias: `GET|POST /api/webhooks/meta`
- Verify token env: `META_WEBHOOK_VERIFY_TOKEN` (veya `META_VERIFY_TOKEN`)
- Ingest: WhatsApp Cloud (`entry.changes.value.messages`) + Instagram DM (`entry.messaging`)
- Her inbound WA/IG mesajı → `registration_*` **ve** `crm_conversations` / `crm_messages`
- CTWA / IG ad referral → `crm_conversations.ad_source_data`

## Gönderim (CRM yanıt)
- `META_WHATSAPP_TOKEN` + `META_PHONE_NUMBER_ID` (0850 Cloud API phone number id)
- Panel kaydı: Ayarlar → Meta WhatsApp — CRM gönderimden önce DB’den yüklenir
- Alıcı telefon Meta formatında saklanır: `9055…` (05… otomatik normalize)

## Schema
Supabase SQL Editor:
1. `student-coaching-system/sql/2026-09-12-crm-inbox-rbac.sql`
2. (opsiyonel) `student-coaching-system/sql/2026-09-13-crm-wa-contact-normalize.sql`

## Roles
- `crm_agent`: yalnızca `/crm/*` (inbox)
- Admin: `/crm` pipeline + `/crm/inbox` + `/crm/agents`

## APIs
- `/api/crm-inbox?op=list_conversations|list_messages|send_message|assign_conversation|poll|…`
- `/api/crm-admin?op=create_crm_user|promote_agent|demote_agent|list_agents`

## Realtime
Client polls `/api/crm-inbox?op=poll` ~4s.
