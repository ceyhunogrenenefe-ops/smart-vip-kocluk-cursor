-- Öğretmen bazlı özel ders ücreti
--
-- GERİYE UYUMLU: yalnızca yeni sütun ve yeni tablo eklenir. Mevcut
-- öğretmen profilleri, ders programları, rezervasyonlar ve ödeme
-- kayıtları olduğu gibi kalır.
--
-- NULL ücret "bu öğretmen için ücret girilmedi" demektir, "ücretsiz"
-- demek değil. Ücreti girilmemiş öğretmen kurum varsayılanını kullanır.

-- 1) Öğretmen profiline ücret
alter table public.teacher_profiles
  add column if not exists private_lesson_fee_tl numeric;

alter table public.teacher_profiles
  add column if not exists private_lesson_fee_updated_at timestamptz;

alter table public.teacher_profiles
  add column if not exists private_lesson_fee_updated_by text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'teacher_profiles_private_fee_chk') then
    alter table public.teacher_profiles
      add constraint teacher_profiles_private_fee_chk
      check (private_lesson_fee_tl is null or private_lesson_fee_tl >= 0);
  end if;
end $$;

-- 2) Kurum varsayılanı — ücreti girilmemiş öğretmenler için
-- institution_id birincil anahtar: platform geneli satir '__platform__'
-- anahtariyla tutulur (NULL olamaz).
create table if not exists public.private_lesson_pricing_settings (
  institution_id text primary key,
  default_fee_tl numeric not null default 0,
  default_duration_min integer not null default 40,
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint private_lesson_pricing_fee_chk check (default_fee_tl >= 0),
  constraint private_lesson_pricing_duration_chk check (default_duration_min between 5 and 300)
);

-- 3) Rezervasyonda ÜCRET ANLIK GÖRÜNTÜSÜ
-- Sonradan yapılan ücret değişikliği geçmiş rezervasyonu etkilemesin diye
-- tutar rezervasyon anında yazılır. NULL = bu alan eklenmeden önce
-- oluşmuş eski rezervasyon; geçmişe dönük doldurulmaz.
alter table public.teacher_private_bookings
  add column if not exists price_tl numeric;

alter table public.teacher_private_bookings
  add column if not exists price_duration_min integer;

-- 'teacher' = öğretmenin kendi ücreti, 'default' = kurum varsayılanı
alter table public.teacher_private_bookings
  add column if not exists price_source text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'teacher_private_bookings_price_chk') then
    alter table public.teacher_private_bookings
      add constraint teacher_private_bookings_price_chk
      check (price_tl is null or price_tl >= 0);
  end if;
end $$;

create index if not exists teacher_profiles_private_fee_idx
  on public.teacher_profiles (private_lesson_enabled, private_lesson_fee_tl);
