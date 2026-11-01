-- Instagram yorum otomasyonu: birden fazla Instagram hesabı (HENÜZ UYGULANMADI).
--
-- Aynı kurumun ek Instagram işletme hesapları. Ana (birincil) hesap eskisi
-- gibi platform / kurum Meta ayarından gelir (META_PAGE_TOKEN, META_PAGE_ID,
-- META_IG_BUSINESS_ID, commerce_settings.meta veya crm_meta_connections);
-- bu tabloya yalnız EK hesaplar yazılır.
--
-- GERİYE UYUMLU: yalnız yeni tablo ve nullable sütunlar eklenir.
-- crm_comment_automations.ig_user_id NULL olan (mevcut) otomasyonlar yalnız
-- ana hesaba gelen yorumlarda çalışmaya devam eder.
--
-- GÜVENLİK: page_token yalnız sunucuda (service role) okunur; panele her
-- zaman maskeli döner. RLS açık ve politika yok → anon/authenticated
-- istemciler tabloya erişemez, service role RLS'yi atlar
-- (crm_comment_automations ile aynı düzen).

create table if not exists public.crm_instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  -- null = platform kurumu
  institution_id text,
  -- Instagram işletme hesabı kimliği (webhook entry.id ile aynı)
  ig_user_id text not null unique,
  ig_username text,
  -- Bağlı Facebook sayfası kimliği ve sayfa erişim anahtarı
  page_id text,
  page_token text,
  is_active boolean not null default true,
  last_verified_at timestamptz,
  last_verify_error text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_instagram_accounts_institution_idx
  on public.crm_instagram_accounts (institution_id);

alter table public.crm_instagram_accounts enable row level security;

-- Otomasyonun çalışacağı hesap. NULL = ana (birincil) hesap.
alter table public.crm_comment_automations
  add column if not exists ig_user_id text;

create index if not exists crm_comment_automations_ig_user_idx
  on public.crm_comment_automations (ig_user_id) where ig_user_id is not null;

-- Otomasyonun hangi hesaba gelen yorumda tetiklendiği
alter table public.crm_comment_automation_logs
  add column if not exists account_ig_user_id text;

create index if not exists crm_comment_automation_logs_account_idx
  on public.crm_comment_automation_logs (account_ig_user_id) where account_ig_user_id is not null;
