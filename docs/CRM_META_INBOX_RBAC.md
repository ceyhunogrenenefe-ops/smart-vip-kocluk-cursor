# CRM Meta Inbox + RBAC

## Webhook
- Primary: `GET|POST /api/meta/webhook` (existing)
- Alias: `GET|POST /api/webhooks/meta`
- Verify token env: `META_WEBHOOK_VERIFY_TOKEN` (or `META_VERIFY_TOKEN`)
- Ingests WhatsApp Cloud (`entry.changes.value.messages`) and Instagram DM (`entry.messaging`)
- Referral / CTWA / IG ad metadata → `crm_conversations.ad_source_data`
- Also mirrors into registration lead messages (existing) + `crm_*` tables

## Schema
Run in Supabase SQL Editor:
`student-coaching-system/sql/2026-09-12-crm-inbox-rbac.sql`

Tables: `crm_conversations`, `crm_messages`, `crm_user_assignments`

## Roles
- `crm_agent`: isolated UI under `/crm/*` only (inbox). No billing/settings.
- Admins (`super_admin` / `admin`): `/crm` pipeline + `/crm/inbox` + `/crm/agents`
- Promote coaches or create CRM-only users via `/crm/agents` → `POST /api/crm-admin`

## APIs
- `/api/crm-inbox?op=list_conversations|list_messages|send_message|assign_conversation|poll|…`
- `/api/crm-admin?op=create_crm_user|promote_agent|demote_agent|list_agents`

## Realtime
Client polls `/api/crm-inbox?op=poll` every ~4s (no WebSocket dependency).
