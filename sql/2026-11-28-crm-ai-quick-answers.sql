-- AI asistan hazır cevapları: sık gelen mesajlara model çağırmadan cevap (token harcamaz).
create table if not exists public.crm_ai_quick_answers (
  id uuid primary key default gen_random_uuid(),
  institution_id text not null,
  patterns jsonb not null default '[]'::jsonb,
  answer text not null,
  first_message_only boolean not null default true,
  is_active boolean not null default true,
  hit_count integer not null default 0,
  last_hit_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_ai_quick_answers_inst_idx on public.crm_ai_quick_answers (institution_id) where is_active;

alter table public.crm_ai_quick_answers enable row level security;

-- Online VIP: Meta reklamından gelen hazır karşılama mesajı (en sık gelen ilk mesaj)
insert into public.crm_ai_quick_answers (institution_id, patterns, answer, first_message_only)
select '73323d75-eea1-4552-8bba-d50555423589',
  '["Merhaba! Bunun hakkında daha faza bilgi alabilir miyim?", "Merhaba! Bunun hakkında daha fazla bilgi alabilir miyim?", "Hello! Can I get more info on this?", "Merhaba, Online VIP Dershane hakkında bilgi almak istiyorum.", "Kurslarınız hakkında bilgi alabilir miyim"]'::jsonb,
  E'Merhaba, hoş geldiniz 😊\n\nOnline VIP Dershane; LGS, YKS ve 2-12. sınıflar için en fazla 10 kişilik küçük gruplarda canlı ders ve haftalık birebir koçluk veren bir online eğitim kurumudur.\n\nSize doğru bilgiyi verebilmem için öğrencinin kaçıncı sınıfta olduğunu öğrenebilir miyim?',
  true
where not exists (select 1 from public.crm_ai_quick_answers where institution_id = '73323d75-eea1-4552-8bba-d50555423589');
