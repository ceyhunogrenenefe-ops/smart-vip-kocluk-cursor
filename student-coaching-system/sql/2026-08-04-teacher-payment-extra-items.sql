-- Muhasebe: öğretmen ödemesine ek kalemler (rehberlik, özel ders, soru çözümü vb.)
-- Admin / süper admin — dönem bazlı manuel satırlar

CREATE TABLE IF NOT EXISTS teacher_payment_extra_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id text NOT NULL,
  institution_id uuid NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  kind text NOT NULL
    CHECK (kind IN ('ders', 'rehberlik', 'ozel_ders', 'soru_cozumu', 'diger')),
  label text NULL,
  quantity numeric(10, 2) NOT NULL DEFAULT 1,
  unit_price_tl numeric(12, 2) NOT NULL,
  amount_tl numeric(12, 2) NOT NULL,
  note text NULL,
  created_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teacher_payment_extra_items_period
  ON teacher_payment_extra_items (period_from, period_to);

CREATE INDEX IF NOT EXISTS idx_teacher_payment_extra_items_teacher
  ON teacher_payment_extra_items (teacher_id, period_from, period_to);

CREATE INDEX IF NOT EXISTS idx_teacher_payment_extra_items_institution
  ON teacher_payment_extra_items (institution_id);

COMMENT ON TABLE teacher_payment_extra_items IS
  'Muhasebe öğretmen ödemeleri — grup dersi dışı ek kalemler (rehberlik, özel ders, soru çözümü, diğer)';
