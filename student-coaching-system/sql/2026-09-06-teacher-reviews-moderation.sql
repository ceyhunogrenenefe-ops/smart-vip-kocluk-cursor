-- Öğretmen yorumları: admin onayı + tamamlanan ders sayısı + veli WhatsApp daveti şablonu
-- Supabase SQL Editor'da bir kez çalıştırın.

ALTER TABLE public.teacher_reviews
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.teacher_reviews
  DROP CONSTRAINT IF EXISTS teacher_reviews_moderation_status_check;

ALTER TABLE public.teacher_reviews
  ADD CONSTRAINT teacher_reviews_moderation_status_check
  CHECK (moderation_status IN ('pending', 'approved', 'rejected'));

ALTER TABLE public.teacher_reviews
  ADD COLUMN IF NOT EXISTS approved_at timestamptz NULL;

ALTER TABLE public.teacher_reviews
  ADD COLUMN IF NOT EXISTS approved_by text NULL REFERENCES public.users(id) ON DELETE SET NULL;

-- Mevcut herkese açık kayıtlar onaylı sayılsın
UPDATE public.teacher_reviews
SET moderation_status = 'approved',
    approved_at = COALESCE(approved_at, created_at)
WHERE is_public = true
  AND moderation_status = 'pending';

-- Yeni yorumlar varsayılan gizli (onaya kadar)
ALTER TABLE public.teacher_reviews
  ALTER COLUMN is_public SET DEFAULT false;

ALTER TABLE public.teacher_profiles
  ADD COLUMN IF NOT EXISTS completed_lessons_count integer NOT NULL DEFAULT 0;

UPDATE public.teacher_profiles tp
SET completed_lessons_count = COALESCE(c.cnt, 0)
FROM (
  SELECT teacher_id, COUNT(*)::integer AS cnt
  FROM public.teacher_lessons
  WHERE status = 'completed'
  GROUP BY teacher_id
) c
WHERE tp.user_id = c.teacher_id;

CREATE INDEX IF NOT EXISTS idx_teacher_reviews_moderation_pending
  ON public.teacher_reviews (created_at DESC)
  WHERE moderation_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_teacher_lessons_completed_teacher
  ON public.teacher_lessons (teacher_id)
  WHERE status = 'completed';

ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS meta_named_body_parameters BOOLEAN;

-- Meta Business Manager — şablon oluşturma:
-- Ad: ogretmen_yorum_daveti
-- Kategori: UTILITY / Dil: tr
-- Gövde:
-- Sayın {{parent_name}},
--
-- {{student_name}} öğrencimizin {{teacher_name}} öğretmenimizle dersi tamamlandı.
-- Lütfen öğretmenimizi değerlendirin:
-- {{review_link}}
--
-- Online VIP Dershane

INSERT INTO message_templates (
  name,
  type,
  content,
  variables,
  twilio_variable_bindings,
  channel,
  is_active,
  meta_template_name,
  meta_template_language,
  meta_named_body_parameters,
  updated_at
)
VALUES (
  'Öğretmen yorum daveti (ders sonrası · veli)',
  'teacher_review_invite',
  'Sayın {{parent_name}},

{{student_name}} öğrencimizin {{teacher_name}} öğretmenimizle dersi tamamlandı.
Lütfen öğretmenimizi değerlendirin:
{{review_link}}

Online VIP Dershane',
  '["parent_name","student_name","teacher_name","review_link"]'::jsonb,
  '["parent_name","student_name","teacher_name","review_link"]'::jsonb,
  'whatsapp',
  true,
  'ogretmen_yorum_daveti',
  'tr',
  true,
  NOW()
)
ON CONFLICT (type) DO UPDATE SET
  name = EXCLUDED.name,
  content = EXCLUDED.content,
  variables = EXCLUDED.variables,
  twilio_variable_bindings = EXCLUDED.twilio_variable_bindings,
  channel = EXCLUDED.channel,
  is_active = EXCLUDED.is_active,
  meta_template_name = EXCLUDED.meta_template_name,
  meta_template_language = EXCLUDED.meta_template_language,
  meta_named_body_parameters = COALESCE(EXCLUDED.meta_named_body_parameters, message_templates.meta_named_body_parameters),
  updated_at = NOW();

COMMENT ON COLUMN public.teacher_reviews.moderation_status IS
  'pending = admin onayı bekliyor; approved = sitede yayın; rejected = reddedildi';
COMMENT ON COLUMN public.teacher_profiles.completed_lessons_count IS
  'Tamamlanan özel ders sayısı (vitrin Ders alanı)';

NOTIFY pgrst, 'reload schema';
