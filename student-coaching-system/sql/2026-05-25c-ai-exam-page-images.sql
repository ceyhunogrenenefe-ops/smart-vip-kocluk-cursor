-- AI Ders Ajanlari - sayfa goruntuleri (sorulardaki sekil/grafik/denklemler icin)

-- 1) Storage bucket (public)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ai-exam-pages',
  'ai-exam-pages',
  true,
  10485760, -- 10 MB
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do nothing;

-- 2) Bucket icin policy (service_role zaten bypass eder, anon icin read-only)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='ai_exam_pages_public_read'
  ) then
    create policy ai_exam_pages_public_read
      on storage.objects for select
      to public
      using (bucket_id = 'ai-exam-pages');
  end if;
end$$;

-- 3) Sayfa goruntuleri tablosu
create table if not exists public.ai_agent_pages (
  id bigserial primary key,
  agent_id text not null references public.ai_agents (id) on delete cascade,
  document_id text not null references public.ai_agent_documents (id) on delete cascade,
  page_no integer not null,
  image_url text not null,
  width integer,
  height integer,
  created_at timestamptz not null default now()
);

create unique index if not exists ai_agent_pages_unq
  on public.ai_agent_pages (document_id, page_no);
create index if not exists ai_agent_pages_agent_idx
  on public.ai_agent_pages (agent_id);

-- 4) Soruya goruntuyu denormalize et (hizli erisim icin)
alter table public.ai_exam_questions
  add column if not exists page_image_url text;
