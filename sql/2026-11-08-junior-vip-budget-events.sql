-- Junior VIP: aylık toplam yapay zekâ bütçesi (15 USD) + hata/geri bildirim olayları.
-- Supabase SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak güvenlidir (IF NOT EXISTS / OR REPLACE).
--
-- Bütçe tüm Junior VIP kullanıcılarının TOPLAM harcamasıdır (kullanıcı başına değil). Ay anahtarı
-- uygulamada Europe/Istanbul takvimine göre üretilir ("YYYY-MM"); geçmiş aylar silinmez.
-- Diğer yapay zekâ özellikleri (ai_usage_logs) bu deftere yazılmaz.

create table if not exists public.junior_vip_budget_settings (
  id integer primary key default 1 check (id = 1),
  monthly_limit_usd numeric(10, 4) not null default 15,
  -- Sınırın bu kadar altında yeni ücretli çağrılar durur (tahmin hatası payı)
  safety_margin_usd numeric(10, 4) not null default 0.50,
  -- Aynı anda açık (henüz mutabakatı yapılmamış) en fazla ücretli çağrı
  max_in_flight integer not null default 6,
  updated_at timestamptz not null default now()
);
insert into public.junior_vip_budget_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.junior_vip_ai_ledger (
  id uuid primary key default gen_random_uuid(),
  month_key text not null,
  service text not null check (service in ('chat', 'transcribe', 'tts', 'other')),
  provider text not null default 'openai',
  model text not null,
  status text not null default 'reserved' check (status in ('reserved', 'settled', 'released')),
  reserved_usd numeric(12, 6) not null check (reserved_usd >= 0),
  actual_usd numeric(12, 6),
  input_tokens integer,
  output_tokens integer,
  audio_seconds numeric(10, 2),
  panel text,
  error_code text,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists junior_vip_ai_ledger_month_idx on public.junior_vip_ai_ledger (month_key, status);

alter table public.junior_vip_budget_settings enable row level security;
alter table public.junior_vip_ai_ledger enable row level security;

/**
 * Atomik bütçe ayırma. Aynı ay için advisory lock ile sıraya girer; paralel istekler sınırı aşamaz.
 * Harcanmış sayılan tutar = mutabakatı yapılmış gerçek tutarlar + açık rezervasyonların tamamı.
 */
create or replace function public.junior_vip_budget_reserve(
  p_month text,
  p_service text,
  p_model text,
  p_amount numeric,
  p_panel text default null
)
returns table (ok boolean, reservation_id uuid, committed_usd numeric, limit_usd numeric, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit numeric;
  v_margin numeric;
  v_max integer;
  v_committed numeric;
  v_inflight integer;
  v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    return query select false, null::uuid, 0::numeric, 0::numeric, 'invalid_amount'::text;
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('junior_vip_budget:' || p_month));

  select s.monthly_limit_usd, s.safety_margin_usd, s.max_in_flight
    into v_limit, v_margin, v_max
    from public.junior_vip_budget_settings s where s.id = 1;
  if v_limit is null then
    v_limit := 15; v_margin := 0.50; v_max := 6;
  end if;

  select
    coalesce(sum(case when l.status = 'settled' then coalesce(l.actual_usd, l.reserved_usd)
                      when l.status = 'reserved' then l.reserved_usd
                      else 0 end), 0),
    count(*) filter (where l.status = 'reserved' and l.created_at > now() - interval '10 minutes')
    into v_committed, v_inflight
    from public.junior_vip_ai_ledger l
   where l.month_key = p_month;

  if v_inflight >= v_max then
    return query select false, null::uuid, v_committed, v_limit, 'too_many_in_flight'::text;
    return;
  end if;
  if v_committed + p_amount > v_limit - v_margin then
    return query select false, null::uuid, v_committed, v_limit, 'budget_exhausted'::text;
    return;
  end if;

  insert into public.junior_vip_ai_ledger (month_key, service, model, reserved_usd, panel)
  values (p_month, p_service, p_model, p_amount, p_panel)
  returning id into v_id;

  return query select true, v_id, v_committed + p_amount, v_limit, null::text;
end;
$$;

/** Gerçek kullanımla mutabakat. p_actual null ise rezerve tutar harcanmış sayılır (bilinmeyen sonuç). */
create or replace function public.junior_vip_budget_settle(
  p_id uuid,
  p_actual numeric,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_audio_seconds numeric default null,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.junior_vip_ai_ledger
     set status = 'settled',
         actual_usd = coalesce(p_actual, reserved_usd),
         input_tokens = p_input_tokens,
         output_tokens = p_output_tokens,
         audio_seconds = p_audio_seconds,
         error_code = p_error_code,
         settled_at = now()
   where id = p_id and status = 'reserved';
  return found;
end;
$$;

/** Çağrı hiç gönderilmediyse ayrılan pay serbest bırakılır. */
create or replace function public.junior_vip_budget_release(p_id uuid, p_error_code text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.junior_vip_ai_ledger
     set status = 'released', actual_usd = 0, error_code = p_error_code, settled_at = now()
   where id = p_id and status = 'reserved';
  return found;
end;
$$;

revoke all on function public.junior_vip_budget_reserve(text, text, text, numeric, text) from public, anon, authenticated;
revoke all on function public.junior_vip_budget_settle(uuid, numeric, integer, integer, numeric, text) from public, anon, authenticated;
revoke all on function public.junior_vip_budget_release(uuid, text) from public, anon, authenticated;
grant execute on function public.junior_vip_budget_reserve(text, text, text, numeric, text) to service_role;
grant execute on function public.junior_vip_budget_settle(uuid, numeric, integer, integer, numeric, text) to service_role;
grant execute on function public.junior_vip_budget_release(uuid, text) to service_role;

-- Hata / geri bildirim olayları (kişisel veri en aza indirilmiş: mesaj metni ve öğrenci kimliği saklanmaz).
create table if not exists public.junior_vip_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  intent text,
  code text,
  panel text,
  -- Öğrenci kimliğinin tuzlu özeti (aynı öğrencinin tekrarlarını saymak için; geri çevrilemez)
  actor_hash text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists junior_vip_events_created_idx on public.junior_vip_events (created_at desc);
create index if not exists junior_vip_events_type_idx on public.junior_vip_events (event_type, created_at desc);
alter table public.junior_vip_events enable row level security;
