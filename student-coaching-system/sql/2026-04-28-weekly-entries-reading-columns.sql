-- Haftalik Takip kitap alanlari icin migration
-- Supabase SQL Editor'de bir kez calistirin.

alter table if exists public.weekly_entries
  add column if not exists reading_minutes integer,
  add column if not exists book_id text,
  add column if not exists book_title text;

comment on column public.weekly_entries.reading_minutes is 'Haftalik takipte girilen okunan sayfa degeri';
comment on column public.weekly_entries.book_id is 'Okunan kitap id (opsiyonel)';
comment on column public.weekly_entries.book_title is 'Okunan kitap adi (opsiyonel)';
