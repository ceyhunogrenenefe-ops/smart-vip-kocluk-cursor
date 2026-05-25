-- PG14 / eski Supabase: UNIQUE NULLS NOT DISTINCT desteklenmez.
-- Ana migration 238. satırda hata aldıysanız önce bunu çalıştırın, sonra
-- 2026-05-31-corporate-cms.sql dosyasının RLS + seed bölümünden devam edin.

create table if not exists public.cms_forms (
  id uuid primary key default gen_random_uuid(),
  institution_id text references public.institutions (id) on delete cascade,
  name text not null,
  slug text not null,
  fields_json jsonb not null default '[]'::jsonb,
  whatsapp_phone text,
  webhook_url text,
  meta_lead_event text,
  email_to text,
  kvkk_required boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cms_menus_global_menu_key_uidx
  on public.cms_menus (menu_key)
  where institution_id is null;
create unique index if not exists cms_menus_inst_menu_key_uidx
  on public.cms_menus (institution_id, menu_key)
  where institution_id is not null;

create unique index if not exists cms_forms_global_slug_uidx
  on public.cms_forms (lower(slug))
  where institution_id is null;
create unique index if not exists cms_forms_inst_slug_uidx
  on public.cms_forms (institution_id, lower(slug))
  where institution_id is not null;
