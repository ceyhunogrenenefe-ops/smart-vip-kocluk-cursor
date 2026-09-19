-- FAZ 7: personele resmî Meta WhatsApp şablonu ile bildirim (yalnız ekleme)
alter table public.crm_settings add column if not exists staff_wa_enabled boolean not null default false;
alter table public.crm_settings add column if not exists staff_wa_admin_user_id text;
alter table public.crm_settings add column if not exists staff_wa_template_status text;
alter table public.crm_settings add column if not exists staff_wa_template_checked_at timestamptz;
alter table public.crm_settings add column if not exists staff_wa_template_error text;

alter table public.crm_user_assignments add column if not exists wa_alerts_enabled boolean not null default true;

create table if not exists public.crm_staff_alert_log (
  id uuid primary key default gen_random_uuid(),
  institution_id text,
  user_id text not null,
  event_type text not null,
  dedupe_key text not null unique,
  to_phone text,
  summary text,
  status text not null default 'pending',
  meta_message_id text,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists crm_staff_alert_log_user_idx on public.crm_staff_alert_log (user_id, created_at desc);
alter table public.crm_staff_alert_log enable row level security;

-- Kırmızı (30+ dk) uyarı yöneticisi: Doğan Aktürk
insert into public.crm_settings (institution_id, staff_wa_admin_user_id)
values ('73323d75-eea1-4552-8bba-d50555423589', 'b39225b7-5705-4d38-956f-ab1cc55dc5af')
on conflict (institution_id) do update set staff_wa_admin_user_id = excluded.staff_wa_admin_user_id;
