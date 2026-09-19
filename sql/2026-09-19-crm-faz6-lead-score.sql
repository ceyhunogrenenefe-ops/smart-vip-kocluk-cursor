-- FAZ 6: lead puanı için yer tutucu kolon (yalnız ekleme; otomatik hesaplanmıyor)
alter table public.registration_leads add column if not exists lead_score integer;
comment on column public.registration_leads.lead_score is 'FAZ 6: ileride lead puanlama için (0-100). Şimdilik boş; otomatik hesaplanmıyor.';
