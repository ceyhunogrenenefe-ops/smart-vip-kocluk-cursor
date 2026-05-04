-- AI sınav analizi kaydı (deterministik rakamlar + yorum metni alanları)
create table if not exists public.ai_exam_analysis (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students (id) on delete cascade,
  exam_id text null,
  institution_id text null references public.institutions (id) on delete set null,
  exam_type text not null check (exam_type in ('TYT', 'LGS', 'YOS')),
  total_net numeric(12, 4) not null,
  estimated_score numeric(12, 4),
  percentile_estimate numeric(12, 4),
  year_2025_comparison text null,
  year_2024_comparison text null,
  year_2023_comparison text null,
  strengths text null,
  weaknesses text null,
  recommendations text null,
  narrative_summary text null,
  computed_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now ()
);

create index if not exists idx_ai_exam_analysis_student_created on public.ai_exam_analysis (student_id, created_at desc);

comment on table public.ai_exam_analysis is 'AI Koç sınav sonrası deterministik rakam modeli ve metin çıktılar';
