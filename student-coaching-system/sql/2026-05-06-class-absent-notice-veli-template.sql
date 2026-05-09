-- Grup dersi devamsızlık WhatsApp metni: yalnızca veli numarası (parent_phone); şablon değişkenleri genişletildi.
update message_templates
set
  name = 'Devamsızlık bildirimi (veli)',
  content =
    'Sayın veli, {{student_name}} {{lesson_date}} tarihinde {{lesson_time}} başlangıçlı {{class_name}} sınıfı {{subject}} grup canlı dersine katılmamıştır (yoklama: gelmedi).',
  variables = '["student_name","class_name","subject","lesson_date","lesson_time"]'::jsonb
where type = 'class_absent_notice';

notify pgrst, 'reload schema';
