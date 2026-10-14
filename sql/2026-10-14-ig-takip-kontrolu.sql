-- Instagram yorum otomasyonu: takip kontrolü aşaması
--
-- GERİYE UYUMLU: yalnızca yeni sütun eklenir, hepsi nullable veya
-- varsayılanı kapalı. follow_gate_enabled=false olan mevcut otomasyonlar
-- eskisi gibi çalışmaya devam eder.
--
-- PDF mesajı için YENİ sütun açılmaz: mevcut dm_text zaten PDF bağlantısını
-- taşıyan mesajdır. Takip kapısı açıkken dm_text yalnızca doğrulamadan
-- SONRA gönderilir; davet mesajı ayrı alandır ve PDF bağlantısı içermez.

alter table public.crm_comment_automations
  add column if not exists follow_gate_enabled boolean not null default false;

alter table public.crm_comment_automations
  add column if not exists follow_invite_text text;

alter table public.crm_comment_automations
  add column if not exists follow_button_text text;

alter table public.crm_comment_automations
  add column if not exists follow_retry_text text;

alter table public.crm_comment_automations
  add column if not exists follow_retry_button_text text;

-- Aşama takibi (spec 6): her kullanıcının otomasyonun neresinde olduğu
-- invite_sent   : takip daveti gönderildi
-- user_claimed  : kullanıcı "Takip Ettim" dedi (DOĞRULANMIŞ DEĞİL)
-- verified      : Meta API takip ettiğini doğruladı
-- unverified    : Meta API takip etmediğini bildirdi
-- unsupported   : doğrulama teknik olarak yapılamadı (izin/onay yok)
-- pdf_sent      : PDF bağlantısı gönderildi
-- failed        : gönderim başarısız
alter table public.crm_comment_automation_logs
  add column if not exists follow_state text;

alter table public.crm_comment_automation_logs
  add column if not exists follow_checked_at timestamptz;

alter table public.crm_comment_automation_logs
  add column if not exists follow_check_error text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_cal_follow_state_chk') then
    alter table public.crm_comment_automation_logs
      add constraint crm_cal_follow_state_chk
      check (follow_state is null or follow_state in
        ('invite_sent','user_claimed','verified','unverified','unsupported','pdf_sent','failed'));
  end if;
end $$;

-- Buton geri dönüşünde kullanıcıyı otomasyona bağlamak için
create index if not exists crm_cal_ig_user_idx
  on public.crm_comment_automation_logs (ig_user_id, automation_id);
