-- Deneme sınav takvimi (9 / 10 / 11 / YKS) — yalnız ekleme
create table if not exists public.exam_calendar (
  id text primary key,
  level text not null check (level in ('9','10','11','yks')),
  publisher text not null,
  exam_no text,
  difficulty text,
  exam_date date not null,
  content text,
  source text,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);
create index if not exists exam_calendar_level_date_idx on public.exam_calendar (level, exam_date);
alter table public.exam_calendar enable row level security;

-- Başlangıç verisi: api/_lib/exam-calendar-seed.js (tablo boşsa /api/exam-calendar ilk çağrıda yükler)
