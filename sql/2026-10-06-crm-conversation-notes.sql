-- Gelen kutusu konuşma notları.
--
-- Kod bu tabloyu okuyup yazıyordu ama tablo hiç oluşturulmamıştı: not ekleme
-- 500 veriyor, listeleme ise hatayı yutup boş dönüyordu. Yani gelen kutusunda
-- alınan notlar hiçbir zaman kaydedilmedi.
--
-- author_user_id TEXT: bu veritabanında users.id text ve bir kısmı
-- "user-1777..." biçiminde; uuid olsaydı o kullanıcılar not ekleyemezdi.

create table if not exists public.crm_conversation_notes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.crm_conversations(id) on delete cascade,
  author_user_id text,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists ccn_conversation_idx
  on public.crm_conversation_notes (conversation_id, created_at desc);
