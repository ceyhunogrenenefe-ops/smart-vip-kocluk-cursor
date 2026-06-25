-- Öğretmen grup dersi birim ücreti (40 dk periyot başına TL)
CREATE TABLE IF NOT EXISTS teacher_group_lesson_rates (
  teacher_id text NOT NULL,
  institution_id uuid NULL,
  unit_price_tl numeric(10, 2) NOT NULL DEFAULT 500 CHECK (unit_price_tl > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id)
);

CREATE INDEX IF NOT EXISTS idx_teacher_group_lesson_rates_institution
  ON teacher_group_lesson_rates (institution_id);

COMMENT ON TABLE teacher_group_lesson_rates IS 'Grup dersi ödeme özeti — öğretmen başına 40 dk birim ders ücreti (TL)';
