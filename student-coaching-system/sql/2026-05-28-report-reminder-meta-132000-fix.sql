-- Meta (#132000) "Number of parameters does not match" — report_reminder
-- Nedeni: 2026-05-14 güncellemesi variables = ["student_name","studentName"] iken
-- Meta BM şablonu genelde TEK gövde değişkeni ({{1}}) kullanır; iki parametre gönderilince 132000 oluşur.
-- Çözüm: bağlama listesini tek anahtara indirin; Meta’daki değişken sayısı ile birebir eşleşmeli.

UPDATE message_templates
SET
  variables = '["student_name"]'::jsonb,
  twilio_variable_bindings = '["student_name"]'::jsonb,
  updated_at = NOW()
WHERE type = 'report_reminder';

COMMENT ON COLUMN message_templates.variables IS
  'Meta gövde {{n}} sırası: öğe sayısı Meta şablonundaki gövde değişken sayısı ile aynı olmalı (#132000).';

NOTIFY pgrst, 'reload schema';
