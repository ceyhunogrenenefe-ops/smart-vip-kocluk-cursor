-- Web sitesinden (onlinevipdershane.com) gelen premium özel ders talepleri / siparişleri
create table if not exists public.ozel_ders_talepleri (
  id text primary key default gen_random_uuid()::text,
  merchant_oid text unique,
  status text not null default 'pending',
  parent_name text,
  phone text,
  email text,
  student_info text,
  teacher_slug text,
  package_id text,
  package_title text,
  amount_kurus bigint,
  source text default 'onlinevipdershane.com',
  notes text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ozel_ders_talepleri_status_idx
  on public.ozel_ders_talepleri (status, created_at desc);

create index if not exists ozel_ders_talepleri_merchant_oid_idx
  on public.ozel_ders_talepleri (merchant_oid);

comment on table public.ozel_ders_talepleri is
  'Web sitesi özel ders satış/talep kayıtları — durumlar: pending, paid, contacted, enrolled, cancelled';
