-- AI Ders Ajanları (RAG): ders bazlı ajan + PDF döküman + chunk embeddings + sohbet + kullanım
-- Çalıştırmadan ÖNCE pgvector eklentisini aktif edin:
--   Supabase Dashboard → Database → Extensions → "vector" -> Enable
-- Veya bu satırı tek başına çalıştırın (yetki gerekir):

create extension if not exists vector;

-- ─────────────────────────── AJAN ───────────────────────────
create table if not exists public.ai_agents (
  id text primary key default gen_random_uuid()::text,
  institution_id text references public.institutions (id) on delete set null,
  name text not null,
  subject text not null,
  grade_level text,
  description text,
  system_prompt text not null default 'Sen yardımcı bir ders koçusun. Türkçe cevap ver, adım adım açıkla, kaynak belirt.',
  model text not null default 'gpt-4o-mini',
  vision_model text not null default 'gpt-4o-mini',
  embedding_model text not null default 'text-embedding-3-small',
  is_active boolean not null default true,
  created_by text references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_agents_institution_idx on public.ai_agents (institution_id, is_active);

-- ─────────────────────────── DÖKÜMAN ───────────────────────────
create table if not exists public.ai_agent_documents (
  id text primary key default gen_random_uuid()::text,
  agent_id text not null references public.ai_agents (id) on delete cascade,
  title text not null,
  source_type text not null default 'pdf',
  file_hash text,
  page_count integer,
  total_chunks integer default 0,
  total_tokens integer default 0,
  status text not null default 'processing', -- processing | ready | failed
  error text,
  storage_path text,
  uploaded_by text references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_agent_documents_agent_idx on public.ai_agent_documents (agent_id, status);
create unique index if not exists ai_agent_documents_hash_unq
  on public.ai_agent_documents (agent_id, file_hash)
  where file_hash is not null;

-- ─────────────────────────── CHUNK + EMBEDDING ───────────────────────────
create table if not exists public.ai_agent_chunks (
  id bigserial primary key,
  agent_id text not null references public.ai_agents (id) on delete cascade,
  document_id text not null references public.ai_agent_documents (id) on delete cascade,
  page_no integer,
  chunk_index integer not null default 0,
  content text not null,
  token_estimate integer,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create index if not exists ai_agent_chunks_agent_idx on public.ai_agent_chunks (agent_id);
create index if not exists ai_agent_chunks_document_idx on public.ai_agent_chunks (document_id);
-- Vector benzerlik için HNSW (pgvector >= 0.5). Eklenti eski sürümse ivfflat'a düşer.
do $$
begin
  begin
    execute 'create index if not exists ai_agent_chunks_embedding_hnsw on public.ai_agent_chunks using hnsw (embedding vector_cosine_ops)';
  exception when others then
    execute 'create index if not exists ai_agent_chunks_embedding_ivf on public.ai_agent_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100)';
  end;
end$$;

-- ─────────────────────────── SOHBET ───────────────────────────
create table if not exists public.ai_agent_conversations (
  id text primary key default gen_random_uuid()::text,
  agent_id text not null references public.ai_agents (id) on delete cascade,
  user_id text references public.users (id) on delete set null,
  student_id text,
  title text,
  message_count integer not null default 0,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ai_agent_conversations_user_idx
  on public.ai_agent_conversations (user_id, last_message_at desc);

create table if not exists public.ai_agent_messages (
  id bigserial primary key,
  conversation_id text not null references public.ai_agent_conversations (id) on delete cascade,
  agent_id text not null references public.ai_agents (id) on delete cascade,
  role text not null check (role in ('system','user','assistant')),
  content text not null,
  image_url text,
  citations jsonb,
  prompt_tokens integer default 0,
  completion_tokens integer default 0,
  cost_usd numeric(10,6) default 0,
  model text,
  created_at timestamptz not null default now()
);

create index if not exists ai_agent_messages_conversation_idx
  on public.ai_agent_messages (conversation_id, created_at);

-- ─────────────────────────── KULLANIM / FATURA ───────────────────────────
create table if not exists public.ai_usage_logs (
  id bigserial primary key,
  agent_id text references public.ai_agents (id) on delete set null,
  user_id text references public.users (id) on delete set null,
  operation text not null,                  -- chat | embed | vision
  model text,
  prompt_tokens integer default 0,
  completion_tokens integer default 0,
  total_tokens integer default 0,
  cost_usd numeric(10,6) default 0,
  istanbul_date date not null default (timezone('Europe/Istanbul', now()))::date,
  istanbul_month text not null default to_char(timezone('Europe/Istanbul', now()), 'YYYY-MM'),
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_logs_month_idx on public.ai_usage_logs (istanbul_month);
create index if not exists ai_usage_logs_user_month_idx on public.ai_usage_logs (user_id, istanbul_month);
create index if not exists ai_usage_logs_agent_month_idx on public.ai_usage_logs (agent_id, istanbul_month);

-- Aylık limit (öğrenci başına chat) ve genel ayarlar
create table if not exists public.ai_settings (
  id integer primary key default 1 check (id = 1),
  student_monthly_chat_limit integer not null default 100,
  monthly_usd_budget numeric(10,2) not null default 50,
  updated_at timestamptz not null default now()
);

insert into public.ai_settings (id) values (1) on conflict (id) do nothing;

comment on table public.ai_agents is 'Ders bazlı RAG ajanları (Fizik Koçu, Matematik Koçu vb.)';
comment on table public.ai_agent_documents is 'Bir ajana yüklenmiş PDF/metin kaynakları';
comment on table public.ai_agent_chunks is 'PDF parçaları + embedding (pgvector)';
comment on table public.ai_usage_logs is 'OpenAI token kullanım ve maliyet takibi';
comment on table public.ai_settings is 'AI özelliği için genel ayarlar (öğrenci aylık mesaj limiti, USD bütçe)';
