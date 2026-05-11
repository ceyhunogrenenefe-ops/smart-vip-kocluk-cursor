-- Veli sözleşmesi: şablonda sözleşme türü + ek metin; kayıtta tür, anlık ek metin ve öğrenci kartı bağlantısı

ALTER TABLE public.parent_sign_class_presets
  ADD COLUMN IF NOT EXISTS sozlesme_turu TEXT NOT NULL DEFAULT 'satis_sozlesmesi';

ALTER TABLE public.parent_sign_class_presets
  ADD COLUMN IF NOT EXISTS sozlesme_ozel_baslik TEXT NOT NULL DEFAULT '';

ALTER TABLE public.parent_sign_class_presets
  ADD COLUMN IF NOT EXISTS sablon_ek_detay TEXT NOT NULL DEFAULT '';

ALTER TABLE public.parent_sign_contracts
  ADD COLUMN IF NOT EXISTS sozlesme_turu TEXT NOT NULL DEFAULT 'satis_sozlesmesi';

ALTER TABLE public.parent_sign_contracts
  ADD COLUMN IF NOT EXISTS sozlesme_basligi TEXT NOT NULL DEFAULT '';

ALTER TABLE public.parent_sign_contracts
  ADD COLUMN IF NOT EXISTS preset_id UUID NULL;

ALTER TABLE public.parent_sign_contracts
  ADD COLUMN IF NOT EXISTS sablon_ek_detay_snapshot TEXT NOT NULL DEFAULT '';

ALTER TABLE public.parent_sign_contracts
  ADD COLUMN IF NOT EXISTS student_id TEXT NULL;

COMMENT ON COLUMN public.parent_sign_class_presets.sozlesme_turu IS 'kullanici_sozlesmesi | satis_sozlesmesi | diger';
COMMENT ON COLUMN public.parent_sign_class_presets.sablon_ek_detay IS 'Kurum metni (düz metin, satır sonları paragraf olur)';
COMMENT ON COLUMN public.parent_sign_contracts.sablon_ek_detay_snapshot IS 'Oluşturma anındaki şablon ek metni (şablon değişse de belge sabit kalır)';
COMMENT ON COLUMN public.parent_sign_contracts.student_id IS 'students.id — kullanıcı yönetimindeki öğrenci kartı ile eşleşme';
