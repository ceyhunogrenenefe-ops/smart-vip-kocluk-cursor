-- Kurum bazlı CRM lisansı. Platform kurumu kodda her zaman açıktır.
alter table public.institution_features
  add column if not exists crm_module boolean not null default false;
