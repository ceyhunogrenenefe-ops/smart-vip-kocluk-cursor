-- Kurum bazlı WhatsApp gönderim modu.
-- whatsapp_send_mode = 'gateway_only' olan kurumun öğrenci/veli numaralarına
-- Meta (0850) üzerinden mesaj GİTMEZ; mesaj whatsapp_gateway_user_id oturumundan gider,
-- oturum bağlı değilse hiç gönderilmez.
alter table public.institutions
  add column if not exists whatsapp_send_mode text not null default 'default',
  add column if not exists whatsapp_gateway_user_id text;

alter table public.institutions drop constraint if exists institutions_whatsapp_send_mode_check;
alter table public.institutions add constraint institutions_whatsapp_send_mode_check
  check (whatsapp_send_mode in ('default', 'gateway_only'));

-- TÜRKÇE UZMANI: yöneticinin kendi gateway oturumu
update public.institutions
   set whatsapp_send_mode = 'gateway_only',
       whatsapp_gateway_user_id = '6f49db61-676b-41d3-a223-5850337518ca'
 where id = 'f222d8bb-4d46-40b4-b78b-d7c1f1964af7';
