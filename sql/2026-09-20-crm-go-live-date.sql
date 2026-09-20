-- CRM canlı kullanım başlangıcı (yalnız ekleme): bu tarihten önceki lead / konuşmalar
-- otomatik atamaya, Bugün-SLA paneline ve personel WhatsApp uyarılarına girmez.
alter table public.crm_settings add column if not exists go_live_date date;
comment on column public.crm_settings.go_live_date is 'CRM canlı kullanım başlangıcı: bu tarihten önceki lead/konuşmalar otomatik atama, SLA paneli ve WhatsApp uyarılarına dahil edilmez.';
update public.crm_settings set go_live_date = date '2026-09-20', updated_at = now()
where institution_id = '73323d75-eea1-4552-8bba-d50555423589' and go_live_date is null;
