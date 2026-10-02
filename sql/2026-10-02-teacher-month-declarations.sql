-- Öğretmen aylık çalışma beyanı — yalnız YENİ tablolar ekler.
-- Mevcut ders, hakediş, kullanıcı ve mesaj tablolarına dokunulmaz.
-- Supabase'e "teacher_month_declarations" adıyla uygulanmıştır; bu dosya
-- depodaki izlenebilir kopyadır.

create table if not exists public.teacher_month_declarations (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid,
  teacher_id uuid not null,
  period_month date not null,
  status text not null default 'pending'
    check (status in ('pending','opened','submitted','reopened')),
  token text not null unique,
  token_expires_at timestamptz,
  opened_at timestamptz,
  submitted_at timestamptz,
  edit_allowed boolean not null default false,
  edit_allowed_by uuid,
  edit_allowed_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teacher_id, period_month)
);
create index if not exists tmd_period_idx on public.teacher_month_declarations (period_month);
create index if not exists tmd_status_idx on public.teacher_month_declarations (status);

create table if not exists public.teacher_declaration_lines (
  id uuid primary key default gen_random_uuid(),
  declaration_id uuid not null
    references public.teacher_month_declarations(id) on delete cascade,
  kind text not null
    check (kind in ('group','private','guidance','etut','yazili','telafi','deneme','arama','other')),
  class_id uuid,
  student_id uuid,
  label text,
  quantity numeric(10,2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists tdl_declaration_idx on public.teacher_declaration_lines (declaration_id);
create index if not exists tdl_kind_idx on public.teacher_declaration_lines (kind);

create table if not exists public.teacher_declaration_messages (
  id uuid primary key default gen_random_uuid(),
  declaration_id uuid not null
    references public.teacher_month_declarations(id) on delete cascade,
  kind text not null default 'initial' check (kind in ('initial','reminder')),
  channel text,
  sent_at timestamptz not null default now(),
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists tdm_declaration_idx on public.teacher_declaration_messages (declaration_id);

create table if not exists public.teacher_declaration_settings (
  id boolean primary key default true check (id),
  is_active boolean not null default false,
  reminder_days integer[] not null default '{1,3,5}',
  message_text text,
  form_base_url text,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
insert into public.teacher_declaration_settings (id) values (true) on conflict (id) do nothing;
