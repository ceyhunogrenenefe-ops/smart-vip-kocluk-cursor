-- Misafir öğrenciler — canlı derse kayıtlı öğrenci listesi dışından katılanlar.
-- Supabase SQL Editor'da çalıştırın. Mevcut tablolara dokunmaz, yalnız yeni tablo ekler.
--
-- Neden ayrı tablo: class_session_attendance.student_id kayıtlı bir öğrenciye
-- bağlıdır, misafirin ise henüz öğrenci kaydı yoktur. Misafir dersten derse
-- takip edilebilsin ve sonradan öğrenciye dönüştürülebilsin diye kendi tablosu
-- var; yoklama tablosu olduğu gibi kalır.
--
-- TÜR NOTU: class_sessions.institution_id uuid, institutions.id ise text.
-- İkisi uyuşmadığı için institution_id burada text tutulur ve FK verilmez.

CREATE TABLE IF NOT EXISTS public.class_session_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id uuid NOT NULL REFERENCES public.class_sessions(id) ON DELETE CASCADE,
  class_id uuid NULL,
  -- FK yok: üstteki tür notuna bakın
  institution_id text NULL,

  -- Derste göründüğü ad ve eşleştirme için sadeleştirilmiş hâli
  display_name text NOT NULL,
  normalized_name text NOT NULL,

  -- suspected: sistem tespit etti, onay bekliyor
  -- confirmed: öğretmen/yönetici misafir olarak onayladı
  -- dismissed: misafir değil (işaret kaldırıldı)
  status text NOT NULL DEFAULT 'suspected',

  -- Derse nasıl geldi
  -- auto: katılımcı listesinde eşleşmeyen ad · link: ders linkiyle
  -- admin: yönetici ekledi · teacher: öğretmen işaretledi · trial: deneme dersi
  source text NOT NULL DEFAULT 'auto',

  minutes_present integer NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),

  -- Öğrenciye dönüştürülünce geçmiş kaybolmasın diye bağlanır
  student_id text NULL REFERENCES public.students(id) ON DELETE SET NULL,
  converted_at timestamptz NULL,
  converted_by text NULL REFERENCES public.users(id) ON DELETE SET NULL,

  marked_by text NULL REFERENCES public.users(id) ON DELETE SET NULL,
  marked_at timestamptz NULL,
  note text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT class_session_guests_status_chk
    CHECK (status IN ('suspected', 'confirmed', 'dismissed')),
  CONSTRAINT class_session_guests_source_chk
    CHECK (source IN ('auto', 'link', 'admin', 'teacher', 'trial')),
  CONSTRAINT class_session_guests_name_chk
    CHECK (length(trim(display_name)) > 0 AND length(trim(normalized_name)) > 0)
);

-- Aynı derste aynı kişi iki kez açılmasın; otomatik tespit tekrar çalışsa da
-- mevcut satırı günceller
CREATE UNIQUE INDEX IF NOT EXISTS uq_class_session_guests_session_name
  ON public.class_session_guests (session_id, normalized_name);

-- Yönetici tablosu: kuruma ve duruma göre listeleme
CREATE INDEX IF NOT EXISTS idx_class_session_guests_inst_status
  ON public.class_session_guests (institution_id, status);

-- "İlk kez mi katılıyor / daha önce kaç derse katıldı" sayımı
CREATE INDEX IF NOT EXISTS idx_class_session_guests_name
  ON public.class_session_guests (normalized_name);

CREATE INDEX IF NOT EXISTS idx_class_session_guests_session
  ON public.class_session_guests (session_id);

CREATE INDEX IF NOT EXISTS idx_class_session_guests_student
  ON public.class_session_guests (student_id)
  WHERE student_id IS NOT NULL;

COMMENT ON TABLE public.class_session_guests IS
  'Canlı derse kayıtlı öğrenci listesi dışından katılanlar; öğretmen onayıyla misafir statüsüne geçer, sonradan öğrenciye dönüştürülebilir.';
COMMENT ON COLUMN public.class_session_guests.status IS
  'suspected (otomatik tespit, onay bekler) | confirmed (misafir) | dismissed (misafir değil).';
COMMENT ON COLUMN public.class_session_guests.source IS
  'auto | link | admin | teacher | trial — derse giriş yöntemi.';
COMMENT ON COLUMN public.class_session_guests.student_id IS
  'Öğrenciye dönüştürüldüyse hedef öğrenci; geçmiş katılımlar bu kayda bağlanır.';

NOTIFY pgrst, 'reload schema';
