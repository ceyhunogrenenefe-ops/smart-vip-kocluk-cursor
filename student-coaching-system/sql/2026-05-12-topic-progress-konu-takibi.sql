-- Konu Takibi senkronu: public.topic_progress (yoksa oluştur)
-- topic_id: uygulama deterministik UUID (öğrenci+ders+konu SHA-1 tabanlı)
-- notes: JSON {"v":1,"s":"ders","t":"konu","e":"opsiyonel-entry-id"}

create table if not exists public.topic_progress (
  id text primary key,
  student_id uuid not null references public.students (id) on delete cascade,
  topic_id text not null,
  status text not null default 'completed',
  completion_date timestamptz,
  notes text,
  institution_id uuid references public.institutions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint topic_progress_student_topic_unique unique (student_id, topic_id)
);

create index if not exists idx_topic_progress_student on public.topic_progress (student_id);

comment on table public.topic_progress is 'Konu Takibi: tamamlanan konular (çoklu tarayıcı senkronu).';

-- RLS: kurumunuza göre uyarlayın; örnek yorum.
-- alter table public.topic_progress enable row level security;
