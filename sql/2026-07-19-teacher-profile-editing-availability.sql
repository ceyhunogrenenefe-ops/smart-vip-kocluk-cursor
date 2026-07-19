-- Öğretmen vitrin: düzenleme yetkisi, durum genişletme, soft delete alanları, müsaitlik + rezervasyon
-- Mevcut teacher_profiles / published_snapshot korunur. Veri silinmez.

-- 1) Durum CHECK: update_pending (+ geriye uyum changes_pending), deleted
alter table public.teacher_profiles drop constraint if exists teacher_profiles_status_check;
alter table public.teacher_profiles
  add constraint teacher_profiles_status_check check (status in (
    'draft', 'incomplete', 'pending_approval', 'published',
    'changes_pending', 'update_pending', 'rejected', 'passive', 'deleted'
  ));

update public.teacher_profiles
set status = 'update_pending'
where status = 'changes_pending';

-- 2) Düzenleme yetkisi + audit meta alanları
alter table public.teacher_profiles
  add column if not exists editing_enabled boolean not null default true,
  add column if not exists editing_enabled_at timestamptz,
  add column if not exists editing_enabled_by text references public.users(id) on delete set null,
  add column if not exists editing_deadline timestamptz,
  add column if not exists last_submitted_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by text references public.users(id) on delete set null,
  add column if not exists passivated_at timestamptz,
  add column if not exists passivated_by text references public.users(id) on delete set null,
  add column if not exists passivation_reason text,
  add column if not exists deleted_by text references public.users(id) on delete set null;

-- Yayındaki / onay bekleyenlerde düzenleme kapalı (ilk kez doldurma incomplete/draft açık kalır)
update public.teacher_profiles
set editing_enabled = false
where status in ('published', 'pending_approval', 'update_pending', 'passive', 'deleted')
  and editing_enabled = true
  and published_snapshot is not null;

-- submitted_at varsa last_submitted_at doldur
update public.teacher_profiles
set last_submitted_at = submitted_at
where submitted_at is not null and last_submitted_at is null;

-- 3) Dual-version alias kolonları (mevcut snapshot korunur; pending_data opsiyonel önbellek)
alter table public.teacher_profiles
  add column if not exists pending_data jsonb;

comment on column public.teacher_profiles.published_snapshot is
  'approved_data: sitede gösterilen son onaylı profil';
comment on column public.teacher_profiles.pending_data is
  'Onaya gönderilen bekleyen profil (revizyon payload ile uyumlu)';

-- 4) Haftalık müsaitlik
create table if not exists public.teacher_availability (
  id text primary key default gen_random_uuid()::text,
  teacher_id text not null references public.users(id) on delete cascade,
  profile_id text references public.teacher_profiles(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0=Pazar ... 6=Cumartesi (JS)
  start_time time not null,
  end_time time not null,
  slot_duration_min int not null default 60 check (slot_duration_min in (30, 45, 60, 90, 120)),
  is_active boolean not null default true,
  timezone text not null default 'Europe/Istanbul',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time < end_time OR (end_time = time '00:00' AND start_time > time '00:00'))
);

create index if not exists teacher_availability_teacher_idx
  on public.teacher_availability (teacher_id, day_of_week)
  where is_active = true;

-- 5) Tarih istisnaları
create table if not exists public.teacher_availability_exceptions (
  id text primary key default gen_random_uuid()::text,
  teacher_id text not null references public.users(id) on delete cascade,
  profile_id text references public.teacher_profiles(id) on delete cascade,
  exception_date date not null,
  start_time time,
  end_time time,
  exception_type text not null check (exception_type in ('available', 'unavailable')),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists teacher_availability_exceptions_teacher_date_idx
  on public.teacher_availability_exceptions (teacher_id, exception_date);

-- 6) Özel ders rezervasyon slotları (koçluk derslerinden bağımsız)
create table if not exists public.teacher_private_bookings (
  id text primary key default gen_random_uuid()::text,
  teacher_id text not null references public.users(id) on delete cascade,
  profile_id text references public.teacher_profiles(id) on delete set null,
  student_name text,
  student_email text,
  student_phone text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed'
    check (status in ('held', 'confirmed', 'cancelled', 'completed')),
  source text not null default 'site',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

-- Çift rezervasyon: aynı öğretmen + aynı başlangıç için tek aktif kayıt
create unique index if not exists teacher_private_bookings_unique_slot
  on public.teacher_private_bookings (teacher_id, starts_at)
  where status in ('held', 'confirmed');

create index if not exists teacher_private_bookings_teacher_range_idx
  on public.teacher_private_bookings (teacher_id, starts_at, ends_at)
  where status in ('held', 'confirmed');
