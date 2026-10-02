-- Öğretmen hakedişi birim ücret varsayılanları.
-- Öğretmene özel tarife (teacher_payroll_rates) yoksa bu değerler kullanılır.
-- Kesinleşmiş hakedişler etkilenmez: teacher_payroll_settlements satırları
-- kullanılan birim ücretleri kendi içinde saklıyor, ücret sonradan değişse de
-- ödenmiş geçmiş ay aynı kalır.
-- Yalnız YENİ tablo ekler; mevcut hiçbir tabloya dokunmaz.

create table if not exists public.teacher_payroll_settings (
  id boolean primary key default true check (id),
  group_unit_price_tl numeric(12,2) not null default 700,
  private_unit_price_tl numeric(12,2) not null default 700,
  guidance_unit_price_tl numeric(12,2) not null default 200,
  updated_by text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

insert into public.teacher_payroll_settings (id, group_unit_price_tl, private_unit_price_tl, guidance_unit_price_tl)
values (true, 700, 700, 200)
on conflict (id) do nothing;
