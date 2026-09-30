-- WhatsApp / Meta şablon yöneticisi — message_templates genişletmesi
-- Geriye uyumlu: yalnız kolon/indeks EKLER. Hiçbir kolon düşürülmez,
-- hiçbir veri silinmez, mevcut satırlar olduğu gibi kalır.
-- Supabase'e "whatsapp_template_manager" adıyla uygulanmıştır; bu dosya
-- depodaki izlenebilir kopyadır.

alter table public.message_templates
  add column if not exists category text,
  add column if not exists header_type text default 'NONE',
  add column if not exists header_text text,
  add column if not exists header_media_handle text,
  add column if not exists header_media_url text,
  add column if not exists header_example text,
  add column if not exists footer_text text,
  add column if not exists buttons jsonb default '[]'::jsonb,
  add column if not exists meta_template_id text,
  add column if not exists rejected_reason text,
  add column if not exists variable_map jsonb default '{}'::jsonb,
  add column if not exists body_examples jsonb default '{}'::jsonb,
  add column if not exists institution_id uuid,
  add column if not exists created_by uuid,
  add column if not exists submitted_at timestamptz;

-- Başlık türü yalnız Meta'nın kabul ettiği değerleri alsın
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'message_templates_header_type_check'
  ) then
    alter table public.message_templates
      add constraint message_templates_header_type_check
      check (header_type is null or header_type in ('NONE','TEXT','IMAGE','VIDEO','DOCUMENT'));
  end if;
end $$;

create index if not exists message_templates_status_idx
  on public.message_templates (whatsapp_template_status);

create index if not exists message_templates_meta_name_idx
  on public.message_templates (meta_template_name, meta_template_language);
