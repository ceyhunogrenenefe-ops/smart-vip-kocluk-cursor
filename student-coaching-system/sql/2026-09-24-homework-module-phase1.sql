-- Ödev modülü 1. faz (2026-09-24) — üretimde uygulandı.
-- Geriye uyumlu: yalnız sütun / tablo EKLENİR. Hiçbir tablo düşürülmez, veri silinmez.

-- 1) Ödev kaydı: kurum, ders, konu, hedefler, kaynak, paylaşım
alter table public.edu_homework add column if not exists institution_id text;
alter table public.edu_homework add column if not exists subject_name text;
alter table public.edu_homework add column if not exists topic_key text;
alter table public.edu_homework add column if not exists topic_label text;
alter table public.edu_homework add column if not exists target_question_count integer;
alter table public.edu_homework add column if not exists target_minutes integer;
alter table public.edu_homework add column if not exists resource_url text;
alter table public.edu_homework add column if not exists share_token text;
alter table public.edu_homework add column if not exists share_expires_at timestamptz;
alter table public.edu_homework add column if not exists created_by text;

-- Mevcut ödevlerin kurumu ve dersi ders satırından doldurulur
update public.edu_homework h
   set institution_id = coalesce(h.institution_id, r.institution_id::text),
       subject_name   = coalesce(h.subject_name, r.subject_name)
  from public.edu_lesson_rows r
 where r.id = h.lesson_row_id
   and (h.institution_id is null or h.subject_name is null);

create index if not exists edu_homework_institution_idx
    on public.edu_homework (institution_id, due_date);

create unique index if not exists edu_homework_share_token_key
    on public.edu_homework (share_token)
 where share_token is not null;

-- 2) Teslim: çözülen soru, harcanan süre, "tamamladım" damgası
alter table public.edu_homework_submissions add column if not exists solved_question_count integer;
alter table public.edu_homework_submissions add column if not exists spent_minutes integer;
alter table public.edu_homework_submissions add column if not exists self_reported_at timestamptz;

-- 3) Haftalık plan satırı hangi ödevden doğdu (aynı ödev iki kez düşmesin)
alter table public.weekly_planner_entries add column if not exists homework_id uuid;

create unique index if not exists weekly_planner_entries_homework_student_key
    on public.weekly_planner_entries (student_id, homework_id)
 where homework_id is not null;

-- 4) Kurum bazlı modül anahtarı
create table if not exists public.institution_features (
  institution_id text primary key references public.institutions(id) on delete cascade,
  homework_module boolean not null default false,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.institution_features enable row level security;

-- TÜRKÇE UZMANI için modül açıldı (platform ve Ders & Koçluk kodda engellidir)
insert into public.institution_features (institution_id, homework_module, updated_by)
values ('f222d8bb-4d46-40b4-b78b-d7c1f1964af7', true, 'kurulum')
on conflict (institution_id) do update set homework_module = true, updated_at = now();
