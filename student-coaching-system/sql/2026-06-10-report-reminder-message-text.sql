-- Günlük rapor hatırlatma mesajı (gateway + Meta şablon gövdesi)
UPDATE message_templates
SET
  content = 'Merhaba {{student_name}}, bugün günlük raporunuzu henüz girmediniz. Lütfen Online Vip Ders Koçluk üzerinden haftalık takibinizi tamamlayın.',
  updated_at = NOW()
WHERE type = 'report_reminder';
