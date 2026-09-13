-- Facebook kanalı + iç not + hazır yanıt (Kommo inbox karşılığı)
ALTER TABLE public.crm_conversations DROP CONSTRAINT IF EXISTS crm_conversations_channel_check;
ALTER TABLE public.crm_conversations ADD CONSTRAINT crm_conversations_channel_check
  CHECK (channel IN ('whatsapp', 'instagram', 'facebook'));

ALTER TABLE public.registration_channel_messages DROP CONSTRAINT IF EXISTS registration_channel_messages_channel_check;
ALTER TABLE public.registration_channel_messages ADD CONSTRAINT registration_channel_messages_channel_check
  CHECK (channel IN ('whatsapp', 'instagram', 'facebook'));

ALTER TABLE public.registration_leads ADD COLUMN IF NOT EXISTS facebook_psid text;

CREATE TABLE IF NOT EXISTS public.crm_conversation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.crm_conversations(id) ON DELETE CASCADE,
  author_user_id text NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_notes_conv
  ON public.crm_conversation_notes (conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.crm_canned_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NULL,
  title text NOT NULL,
  body text NOT NULL,
  channel text NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.crm_canned_replies (title, body, sort_order)
SELECT v.title, v.body, v.sort_order
FROM (VALUES
  ('Karşılama', 'Merhaba, Online VIP Dershane. Size nasıl yardımcı olabilirim?', 10),
  ('Deneme dersi', 'Ücretsiz tanışma / deneme dersi planlayalım. Uygun olduğunuz gün ve saati yazar mısınız?', 20),
  ('LGS bilgi', 'LGS programımız küçük grup + koçluk. Sınıf ve hedef liseyi yazın, size uygun grubu ileteyim.', 30),
  ('YKS bilgi', 'TYT–AYT programı için sınıf ve hedef bölümü paylaşın; kontenjan ve deneme dersini ayarlayalım.', 40),
  ('Fiyat yönlendirme', 'Ücret, grup ve kontenjanı netleştirmek için öğrencinin sınıfı ile iki zayıf dersini yazar mısınız?', 50),
  ('Randevu teyit', 'Görüşmeyi not aldım. Saatinden 10 dk önce Zoom / ders linkini ileteceğim.', 60),
  ('Takip', 'Dün yazmıştım — uygun bir saatiniz oldu mu? 10 dakikalık kısa bir görüşme yeterli.', 70),
  ('Ulaşılamadı', 'Olduğunuz yerden olmak istediğiniz yere… Size ulaşamadık. Uygun bir saatte bizi arayabilir veya bu mesaja yanıt verebilirsiniz.', 80)
) AS v(title, body, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.crm_canned_replies LIMIT 1);
