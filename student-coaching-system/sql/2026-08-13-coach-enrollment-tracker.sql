-- Koç bazlı yaz kayıt / geçiş / referans / veli memnuniyet takip tablosu
-- Toplantı ekranı → «Koç kayıt takibi» sekmesi

CREATE TABLE IF NOT EXISTS coach_enrollment_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  period_key text NOT NULL,
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, period_key)
);

CREATE TABLE IF NOT EXISTS coach_enrollment_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES coach_enrollment_periods(id) ON DELETE CASCADE,
  coach_id text NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  -- Manuel girilen sayılar (koçluk toplantısında doldurulur)
  student_count int NULL,
  yaz_kayitli int NULL,
  yaz_kayit_olan int NULL,
  gecis_8_9 int NULL,
  gecis_8_9_kayit int NULL,
  veli_sayisi int NULL,
  referans_istenen int NULL,
  referans_alinan int NULL,
  veli_memnuniyet_video int NULL,
  notes text NULL,
  updated_by text NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, coach_id)
);

CREATE INDEX IF NOT EXISTS idx_cem_institution_period
  ON coach_enrollment_metrics (institution_id, period_id);

CREATE INDEX IF NOT EXISTS idx_cem_coach
  ON coach_enrollment_metrics (coach_id);
