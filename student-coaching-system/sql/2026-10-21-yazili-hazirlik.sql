-- Yazılıya hazırlık: öğretmen PDF yükler, sınıfındaki öğrenci indirir.
-- 1. ve 2. dönem, her dönemde 1. ve 2. yazılı, her yazılıda 3 çalışma.

create table if not exists public.yazili_hazirlik_pdf (
  id uuid primary key default gen_random_uuid(),
  institution_id text,
  class_id text not null,
  teacher_user_id text not null,
  subject text not null,
  donem smallint not null,
  yazili smallint not null,
  calisma smallint not null,
  file_name text not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint yazili_hazirlik_pdf_raf_chk check (
    donem in (1, 2) and yazili in (1, 2) and calisma in (1, 2, 3)
  ),
  constraint yazili_hazirlik_pdf_raf_uniq unique (class_id, teacher_user_id, subject, donem, yazili, calisma)
);

create index if not exists yazili_hazirlik_pdf_class_idx
  on public.yazili_hazirlik_pdf (class_id, donem, yazili, calisma);
