-- CRM: kurum içi (mevcut öğrenci / veli / personel) konuşma ve aday işareti.
-- İşaretliler gelen kutusunda ayrı sekmede durur; pipeline, dashboard ve günlük rapora girmez.
-- internal_reason: student_phone (otomatik) | manual (elle işaretlendi) | manual_unmarked (elle kaldırıldı, otomatik tekrar işaretlenmez)

alter table public.crm_conversations
  add column if not exists is_internal boolean not null default false,
  add column if not exists internal_reason text,
  add column if not exists internal_marked_by text,
  add column if not exists internal_marked_at timestamptz;

alter table public.registration_leads
  add column if not exists is_internal boolean not null default false,
  add column if not exists internal_reason text,
  add column if not exists internal_marked_by text,
  add column if not exists internal_marked_at timestamptz;

create index if not exists crm_conversations_internal_idx
  on public.crm_conversations (institution_id, is_internal, last_message_at desc);
create index if not exists registration_leads_internal_idx
  on public.registration_leads (institution_id, is_internal);

-- Geriye dönük: öğrenci / veli telefonlarıyla eşleşen takipteki adaylar ve WhatsApp konuşmaları
with phones as (
  select right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) k from public.students where deleted_at is null
  union
  select right(regexp_replace(coalesce(parent_phone, ''), '\D', '', 'g'), 10) from public.students where deleted_at is null
), keys as (
  select k from phones where length(k) = 10
)
update public.registration_leads l
set is_internal = true, internal_reason = 'student_phone', internal_marked_at = now()
where l.deleted_at is null
  and l.primary_status = 'tracking'
  and l.is_internal = false
  and right(regexp_replace(coalesce(l.normalized_phone, l.phone, ''), '\D', '', 'g'), 10) in (select k from keys);

with phones as (
  select right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) k from public.students where deleted_at is null
  union
  select right(regexp_replace(coalesce(parent_phone, ''), '\D', '', 'g'), 10) from public.students where deleted_at is null
), keys as (
  select k from phones where length(k) = 10
)
update public.crm_conversations c
set is_internal = true, internal_reason = 'student_phone', internal_marked_at = now()
where c.is_internal = false
  and (
    (c.channel = 'whatsapp' and right(regexp_replace(c.contact_identifier, '\D', '', 'g'), 10) in (select k from keys))
    or c.lead_id in (select id from public.registration_leads where is_internal = true)
  );
