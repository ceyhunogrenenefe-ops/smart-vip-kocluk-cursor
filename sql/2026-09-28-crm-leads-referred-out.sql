-- Kurum dışına yönlendirilen lead'ler (uygulandı).
--
-- Amaç: kurum dışına yönlendirdiğimiz kayıtlar kurum içi satış performansına
-- karışmasın — özellikle "dönüş yapılmadı" sayısına.
--
-- Yalnızca kolon ve yeni bir stage değeri eklenir. Mevcut kolonlar, veriler ve
-- mevcut 20 stage değeri aynen korunur.
--
-- NOT: is_internal kolonu ile karıştırılmamalı — o, kontağın kurum personeli /
-- öğrencisi olup olmadığını söyler (dashboard zaten is_internal = false süzer).
-- Buradaki ayrım farklı bir eksen: lead kurum içinde mi sonuçlandırılıyor,
-- yoksa dışarıya mı yönlendirildi.
--
-- İletişim durumları (Dönüş yapılmadı / Yapıldı / Görüşmede / Tekrar aranacak /
-- Deneme / Kayıt / Olumsuz) için YENİ ALAN AÇILMADI: mevcut stage ve
-- primary_status alanlarından türetiliyor (crm-ops-metrics.js →
-- classifyLeadContactStatus).

alter table public.registration_leads
  add column if not exists referred_out_at timestamptz,
  add column if not exists referred_out_by text,
  add column if not exists referred_out_reason text,
  add column if not exists referred_out_target text;

create index if not exists registration_leads_referred_out_idx
  on public.registration_leads (institution_id, referred_out_at desc)
  where referred_out_at is not null;

alter table public.registration_leads drop constraint if exists registration_leads_stage_check;
alter table public.registration_leads add constraint registration_leads_stage_check check (stage = any (array[
  'new_lead', 'first_contact_pending', 'first_contact_completed', 'presentation_scheduled',
  'trial_lesson_scheduled', 'trial_lesson_completed', 'offer_sent', 'considering', 'follow_up',
  'payment_pending', 'postponed', 'confirmed', 'lost',
  'needs_identified', 'program_offered', 'spouse_discussion', 'registration_pending',
  'no_response', 'unreachable', 'not_interested',
  'referred_out'
]));

notify pgrst, 'reload schema';
