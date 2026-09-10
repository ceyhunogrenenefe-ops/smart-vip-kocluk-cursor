-- Yoklama Meta Utility şablonları (veli güncelleme + koç özeti + koç late delta)
-- RUN IN SUPABASE SQL EDITOR
-- Meta Business Manager'da onay gerekir; panelden "Meta'ya gönder" veya action submit_attendance_templates

ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS meta_named_body_parameters BOOLEAN;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS meta_template_name text;
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS meta_template_language text;

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
VALUES
(
  'Yoklama durumu güncelleme (veli — geç katıldı)',
  'attendance_status_update',
  E'🕐 YOKLAMA GÜNCELLEMESİ\nÖğrenci: {{student_name}}\nSınıf: {{class_name}}\nDers: {{lesson_name}}\nÖğrencimiz derse geç katılmıştır.\nDurum: {{attendance_status}}\nKamera: {{camera_status}}',
  '["student_name","class_name","lesson_name","attendance_status","camera_status"]'::jsonb,
  '["student_name","class_name","lesson_name","attendance_status","camera_status"]'::jsonb,
  'whatsapp',
  true,
  'attendance_status_update',
  'tr',
  true,
  NOW()
),
(
  'Koç ders yoklama özeti',
  'coach_lesson_attendance_summary',
  E'📋 DERS YOKLAMA RAPORU\n🏫 Sınıf: {{class_name}}\n📚 Ders: {{lesson_name}}\n👨‍🏫 Öğretmen: {{teacher_name}}\n👤 Koç: {{coach_name}}\n📅 {{lesson_date_time}}\n👥 Toplam: {{total_students}}\n✅ Katılan: {{present_count}}\n🕐 Geç: {{late_count}}\n❌ Katılmayan: {{absent_count}}\n🎥 Kamera açık: {{camera_open_count}}\n🚫 Kamera kapalı: {{camera_closed_count}}\n\n✅ KATILAN\n{{present_students}}\n\n🕐 GEÇ KATILAN\n{{late_students}}\n\n❌ KATILMAYAN\n{{absent_students}}\n\n🎥 KAMERA AÇIK\n{{camera_open_students}}\n\n🚫 KAMERA KAPALI\n{{camera_closed_students}}\n\nOnline VIP Dershane',
  '["class_name","lesson_name","teacher_name","coach_name","lesson_date_time","total_students","present_count","late_count","absent_count","camera_open_count","camera_closed_count","present_students","late_students","absent_students","camera_open_students","camera_closed_students"]'::jsonb,
  '["class_name","lesson_name","teacher_name","coach_name","lesson_date_time","total_students","present_count","late_count","absent_count","camera_open_count","camera_closed_count","present_students","late_students","absent_students","camera_open_students","camera_closed_students"]'::jsonb,
  'whatsapp',
  true,
  'coach_lesson_attendance_summary',
  'tr',
  true,
  NOW()
),
(
  'Koç yoklama güncelleme (geç katılım)',
  'attendance_coach_late_update',
  E'🕐 YOKLAMA GÜNCELLEMESİ\n🏫 {{class_name}}\n📚 {{lesson_name}}\n{{student_name}} daha önce “Katılmadı” olarak işaretlenmişti.\nGüncel durum: {{attendance_status}}\nKamera: {{camera_status}}\nGüncel katılım: {{present_total}}',
  '["class_name","lesson_name","student_name","attendance_status","camera_status","present_total"]'::jsonb,
  '["class_name","lesson_name","student_name","attendance_status","camera_status","present_total"]'::jsonb,
  'whatsapp',
  true,
  'attendance_coach_late_update',
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
  meta_named_body_parameters = true,
  updated_at = NOW();

-- Yeni kind'lar için unique index (eski kind'lar da kalsın)
CREATE UNIQUE INDEX IF NOT EXISTS uq_message_logs_attendance_status_update_sent
  ON message_logs (related_id, student_id, kind)
  WHERE status = 'sent'
    AND kind = 'attendance_status_update'
    AND related_id IS NOT NULL
    AND student_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_message_logs_coach_lesson_summary_sent
  ON message_logs (related_id, kind)
  WHERE status = 'sent'
    AND kind = 'coach_lesson_attendance_summary'
    AND related_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_message_logs_attendance_coach_late_sent
  ON message_logs (related_id, student_id, kind)
  WHERE status = 'sent'
    AND kind = 'attendance_coach_late_update'
    AND related_id IS NOT NULL
    AND student_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
