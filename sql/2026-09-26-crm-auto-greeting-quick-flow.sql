-- Otomatik Karşılama: seçmeli (buton) akış + 3 dakikalık danışman takibi.
--
-- Neden: numaralı "1) 2) 3)" listesi müşteriye amatör görünüyordu ve akış
-- gereksiz uzundu. Artık kademe → sınıf iki adımda butonla seçiliyor, sınıf
-- seçilir seçilmez "eğitim danışmanımız iletişime geçecek" mesajı gidiyor.
-- Sınıf form/reklam kaydından biliniyorsa hiç sorulmuyor. Hiç seçim
-- yapılmazsa aynı mesaj followup_minutes (varsayılan 3) sonra gönderiliyor.
--
-- Yalnızca kolon eklenir; mevcut ayarlar, oturumlar ve metinler korunur.
-- Eski saat aralığı akışı ask_call_slot=true ile geri açılabilir.

alter table public.crm_auto_greeting_settings
  add column if not exists use_interactive boolean not null default true,
  add column if not exists ask_call_slot boolean not null default false,
  add column if not exists followup_minutes integer not null default 3,
  add column if not exists consultant_text text,
  add column if not exists grade_text text,
  add column if not exists skip_grade_when_known boolean not null default true;

alter table public.crm_auto_greeting_sessions
  add column if not exists grade_level text,
  add column if not exists followup_due_at timestamptz,
  add column if not exists followup_sent_at timestamptz,
  add column if not exists grade_source text;

create index if not exists crm_auto_greeting_sessions_followup_idx
  on public.crm_auto_greeting_sessions (followup_due_at)
  where followup_due_at is not null and followup_sent_at is null;

notify pgrst, 'reload schema';
